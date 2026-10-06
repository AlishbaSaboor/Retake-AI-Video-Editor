import { test, expect, type Page } from '@playwright/test'
import {
	editCommand,
	mockActions,
	openEditorWithVideo,
	seekTo,
	w,
	openTool
} from './editor-helpers'
import { exportVideo, readExportFrames, surelyAfter, surelyBefore } from './export-frames'

// Clip speed, measured on real exports: the file's length, the tone's
// pitch (440 Hz, kept at any speed), and the captions' timing.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

/** How far the exported file's length may be from the edit's (the export warning's tolerance). */
const LENGTH_TOLERANCE_SECONDS = 0.25
const TONE_HZ = 440
/** Pitch read from zero crossings over 0.3 s: within this of 440 is "kept" (2× would be 880, ½× 220). */
const PITCH_TOLERANCE_HZ = 25

const clipRow = (page: Page, n: number) =>
	page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: `Clip ${n}` })

async function splitAt(page: Page, seconds: number) {
	await seekTo(page, seconds)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await openTool(page, 'Clip sound and speed')
	await expect(clipRow(page, 2)).toBeVisible()
}

/** Types a clip's speed: one change, on Enter. */
async function setSpeed(page: Page, n: number, speed: number) {
	await openTool(page, 'Clip sound and speed')
	const input = clipRow(page, n).getByLabel('Speed (×)')
	await openTool(page, 'Assistant')
	await input.fill(String(speed))
	await input.press('Enter')
	await expect(
		page
			.getByRole('region', { name: 'Clips' })
			.getByRole('option')
			.nth(n - 1)
	).toContainText(`${speed}×`)
}

type Exported = {
	seconds: number
	/** Pitch (Hz) of the sound around each asked time. */
	pitch: number[]
	/** White caption pixels in the frame at each asked time. */
	captionWhite: number[]
	/**
	 * The time of the frame the file shows at each asked time: the last one
	 * at or before it, which on a slow machine (fewer frames) can be well
	 * before it. Captions are judged at this time.
	 */
	shown: number[]
}

/** Exports the edit and reads the file: its length, its pitch and its captions at `times`. */
async function exportAndRead(page: Page, times: number[]): Promise<Exported> {
	const bytes = await exportVideo(page)
	const pitch = await page.evaluate(
		async ({ bytes, times }) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			return times.map((at) => {
				const from = Math.max(1, Math.floor((at - 0.15) * audio.sampleRate))
				const to = Math.min(samples.length, Math.floor((at + 0.15) * audio.sampleRate))
				let crossings = 0
				for (let i = from; i < to; i++) {
					if ((samples[i - 1] ?? 0) < 0 && (samples[i] ?? 0) >= 0) crossings++
				}
				return (crossings / (to - from)) * audio.sampleRate
			})
		},
		{ bytes: [...bytes], times }
	)
	// The caption rows, at the bottom below the moving square (y 145–175 of 320×180,
	// written out: the reader runs in the page), counted for white.
	const { seconds, frames } = await readExportFrames(
		page,
		bytes,
		times,
		({ context }) => {
			const data = context.getImageData(0, 145, 320, 30).data
			let white = 0
			for (let i = 0; i < data.length; i += 4) {
				if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 0) > 200 && (data[i + 2] ?? 0) > 200) white++
			}
			return { white }
		},
		{ size: { width: 320, height: 180 } }
	)
	return {
		seconds,
		pitch,
		captionWhite: frames.map((frame) => frame.white),
		shown: frames.map((frame) => frame.shown)
	}
}

function expectLength(exported: Exported, seconds: number) {
	expect(
		Math.abs(exported.seconds - seconds),
		`exported ${exported.seconds.toFixed(2)} s for ${seconds} s`
	).toBeLessThan(LENGTH_TOLERANCE_SECONDS)
}

/** The tone's pitch at the first `count` asked times (the rest may be silence). */
function expectPitchKept(exported: Exported, times: number[], count = times.length) {
	for (const [index, at] of times.slice(0, count).entries()) {
		const hz = exported.pitch[index] ?? 0
		expect(Math.abs(hz - TONE_HZ), `pitch at ${at} s: ${hz.toFixed(0)} Hz`).toBeLessThan(
			PITCH_TOLERANCE_HZ
		)
	}
}

