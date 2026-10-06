import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import {
	mockActions,
	openEditorWithVideo,
	openThreeSentences,
	reRecordButton,
	ROOM_TONE,
	seekTo,
	w,
	openTool
} from './editor-helpers'
import { FAKE_MIC_LAUNCH, recordTake } from './fake-mic'

test.use({ launchOptions: FAKE_MIC_LAUNCH })

// One test at a time: takes are recorded against the clock, and the undo
// test's nine real-time exports beside the other test starved its page (a
// 50 ms meter poll answered 370 ms late) and came out a take of 0.9 s, not 1.0.
test.describe.configure({ mode: 'default' })

test('a re-recorded take replaces only its sentence, in playback and export, and cancel or undo restore it', async ({
	page
}) => {
	test.setTimeout(120_000)
	// Four "sentences" of 440 Hz tone: B (2 s) gets a shorter take, so its
	// picture is cut short; C (0.5 s) a longer one, so its last frame holds.
	await mockActions(page, {
		words: [
			w('Alpha.', 0, 1),
			w('Bravo', 1.6, 2.6),
			w('words.', 2.6, 3.6),
			w('Charlie.', 4.2, 4.7),
			w('Delta.', 5.5, 6.5)
		]
	})
	const duration = await openEditorWithVideo(
		page,
		[
			[1, true],
			[0.6, false],
			[2, true],
			[0.6, false],
			[0.5, true],
			[0.8, false],
			[1, true]
		],
		ROOM_TONE
	)
	const reRecord = (at: string) =>
		page.getByRole('button', { name: `Re-record the sentence at ${at}` })
	await openTool(page, 'Transcript')
	await expect(reRecord('0:01')).toBeVisible({ timeout: 30_000 })
	const clip = page.getByRole('region', { name: 'Clips' }).getByRole('option')

	// A sentence with no pause before it says why, and can't be recorded
	// until its join is set by ear.
	await openTool(page, 'Transcript')
	await reRecord('0:00').click()
	const blocked = page.getByRole('region', { name: 'Re-record the sentence at 0:00' })
	await expect(blocked.getByText(/no clear pause before this sentence/)).toBeVisible()
	await expect(blocked.getByRole('button', { name: 'Record' })).toBeDisabled()
	await expect(blocked.getByRole('button', { name: 'Set the join by ear' })).toBeVisible()
	await blocked.getByRole('button', { name: 'Cancel' }).click()

	// Cancel after recording leaves everything as it was.
	await openTool(page, 'Transcript')
	await reRecord('0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()
	await expect(clip).toHaveAttribute('aria-label', /plays 0:06,/)

	// Use the take for B, then one for C.
	await openTool(page, 'Transcript')
	await reRecord('0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await openTool(page, 'Transcript')
	await reRecord('0:04').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(2)
	// 6.5 s, less the 1.2 s of B's tone the shorter take doesn't fill, plus
	// the 0.3 s C's longer take holds the picture for.
	await expect(clip).toHaveAttribute('aria-label', /plays 0:05,/)

	// In the editor, the video goes quiet under C's take, holds C's last
	// frame while the take finishes, then plays on into D with its sound back.
	const video = page.locator('video')
	await seekTo(page, 3.9)
	const samples = await video.evaluate(async (element: HTMLVideoElement) => {
		element.muted = true
		await element.play()
		const seen: Array<{ at: number; paused: boolean; volume: number }> = []
		const started = performance.now()
		while (performance.now() - started < 3000) {
			seen.push({ at: element.currentTime, paused: element.paused, volume: element.volume })
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		element.pause()
		return seen
	})
	const inC = samples.filter((s) => s.at > 4.3 && s.at < 4.6)
	expect(inC.length).toBeGreaterThan(0)
	expect(inC.every((s) => s.volume === 0)).toBe(true)
	const holding = samples.filter((s) => s.paused && s.volume === 0)
	expect(holding.length * 20).toBeGreaterThan(150)
	expect(samples.some((s) => s.at > 5.6 && !s.paused && s.volume === 1)).toBe(true)

	// The export: the take's 880 Hz is heard only where B and C were, the
	// original 440 Hz everywhere else, and it is as long as the edit.
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	const measured = await page.evaluate(
		async (bytes) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			// Goertzel: the strength of one frequency over 100 ms around `at`.
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
			// Export times: A's tone; B's take; the pause after B; C's take; D's tone.
			const probes = [0.5, 2.0, 2.7, 3.4, 5.0]
			return {
				audioSeconds: audio.duration,
				probes: probes.map((at) => ({ at, low: strength(at, 440), high: strength(at, 880) }))
			}
		},
		[...bytes]
	)
	expect(Math.abs(measured.audioSeconds - (duration - 1.2 + 0.3))).toBeLessThan(0.25)
	const [a, b, pause, c, d] = measured.probes
	for (const original of [a, d]) {
		expect(original?.low, `440 Hz at ${original?.at}s`).toBeGreaterThan(0.05)
		expect(original?.high, `no 880 Hz at ${original?.at}s`).toBeLessThan(0.01)
	}
	for (const take of [b, c]) {
		expect(take?.high, `880 Hz at ${take?.at}s`).toBeGreaterThan(0.05)
		expect(take?.low, `no 440 Hz at ${take?.at}s`).toBeLessThan(0.01)
	}
	expect(Math.max(pause?.low ?? 1, pause?.high ?? 1), 'quiet between takes').toBeLessThan(0.01)

	// Undo takes back the last take (C); B's stays, one more Undo away.
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Redo' })).toBeVisible()
})

/** Exports the edit and returns the exported file's length in seconds (its audio track). */
async function exportedSeconds(page: Page): Promise<number> {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	return page.evaluate(
		async (bytes) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			return audio.duration
		},
		[...bytes]
	)
}

const clipOptions = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')

/**
 * The timeline, exactly, where the clips' m:ss labels would round: the
 * trim, every clip's label in order, and how many sentences are re-recorded.
 */
const timelineOf = async (page: Page) => ({
	trimEnd: await page.getByRole('slider', { name: 'Trim end' }).getAttribute('aria-valuenow'),
	clips: await clipOptions(page).evaluateAll((options) =>
		options.map((o) => o.getAttribute('aria-label'))
	),
	reRecorded: await page.getByText('re-recorded', { exact: true }).count()
})

test('undo steps back through several edits, a re-record among them, and redo replays them all', async ({
	page
}) => {
	test.setTimeout(300_000)
	const duration = await openThreeSentences(page)
	await openTool(page, 'Transcript')
	const reRecordB = reRecordButton(page, '0:01')
	const clips = clipOptions(page)
	const trimEnd = page.getByRole('slider', { name: 'Trim end' })
	const undoButton = page.getByRole('button', { name: 'Undo last change' })
	const redoButton = page.getByRole('button', { name: 'Redo' })
	const timeline = () => timelineOf(page)

	// Each step: its timeline, and how long its export should be.
	const steps = [{ timeline: await timeline(), seconds: duration }]
	// 1. Re-record B: its 2 s become the take's 0.8 s.
	await reRecordB.click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
	steps.push({ timeline: await timeline(), seconds: duration - 1.2 })
	// 2. Trim a second off the end, from the keyboard.
	await trimEnd.press('Shift+ArrowLeft')
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// 3. Split at 0.8 s, inside A.
	await seekTo(page, 0.8)
	await page.getByRole('button', { name: 'Split at playhead' }).click()
	await expect(clips).toHaveCount(2)
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// 4. Move the first clip after the second.
	await clips.first().press('Alt+ArrowRight')
	await expect(clips.first()).toHaveAttribute('aria-label', /from 0:00–0:05 of/)
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// Every step looks different on the timeline, so each restore is checked.
	expect(new Set(steps.map((s) => JSON.stringify(s.timeline))).size).toBe(steps.length)

	const expectStep = async (index: number) => {
		const step = steps[index]
		if (!step) throw new Error(`no step ${index}`)
		await expect.poll(timeline).toEqual(step.timeline)
		const seconds = await exportedSeconds(page)
		expect(
			Math.abs(seconds - step.seconds),
			`step ${index}: exported ${seconds.toFixed(2)} s, expected ${step.seconds.toFixed(2)} s`
		).toBeLessThan(0.25)
	}
	await expectStep(4)

	// Ctrl+Z in the command bar is the text field's own undo, not the editor's.
	const command = page.getByRole('textbox', { name: 'Edit command' })
	await openTool(page, 'Assistant')
	await command.fill('cut')
	await command.press('Control+z')
	await expect(redoButton).toBeDisabled()
	await expect.poll(timeline).toEqual(steps[4]?.timeline)

	// Undo all four, by button and by Ctrl+Z.
	await undoButton.click()
	await expectStep(3)
	for (const index of [2, 1, 0]) {
		await page.keyboard.press('Control+z')
		await expectStep(index)
	}
	await expect(undoButton).toBeDisabled()

	// Redo all four, by button, Ctrl+Shift+Z and Ctrl+Y. The re-recorded take
	// comes back from the redo branch: no new recording is made.
	await redoButton.click()
	await expectStep(1)
	await page.keyboard.press('Control+Shift+z')
	await expectStep(2)
	await page.keyboard.press('Control+y')
	await expectStep(3)
	await redoButton.click()
	await expectStep(4)
	await expect(redoButton).toBeDisabled()

	// A new edit after an undo ends the redo branch.
	await undoButton.click()
	await expectStep(3)
	await clips.first().press('Alt+ArrowRight')
	await expect(redoButton).toBeDisabled()
})

test('reset to original removes every edit as one step that Undo brings back, and export ignores the preview speed', async ({
	page
}) => {
	test.setTimeout(180_000)
	const duration = await openThreeSentences(page)
	const resetButton = page.getByRole('button', { name: 'Reset to original' })
	const undoButton = page.getByRole('button', { name: 'Undo last change' })
	const redoButton = page.getByRole('button', { name: 'Redo' })
	const original = await timelineOf(page)
	await expect(resetButton).toHaveCount(0)

	// Re-record B, trim a second off the end, split at 0.8 s.
	await openTool(page, 'Transcript')
	await reRecordButton(page, '0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await page.getByRole('slider', { name: 'Trim end' }).press('Shift+ArrowLeft')
	await seekTo(page, 0.8)
	await page.getByRole('button', { name: 'Split at playhead' }).click()
	await expect(clipOptions(page)).toHaveCount(2)
	const edited = await timelineOf(page)
	expect(edited.reRecorded).toBe(1)

	// It asks first, and Cancel changes nothing.
	const confirm = page.getByRole('status').filter({ hasText: 'Reset to the original take?' })
	await resetButton.click()
	await confirm.getByRole('button', { name: 'Cancel' }).click()
	await expect(confirm).toHaveCount(0)
	await expect.poll(() => timelineOf(page)).toEqual(edited)

	await resetButton.click()
	await confirm.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect.poll(() => timelineOf(page)).toEqual(original)
	await expect(resetButton).toHaveCount(0)
	// One step: one Undo brings back all three edits, the take included,
	// and Redo resets again.
	await undoButton.click()
	await expect.poll(() => timelineOf(page)).toEqual(edited)
	await redoButton.click()
	await expect.poll(() => timelineOf(page)).toEqual(original)
	await undoButton.click()
	await expect.poll(() => timelineOf(page)).toEqual(edited)

	// The preview speed is not an edit: the timeline and the redo branch stay...
	const twice = page.getByRole('button', { name: '2×', exact: true })
	await twice.click()
	await expect(twice).toHaveAttribute('aria-pressed', 'true')
	await expect(redoButton).toBeVisible()
	await expect.poll(() => timelineOf(page)).toEqual(edited)
	// ...and the export runs at 1×: as long as the edit, not half of it.
	const seconds = await exportedSeconds(page)
	expect(
		Math.abs(seconds - (duration - 2.2)),
		`exported ${seconds.toFixed(2)} s, edit ${(duration - 2.2).toFixed(2)} s`
	).toBeLessThan(0.25)
})

/** A take the editor started, as logged by the page: its rate and how long it lasted. */
type TakeLog = {
	rate: number
	endRate: number | null
	takeSeconds: number
	startedAt: number
	endedAt: number | null
	videoAtStart: number
}

type Sample = { wall: number; at: number; rate: number; paused: boolean }

/** Plays from the playhead until the video stops (or `maxSeconds`), sampling time and rate. */
async function playAndSample(page: Page, maxSeconds: number): Promise<Sample[]> {
	return page.locator('video').evaluate(async (element: HTMLVideoElement, maxSeconds) => {
		element.muted = true
		await element.play()
		const STOPPED_FOR_GOOD_MS = 500
		const seen: Sample[] = []
		const started = performance.now()
		let pausedSince: number | null = null
		while (performance.now() - started < maxSeconds * 1000) {
			const paused = element.paused
			const now = performance.now()
			seen.push({ wall: now, at: element.currentTime, rate: element.playbackRate, paused })
			// Stopped for good: paused, not holding a frame under a take, for
			// 0.5 s. At the end of the source the browser pauses the video itself
			// until the editor's next frame jumps on, which a slow frame makes
			// visible: that isn't the end of the edit.
			pausedSince = paused && element.volume !== 0 ? (pausedSince ?? now) : null
			if (pausedSince !== null && now - pausedSince >= STOPPED_FOR_GOOD_MS && seen.length > 5) break
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		element.pause()
		return seen
	}, maxSeconds)
}

/** Source seconds per wall second, over the playing samples between two source times. */
function speedOver(samples: Sample[], from: number, to: number): number {
	const inside = samples.filter((s) => !s.paused && s.at >= from && s.at <= to)
	const first = inside[0]
	const last = inside.at(-1)
	if (!first || !last || last.wall === first.wall) return 0
	return (last.at - first.at) / ((last.wall - first.wall) / 1000)
}

const loggedTakes = async (page: Page): Promise<TakeLog[]> =>
	JSON.parse((await page.evaluate(() => document.documentElement.dataset.takes)) ?? '[]')

test('at 2× preview speed the editor plays twice as fast through jumps, a take and the original view', async ({
	page
}) => {
	test.setTimeout(120_000)
	// Logs every take the editor starts: its rate, length and when it ends.
	await page.addInitScript(() => {
		const takes: TakeLog[] = []
		const save = () => (document.documentElement.dataset.takes = JSON.stringify(takes))
		const start = AudioBufferSourceNode.prototype.start
		AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
			const log: TakeLog = {
				rate: this.playbackRate.value,
				endRate: null,
				takeSeconds: duration ?? 0,
				startedAt: performance.now(),
				endedAt: null,
				videoAtStart: document.querySelector('video')?.currentTime ?? -1
			}
			takes.push(log)
			this.addEventListener('ended', () => {
				log.endedAt = performance.now()
				log.endRate = this.playbackRate.value
				save()
			})
			save()
			return start.call(this, when, offset, duration)
		}
	})
	const duration = await openThreeSentences(page)
	await openTool(page, 'Transcript')
	await reRecordButton(page, '0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	// Split at 0.8 s and move A to the end, so playback jumps back to it.
	await seekTo(page, 0.8)
	await page.getByRole('button', { name: 'Split at playhead' }).click()
	await clipOptions(page).first().press('Alt+ArrowRight')
	await expect(clipOptions(page).first()).toHaveAttribute('aria-label', /from 0:00–0:05 of/)
	await page.getByRole('button', { name: '2×', exact: true }).click()

	const startedBefore = (await loggedTakes(page)).length
	await seekTo(page, 0.8)
	const samples = await playAndSample(page, 8)
	const playing = samples.filter((s) => !s.paused)
	expect(playing.length).toBeGreaterThan(10)
	expect(playing.every((s) => s.rate === 2)).toBe(true)
	// D, after the take, plays at twice real time.
	const speed = speedOver(samples, 4.0, duration - 0.1)
	expect(speed, `D played at ${speed.toFixed(2)}×`).toBeGreaterThan(1.7)
	expect(speed).toBeLessThan(2.3)
	// The jump: from the end of the first clip back to A, which plays last.
	const endOfFirst = samples.findIndex((s) => s.at > duration - 0.3)
	expect(endOfFirst).toBeGreaterThan(-1)
	expect(samples.slice(endOfFirst).some((s) => s.at < 0.7)).toBe(true)

	// The take started as the picture reached B's span, at the video's rate,
	// and ran its whole length at that rate: in sync, not cut short.
	const take = (await loggedTakes(page))[startedBefore]
	expect(take, 'the take played').toBeDefined()
	if (!take) return
	expect(take.rate).toBe(2)
	expect(take.endRate).toBe(2)
	expect(take.videoAtStart).toBeGreaterThan(1.2)
	expect(take.videoAtStart).toBeLessThan(1.7)
	const heardSeconds = ((take.endedAt ?? take.startedAt) - take.startedAt) / 1000
	expect(heardSeconds, `take heard for ${heardSeconds.toFixed(2)} s`).toBeGreaterThan(
		take.takeSeconds / 2 - 0.1
	)
	expect(heardSeconds).toBeLessThan(take.takeSeconds / 2 + 0.15)

	// The original view plays at the preview speed too.
	await page.getByRole('button', { name: 'Original', exact: true }).click()
	await seekTo(page, 0.2)
	const original = await playAndSample(page, 1.5)
	const originalSpeed = speedOver(original, 0.2, duration)
	expect(originalSpeed, `original at ${originalSpeed.toFixed(2)}×`).toBeGreaterThan(1.7)
	expect(originalSpeed).toBeLessThan(2.3)
	expect(original.filter((s) => !s.paused).every((s) => s.rate === 2)).toBe(true)
})

test("a clip's volume applies on top of a re-recorded take, which keeps its level matching", async ({
	page
}) => {
	test.setTimeout(150_000)
	await openThreeSentences(page)
	await openTool(page, 'Transcript')
	await reRecordButton(page, '0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)

	/** The original's 440 Hz in A (0.5 s) and the take's 880 Hz in B (~2.0 s), in an export. */
	const strengths = async () => {
		const downloading = page.waitForEvent('download')
		await page.getByRole('button', { name: 'Export video' }).click()
		const bytes = await readFile(await (await downloading).path())
		await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
		return page.evaluate(
			async (bytes) => {
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
				return { original: strength(0.5, 440), take: strength(2.0, 880) }
			},
			[...bytes]
		)
	}
	const full = await strengths()
	await openTool(page, 'Clip sound and speed')
	const slider = page.getByRole('region', { name: 'Clip sound and speed' }).getByRole('slider')
	await openTool(page, 'Clip sound and speed')
	await slider.fill('50')
	await openTool(page, 'Clip sound and speed')
	await slider.blur()
	const half = await strengths()
	// Both halve: the clip's volume is on top of the take's own gain.
	expect(half.original / full.original).toBeGreaterThan(0.42)
	expect(half.original / full.original).toBeLessThan(0.58)
	expect(half.take / full.take).toBeGreaterThan(0.42)
	expect(half.take / full.take).toBeLessThan(0.58)
	// The take's level against the original's is what it was.
	expect(Math.abs(half.take / half.original - full.take / full.original)).toBeLessThan(
		0.15 * (full.take / full.original)
	)
})
