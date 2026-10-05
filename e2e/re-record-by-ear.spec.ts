import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import {
	mockActions,
	openEditorWithVideo,
	reRecordButton,
	ROOM_TONE,
	seekTo,
	w,
	openTool
} from './editor-helpers'
import { FAKE_MIC_LAUNCH, recordTake } from './fake-mic'

// Its own file, so its real-time recording and export run beside the other
// re-record tests rather than after them in one long serial worker.
test.use({ launchOptions: FAKE_MIC_LAUNCH })

/** Every time the player was sought to, so far (logged by the page). */
const seeks = async (page: Page): Promise<number[]> =>
	JSON.parse((await page.evaluate(() => document.documentElement.dataset.seeks)) ?? '[]')

/** How many takes the editor has started so far (logged by the page). */
const takeStarts = async (page: Page): Promise<number> =>
	JSON.parse((await page.evaluate(() => document.documentElement.dataset.takeStarts)) ?? '[]')
		.length

test('a sentence with no pause gets its joins set by ear, and its take records, plays, exports and undoes like any other', async ({
	page
}) => {
	test.setTimeout(180_000)
	// The video behaves as Chrome does with an MP4 source (measured on
	// Cap.mp4): it reports time to the microsecond, and a seek takes a while,
	// reporting the target meanwhile (sought to 29.080000000000002, it said
	// 29.08 for ~500 ms). The WebM test video otherwise seeks within a frame
	// and reports exactly what was written, which hid the loop this catches.
	await page.addInitScript(() => {
		const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')
		if (!time?.get || !time.set) return
		const { get, set } = time
		const SEEK_MS = 100
		const sought = new WeakMap<HTMLMediaElement, { target: number; at: number }>()
		const micro = (seconds: number) => Math.round(seconds * 1e6) / 1e6
		Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
			get(this: HTMLMediaElement) {
				const seek = sought.get(this)
				if (seek && performance.now() - seek.at < SEEK_MS) return micro(seek.target)
				return micro(get.call(this))
			},
			set(this: HTMLMediaElement, value: number) {
				sought.set(this, { target: value, at: performance.now() })
				// Every seek of the player, for checking where playback seeks.
				if (this === document.querySelector('video')) {
					const seeks: number[] = JSON.parse(document.documentElement.dataset.seeks ?? '[]')
					document.documentElement.dataset.seeks = JSON.stringify([...seeks, value])
				}
				set.call(this, value)
			}
		})
	})
	// Counts every take the editor starts, with where the video was.
	await page.addInitScript(() => {
		const starts: number[] = []
		const save = () => (document.documentElement.dataset.takeStarts = JSON.stringify(starts))
		const start = AudioBufferSourceNode.prototype.start
		AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
			starts.push(document.querySelector('video')?.currentTime ?? -1)
			save()
			return start.call(this, when, offset, duration)
		}
	})
	// A (0–1 s) runs straight into B (1–3 s): a 440 Hz tone that dips for
	// just 20 ms between them, too short to be a pause (40 ms is the least),
	// as words run together. So B has no pause before it. Then a pause, and C.
	await mockActions(page, {
		words: [w('Alpha.', 0, 1), w('Bravo.', 1, 3), w('Charlie.', 3.6, 4.6)]
	})
	const duration = await openEditorWithVideo(
		page,
		[
			[1, true],
			[0.02, false],
			[1.98, true],
			[0.6, false],
			[1, true]
		],
		ROOM_TONE
	)
	await openTool(page, 'Transcript')
	await expect(reRecordButton(page, '0:01')).toBeVisible({ timeout: 30_000 })
	await openTool(page, 'Transcript')
	await reRecordButton(page, '0:01').click()
	const panel = page.getByRole('region', { name: 'Re-record the sentence at 0:01' })
	await expect(panel).toContainText('There is no clear pause before this sentence')
	await expect(panel.getByRole('button', { name: 'Record' })).toBeDisabled()
	await panel.getByRole('button', { name: 'Set the join by ear' }).click()

	// One line says it isn't promised clean; Record is open now.
	await expect(panel).toContainText(
		'A join set by ear isn’t guaranteed to be clean: play the new take in place before you use it.'
	)
	await expect(panel.getByRole('button', { name: 'Record' })).toBeEnabled()
	await expect(panel.getByRole('button', { name: 'Set the join by ear' })).toHaveCount(0)

	// The start join begins at the dip, the quietest moment near the reported
	// edge; the end join in the pause after B.
	const startHandle = panel.getByRole('slider', { name: 'Join before the sentence' })
	const endHandle = panel.getByRole('slider', { name: 'Join after the sentence' })
	const at = async (handle: typeof startHandle) =>
		Number(await handle.getAttribute('aria-valuenow'))
	const startJoin = await at(startHandle)
	expect(Math.abs(startJoin - 1.01)).toBeLessThan(0.03)
	const endJoin = await at(endHandle)
	expect(endJoin).toBeGreaterThan(3)
	expect(endJoin).toBeLessThan(3.6)

	// Handles move 10 ms an arrow, and stop a second past the sentence.
	await startHandle.focus()
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
	expect(await at(startHandle)).toBeCloseTo(startJoin - 0.05, 3)
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
	expect(await at(startHandle)).toBeCloseTo(startJoin, 3)
	await endHandle.focus()
	for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+ArrowRight')
	expect(await at(endHandle)).toBeCloseTo(4, 2)
	for (let i = 0; i < 45; i++) await page.keyboard.press('Shift+ArrowLeft')
	// Nor back past its own view, which starts a second before B's end.
	expect(await at(endHandle)).toBeCloseTo(2, 2)
	for (let i = 0; i < 22; i++) await page.keyboard.press('Shift+ArrowRight')
	const joins = { start: await at(startHandle), end: await at(endHandle) }
	expect(joins.end).toBeCloseTo(3.1, 2)

	// Playing around the start plays the original across that view, and stops at its end.
	await panel.getByRole('button', { name: 'Play around the start' }).click()
	const video = page.locator('video')
	await expect
		.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused && v.currentTime > 1.5), {
			timeout: 5000
		})
		.toBe(true)
	expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(2.1)

	// Record, then use it: the same take path as an automatic sentence.
	await recordTake(page, '0.8')

	// Play with new take plays on through the start join. The join is a
	// computed time (1.0050000000000001 s) that the video reports back a hair
	// earlier (1.005): read exactly, playback froze at the preview's start, or
	// looped at the join restarting the take.
	await panel.getByRole('button', { name: 'Play with new take' }).click()
	await expect
		.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 4000 })
		.toBeGreaterThan(joins.start + 0.3)
	await video.evaluate((v: HTMLVideoElement) => v.pause())
	await panel.getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)

	// The edited video plays through the replaced span and out the other
	// side, starting the take once, and without seeking at the start join:
	// the take's segment carries straight on from the one before (a seek
	// there held an MP4's picture ~0.45 s while the take already spoke).
	const startsBefore = await takeStarts(page)
	await seekTo(page, 0.5)
	const seeksBefore = (await seeks(page)).length
	const reached = await video.evaluate(async (v: HTMLVideoElement) => {
		v.muted = true
		await v.play()
		let furthest = v.currentTime
		const t0 = performance.now()
		while (performance.now() - t0 < 4000) {
			furthest = Math.max(furthest, v.currentTime)
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		v.pause()
		return furthest
	})
	expect(reached, 'playback passes the end join').toBeGreaterThan(joins.end + 0.2)
	expect((await takeStarts(page)) - startsBefore, 'the take started once').toBe(1)
	const atJoin = (await seeks(page))
		.slice(seeksBefore)
		.filter((target) => Math.abs(target - joins.start) < 0.01)
	expect(atJoin, 'no seek at the start join').toEqual([])

	// The export: 880 Hz from the start join for the take's 0.8 s, 440 Hz
	// before it and after the end join; as long as the edit.
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	const measured = await page.evaluate(
		async ({ bytes, probes }) => {
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await new Blob([new Uint8Array(bytes)], { type: 'video/webm' }).arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			const strength = (at: number, hz: number) => {
				const from = Math.floor((at - 0.05) * audio.sampleRate)
				const n = Math.floor(0.1 * audio.sampleRate)
				const coeff = 2 * Math.cos((2 * Math.PI * hz) / audio.sampleRate)
				let s1 = 0
				let s2 = 0
				for (let i = 0; i < n; i++) {
					const s0 = (samples[from + i] ?? 0) + coeff * s1 - s2
					s2 = s1
					s1 = s0
				}
				return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / n
			}
			return {
				audioSeconds: audio.duration,
				probes: probes.map((at) => ({ at, low: strength(at, 440), high: strength(at, 880) }))
			}
		},
		// A before the join; the take; C, after the pause that follows the end join.
		{
			bytes: [...bytes],
			probes: [0.5, joins.start + 0.4, joins.start + 0.8 + (3.6 - joins.end) + 0.5]
		}
	)
	const edited = duration - (joins.end - joins.start) + 0.8
	expect(Math.abs(measured.audioSeconds - edited)).toBeLessThan(0.25)
	const [before, take, after] = measured.probes
	for (const original of [before, after]) {
		expect(original?.low, `440 Hz at ${original?.at.toFixed(2)}s`).toBeGreaterThan(0.05)
		expect(original?.high, `no 880 Hz at ${original?.at.toFixed(2)}s`).toBeLessThan(0.01)
	}
	expect(take?.high, `880 Hz at ${take?.at.toFixed(2)}s`).toBeGreaterThan(0.05)
	expect(take?.low, `no 440 Hz at ${take?.at.toFixed(2)}s`).toBeLessThan(0.01)

	// Undo and Redo, like any take; opening the sentence again brings its joins back.
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(0)
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
	await openTool(page, 'Transcript')
	await reRecordButton(page, '0:01').click()
	await expect(panel.getByText(/join set by ear isn’t guaranteed/)).toBeVisible()
	expect(await at(startHandle)).toBeCloseTo(joins.start, 3)
	expect(await at(endHandle)).toBeCloseTo(joins.end, 3)
	await expect(panel.getByText('New take: 0.8 s (')).toBeVisible()
	await panel.getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
})