test('a clip at 2× or ½× exports at its played length with its pitch kept, and undoes and resets', async ({
	page
}) => {
	test.setTimeout(180_000)
	await mockActions(page, { words: [] })
	// 4 s of steady 440 Hz tone, split at 2 s.
	await openEditorWithVideo(page, [[4, true]])
	await splitAt(page, 2)

	// Clip 2 at 2×: 2 s + 1 s.
	await setSpeed(page, 2, 2)
	const fast = await exportAndRead(page, [1, 2.5])
	console.log('2x', exported(fast))
	expectLength(fast, 3)
	expectPitchKept(fast, [1, 2.5])

	// Clip 1 at ½× too: 4 s + 1 s.
	await setSpeed(page, 1, 0.5)
	const slow = await exportAndRead(page, [2, 4.5])
	console.log('0.5x', exported(slow))
	expectLength(slow, 5)
	expectPitchKept(slow, [2, 4.5])

	// Each speed was one undo step; reset takes them off.
	await openTool(page, 'Clip sound and speed')
	const speed = (n: number) => clipRow(page, n).getByLabel('Speed (×)')
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(speed(1)).toHaveValue('1')
	await expect(speed(2)).toHaveValue('2')
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect(speed(1)).toHaveValue('0.5')
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await openTool(page, 'Clip sound and speed')
	await expect(clipRow(page, 2)).toHaveCount(0)
	await expect(speed(1)).toHaveValue('1')
})

const exported = (e: Exported) =>
	JSON.stringify({
		seconds: +e.seconds.toFixed(3),
		pitch: e.pitch.map((hz) => Math.round(hz)),
		captionWhite: e.captionWhite
	})

test('the preview plays each clip at its speed, the Original view at 1×', async ({ page }) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page, [[4, true]])
	await splitAt(page, 2)
	await setSpeed(page, 1, 0.5)
	await setSpeed(page, 2, 2)
	const video = page.locator('video')
	/** Plays from `from` (source seconds) for `ms`, sampling [time, rate] each frame. */
	const sample = async (from: number, ms: number) => {
		await seekTo(page, from)
		return video.evaluate(async (element: HTMLVideoElement, ms) => {
			element.muted = true
			const samples: Array<[number, number]> = []
			await element.play()
			const end = performance.now() + ms
			while (performance.now() < end) {
				await new Promise((resolve) => requestAnimationFrame(resolve))
				samples.push([element.currentTime, element.playbackRate])
			}
			element.pause()
			return samples
		}, ms)
	}
	// From 1.6 s: 0.4 s of source at ½× (0.8 s), then into the 2× clip.
	const edited = await sample(1.6, 1500)
	const rateAt = (samples: Array<[number, number]>, test: (t: number) => boolean) => [
		...new Set(samples.filter(([t]) => test(t)).map(([, rate]) => rate))
	]
	expect(rateAt(edited, (t) => t > 1.65 && t < 1.95)).toEqual([0.5])
	expect(rateAt(edited, (t) => t > 2.1)).toEqual([2])
	// Its pitch kept, as in the export.
	expect(await video.evaluate((element: HTMLVideoElement) => element.preservesPitch)).toBe(true)

	await page
		.getByRole('group', { name: 'Compare with the original' })
		.getByRole('button', { name: 'Original' })
		.click()
	const original = await sample(1.6, 800)
	expect(rateAt(original, (t) => t > 1.65)).toEqual([1])
})

test('captions in a sped-up clip keep pace with its words in the export', async ({ page }) => {
	test.setTimeout(150_000)
	// Two sentences of tone, 0.2–1.1 s and 2.3–3.1 s, with silence between.
	await mockActions(page, {
		words: [
			w('Hello', 0.2, 0.6),
			w('there.', 0.6, 1.1),
			w('Second', 2.3, 2.7),
			w('line.', 2.7, 3.1)
		]
	})
	await openEditorWithVideo(page, [
		[1.2, true],
		[1, false],
		[1.2, true],
		[0.6, false]
	])
	await openTool(page, 'Transcript')
	await expect(page.getByRole('button', { name: /Hello there\./ })).toBeVisible({ timeout: 30_000 })
	await openTool(page, 'Captions')
	await page
		.getByRole('region', { name: 'Captions' })
		.getByRole('button', { name: 'Captions' })
		.click()
	await splitAt(page, 2)
	await setSpeed(page, 2, 2)
	// "Second line." is 2.3–3.1 s of source: at 2× in a clip from 2 s, it
	// plays 2.15–2.55 s of the 3 s edit (at 1× it would be 2.3–3.1).
	// Several probes through the caption and after it: a starved export drops
	// frames, and some have to land where the caption is surely on or off.
	// Every 50 ms through and after it: under load several asks land on one frame.
	const times = [0.7, 2.35, ...Array.from({ length: 17 }, (_, i) => +(2.2 + i * 0.05).toFixed(2))]
	const result = await exportAndRead(page, times)
	console.log('captions', exported(result), 'frames of', JSON.stringify(result.shown))
	expectLength(result, 3)
	// The first caption, 0.2–1.1 s, on where its frame surely falls inside it.
	const first = result.shown[0] ?? 0
	if (surelyAfter(first, 0.2) && surelyBefore(first, 1.1)) {
		expect(result.captionWhite[0], `first caption at ${first} s`).toBeGreaterThan(15)
	}
	// The second, at 2× in a clip from 2 s: 2.15–2.55 s of the edit; at 1× it
	// would run 2.3–3.1 s. A frame's picture may be from a little before or
	// after its time (export-frames.ts), and the caption is only 0.4 s long, so:
	// it's seen in some frame near its time; no frame surely after it shows it;
	// and some frame that at 1× would surely show it doesn't.
	const SECOND = { from: 2.15, to: 2.55, at1x: 3.1 }
	const near = result.shown
		.map((shown, index) => ({ shown, white: result.captionWhite[index] ?? 0 }))
		.slice(1)
	const frames = JSON.stringify(near)
	expect(
		near.some(
			({ shown, white }) =>
				white > 15 && !surelyBefore(shown, SECOND.from) && !surelyAfter(shown, SECOND.to)
		),
		`the second caption seen near 2.15–2.55 s: ${frames}`
	).toBe(true)
	for (const { shown, white } of near.filter(({ shown }) => surelyAfter(shown, SECOND.to))) {
		expect(white, `no caption at ${shown} s, after 2.55 s: ${frames}`).toBe(0)
	}
	expect(
		near.some(
			({ shown, white }) =>
				white === 0 && surelyAfter(shown, 2.3) && surelyBefore(shown, SECOND.at1x)
		),
		`a frame without it that at 1× would show it: ${frames}`
	).toBe(true)
	// Pitch in each sentence's tone, clear of its edges: 0.7 s and 2.35 s.
	expectPitchKept({ ...result, pitch: [result.pitch[0] ?? 0, result.pitch[1] ?? 0] }, [0.7, 2.35])
})

test('clip speed works as a typed command, confirmed first and one undo step each', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page, [[4, true]])
	await splitAt(page, 2)
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await openTool(page, 'Assistant')
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await openTool(page, 'Clip sound and speed')
	const speed = (n: number) => clipRow(page, n).getByLabel('Speed (×)')
	await run(
		'make clip 2 play at 2x',
		{ action: 'clip_speed', rate: 2, fromClip: 2 },
		"I'll make clip 2 play at 2×, in the preview and the export, its pitch kept."
	)
	await expect(speed(2)).toHaveValue('2')
	await expect(speed(1)).toHaveValue('1')
	await run(
		'slow the last clip to half speed',
		{ action: 'clip_speed', rate: 0.5, fromClip: 2 },
		"I'll make clip 2 play at 0.5×"
	)
	await expect(speed(2)).toHaveValue('0.5')

	// Out of range is refused, nothing changes.
	await mockActions(page, {
		words: [],
		command: editCommand({ action: 'clip_speed', rate: 8, fromClip: 1 })
	})
	await openTool(page, 'Assistant')
	await command.fill('make clip 1 play at 8x')
	await page.getByRole('button', { name: 'Run' }).click()
	await expect(reply).toContainText('A clip can play from 0.25× to 4×.')
	await reply.getByRole('button', { name: 'OK' }).click()

	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(speed(2)).toHaveValue('2')
	await undo.click()
	await expect(speed(2)).toHaveValue('1')
})
