import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, seekTo } from './editor-helpers'

// Transitions, delete and duplicate, measured on real exports of a video
// made for it: 2 s of red with a 440 Hz tone, then 2 s of blue with an
// 880 Hz tone, split at 2 s into a red clip and a blue clip. The picture's
// colour and the two tones' levels say which clip plays, and how much.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const LENGTH_TOLERANCE_SECONDS = 0.25
const TONE_AMPLITUDE = 0.5
const SECTION_SECONDS = 2
/** The red and blue the two clips measure as in an export (the encoder's own). */
const FULL_RED = 252
const FULL_BLUE = 247

/** Records the red/blue test video in the page and opens the editor with it. */
async function openRedBlue(page: Page) {
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	const bytes = await page.evaluate(async (section) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		const stream = canvas.captureStream(30)
		const audio = new AudioContext()
		await audio.resume()
		const destination = audio.createMediaStreamDestination()
		const oscillator = audio.createOscillator()
		const gain = audio.createGain()
		gain.gain.value = 0.5
		oscillator.connect(gain).connect(destination)
		oscillator.frequency.setValueAtTime(440, audio.currentTime)
		oscillator.frequency.setValueAtTime(880, audio.currentTime + section)
		oscillator.start()
		for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		const stopped = new Promise((resolve) => (recorder.onstop = resolve))
		const startedAt = performance.now()
		const draw = setInterval(() => {
			const elapsed = (performance.now() - startedAt) / 1000
			context.fillStyle = elapsed < section ? '#ff0000' : '#0000ff'
			context.fillRect(0, 0, 320, 180)
		}, 1000 / 30)
		recorder.start(100)
		await new Promise((resolve) => setTimeout(resolve, section * 2 * 1000))
		recorder.stop()
		await stopped
		clearInterval(draw)
		oscillator.stop()
		return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
	}, SECTION_SECONDS)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'red-blue.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await seekTo(page, SECTION_SECONDS)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(clips(page)).toHaveCount(2)
}

const clips = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')
const joinRow = (page: Page, from: number) =>
	page
		.getByRole('region', { name: 'Transitions' })
		.getByRole('group', { name: `Clip ${from} to clip ${from + 1}` })

async function setTransition(page: Page, kind: 'Fade' | 'Dissolve' | 'None', seconds?: number) {
	await joinRow(page, 1).getByRole('button', { name: kind }).click()
	await expect(joinRow(page, 1).getByRole('button', { name: kind })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	if (seconds !== undefined) {
		const field = joinRow(page, 1).getByLabel('Length (s)')
		await field.fill(String(seconds))
		await field.press('Enter')
		await expect(joinRow(page, 1).getByLabel('Length (s)')).toHaveValue(String(seconds))
	}
}

type Probe = {
	at: number
	/**
	 * The time of the frame the file shows at `at`: the last one at or before
	 * it. A slow machine paints fewer frames, so it can be well before `at`;
	 * what the picture should be is judged at this time.
	 */
	shown: number
	/** The picture's mean red and blue, 0–255. */
	red: number
	blue: number
	/** Each tone's level, as a share of its full amplitude. */
	low: number
	high: number
}

/** Exports and reads the file: its length, and at each time its colour and the two tones. */
async function exportAndProbe(page: Page, times: number[]) {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	const result = await page.evaluate(
		async ({ bytes, times, amplitude }) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			/** A tone's amplitude over 40 ms around `at` (Goertzel), as a share of the full one. */
			const level = (at: number, hz: number) => {
				const from = Math.max(0, Math.floor((at - 0.02) * audio.sampleRate))
				const to = Math.min(samples.length, Math.floor((at + 0.02) * audio.sampleRate))
				const w = (2 * Math.PI * hz) / audio.sampleRate
				let re = 0
				let im = 0
				for (let i = from; i < to; i++) {
					re += (samples[i] ?? 0) * Math.cos(w * i)
					im += (samples[i] ?? 0) * Math.sin(w * i)
				}
				return (2 * Math.hypot(re, im)) / Math.max(1, to - from) / amplitude
			}
			const video = Object.assign(document.createElement('video'), {
				src: URL.createObjectURL(blob),
				muted: true
			})
			// On the page (barely visible), so its frames are presented and
			// requestVideoFrameCallback reports each one's time.
			video.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;opacity:0.01'
			document.body.append(video)
			const next = (type: string) =>
				new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
			await next('loadedmetadata')
			if (!Number.isFinite(video.duration)) {
				video.currentTime = 1e9
				while (!Number.isFinite(video.duration)) await next('durationchange')
			}
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const probes: Probe[] = []
			for (const at of times) {
				const presented = new Promise<number>((resolve) => {
					video.requestVideoFrameCallback((_, frame) => resolve(frame.mediaTime))
					setTimeout(() => resolve(Number.NaN), 3000)
				})
				video.currentTime = at
				await next('seeked')
				const shown = await presented
				context.drawImage(video, 0, 0, 320, 180)
				const data = context.getImageData(100, 50, 120, 80).data
				let red = 0
				let blue = 0
				for (let i = 0; i < data.length; i += 4) {
					red += data[i] ?? 0
					blue += data[i + 2] ?? 0
				}
				const pixels = data.length / 4
				probes.push({
					at,
					shown: +shown.toFixed(3),
					red: Math.round(red / pixels),
					blue: Math.round(blue / pixels),
					low: +level(at, 440).toFixed(3),
					high: +level(at, 880).toFixed(3)
				})
			}
			return { seconds: video.duration, probes }
		},
		{ bytes: [...bytes], times, amplitude: TONE_AMPLITUDE }
	)
	console.log('EXPORT', result.seconds.toFixed(3), JSON.stringify(result.probes))
	return result
}

function expectLength(seconds: number, wanted: number) {
	expect(
		Math.abs(seconds - wanted),
		`exported ${seconds.toFixed(2)} s for ${wanted} s`
	).toBeLessThan(LENGTH_TOLERANCE_SECONDS)
}

/** `actual` within `within` of `wanted`, labelled. */
function expectNear(actual: number | undefined, wanted: number, within: number, label: string) {
	expect(Math.abs((actual ?? NaN) - wanted), `${label}: ${actual} for ${wanted}`).toBeLessThan(
		within
	)
}

test('a fade goes through black, picture and sound, and keeps the length', async ({ page }) => {
	test.setTimeout(150_000)
	await openRedBlue(page)
	await setTransition(page, 'Fade', 1)
	const { seconds, probes } = await exportAndProbe(page, [1, 1.75, 2, 2.25, 3])
	expectLength(seconds, 4)
	const [before, fadingOut, black, fadingIn, after] = probes
	expect(before?.red, 'red before the fade').toBeGreaterThan(200)
	// Each frame as bright as the fade is at its own time: down to black at
	// the join (2 s) over half a second, then up again.
	const light = (shown: number | undefined) => Math.min(1, Math.abs((shown ?? NaN) - 2) / 0.5)
	for (const probe of [fadingOut, black, fadingIn]) {
		const red = probe && probe.shown < 2 ? FULL_RED * light(probe.shown) : 0
		const blue = probe && probe.shown >= 2 ? FULL_BLUE * light(probe.shown) : 0
		expectNear(probe?.red, red, 30, `red at ${probe?.at} s (frame of ${probe?.shown} s)`)
		expectNear(probe?.blue, blue, 30, `blue at ${probe?.at} s (frame of ${probe?.shown} s)`)
	}
	// Sampled where the fade is: the darkest is near black.
	expect(Math.min(black?.red ?? 255, black?.blue ?? 255), 'dark at the join').toBeLessThan(80)
	expect(after?.blue, 'blue after').toBeGreaterThan(200)
	// The sound dips with it.
	expectNear(before?.low, 1, 0.12, '440 Hz before')
	expectNear(fadingOut?.low, 0.5, 0.15, '440 Hz half way out')
	expect((black?.low ?? 1) + (black?.high ?? 1), 'silence at the join').toBeLessThan(0.2)
	expectNear(fadingIn?.high, 0.5, 0.15, '880 Hz half way in')
	expectNear(after?.high, 1, 0.12, '880 Hz after')
})

test('a dissolve blends the clips, picture and sound, and shortens the edit by its length', async ({
	page
}) => {
	test.setTimeout(150_000)
	await openRedBlue(page)
	await setTransition(page, 'Dissolve', 1)
	const { seconds, probes } = await exportAndProbe(page, [0.5, 1.5, 2.5])
	expectLength(seconds, 3)
	const [before, middle, after] = probes
	expect(before?.red, 'red before').toBeGreaterThan(200)
	// Blue drawn over red at the dissolve's progress at the frame's own time
	// (it runs 1–2 s of the edit).
	const progress = Math.min(1, Math.max(0, (middle?.shown ?? NaN) - 1))
	const at = `half way (frame of ${middle?.shown} s)`
	expectNear(middle?.red, FULL_RED * (1 - progress), 30, `red ${at}`)
	expectNear(middle?.blue, FULL_BLUE * progress, 30, `blue ${at}`)
	expect(after?.blue, 'blue after').toBeGreaterThan(200)
	expect(after?.red, 'no red after').toBeLessThan(45)
	// Both tones at equal power half way: ~0.71 each.
	expectNear(middle?.low, Math.SQRT1_2, 0.15, '440 Hz half way')
	expectNear(middle?.high, Math.SQRT1_2, 0.15, '880 Hz half way')
	expect(before?.high, 'no 880 Hz before').toBeLessThan(0.1)
	expect(after?.low, 'no 440 Hz after').toBeLessThan(0.1)

	// The preview: the second player fades in over the overlap, then the main
	// one takes over past the join.
	const samples = await page.evaluate(async () => {
		const [main, deck] = [...document.querySelectorAll('video')]
		if (!main || !deck) throw new Error('no players')
		main.muted = true
		main.currentTime = 0.6
		await new Promise((resolve) => main.addEventListener('seeked', resolve, { once: true }))
		const out: Array<{ main: number; opacity: number; deckPlaying: boolean }> = []
		await main.play()
		const end = performance.now() + 2600
		while (performance.now() < end) {
			await new Promise((resolve) => requestAnimationFrame(resolve))
			out.push({
				main: main.currentTime,
				opacity: Number(deck.style.opacity || 0),
				deckPlaying: !deck.paused
			})
		}
		main.pause()
		return out
	})
	const during = samples.filter((s) => s.main > 1.3 && s.main < 1.7)
	expect(during.length, 'frames in the overlap').toBeGreaterThan(5)
	for (const s of during) {
		expect(s.deckPlaying, `second player playing at ${s.main.toFixed(2)} s`).toBe(true)
		expect(s.opacity, `blend at ${s.main.toFixed(2)} s`).toBeGreaterThan(0.15)
		expect(s.opacity, `blend at ${s.main.toFixed(2)} s`).toBeLessThan(0.85)
	}
	const handedOver = samples.filter((s) => s.main > 3)
	expect(handedOver.length, 'played on past the join').toBeGreaterThan(5)
	expect(handedOver.at(-1)?.opacity, 'second player hidden after').toBe(0)
	expect(handedOver.at(-1)?.deckPlaying, 'second player stopped after').toBe(false)
})

test('delete and duplicate clips: what plays changes, a duplicate keeps its settings, undo and reset', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openRedBlue(page)
	// The red clip at 2×: its duplicate plays at 2× too.
	const speed = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 1' })
		.getByLabel('Speed (×)')
	await speed.fill('2')
	await speed.press('Enter')
	await clips(page).nth(0).click()
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Duplicate' })
		.click()
	await expect(clips(page)).toHaveCount(3)
	await expect(clips(page).nth(1)).toContainText('2×')
	const duplicated = await exportAndProbe(page, [0.5, 1.5, 3])
	expectLength(duplicated.seconds, 1 + 1 + 2)
	const [first, copy, blue] = duplicated.probes
	expect(first?.red, 'red, then').toBeGreaterThan(200)
	expect(copy?.red, 'red again (the copy)').toBeGreaterThan(200)
	expect(blue?.blue, 'then blue').toBeGreaterThan(200)
	expectNear(copy?.low, 1, 0.15, 'the copy is 440 Hz, its pitch kept at 2×')

	// Delete the blue clip: only the two red ones play.
	await clips(page).nth(2).click()
	await page.getByRole('region', { name: 'Clips' }).getByRole('button', { name: 'Delete' }).click()
	await expect(clips(page)).toHaveCount(2)
	const deleted = await exportAndProbe(page, [0.5, 1.5])
	expectLength(deleted.seconds, 2)
	for (const probe of deleted.probes) expect(probe.red, `red at ${probe.at} s`).toBeGreaterThan(200)

	// One undo step each.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(clips(page)).toHaveCount(3)
	await undo.click()
	await expect(clips(page)).toHaveCount(2)
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(clips(page)).toHaveCount(1)
})

test('transitions, delete and duplicate work as typed commands, each confirmed and one undo step', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await openRedBlue(page)
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await run(
		'add a fade between clips 1 and 2',
		{ action: 'fade_transition', fromClip: 1, toClip: 2 },
		"I'll add a fade through black of 1 s between clips 1 and 2."
	)
	await expect(joinRow(page, 1).getByRole('button', { name: 'Fade' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await run(
		'duplicate the first clip',
		{ action: 'duplicate_clip', fromClip: 1 },
		"I'll duplicate clip 1, with its sound and speed, and put the copy right after it."
	)
	await expect(clips(page)).toHaveCount(3)
	// The fade now follows the copy: clip 2 to clip 3.
	await expect(joinRow(page, 2).getByRole('button', { name: 'Fade' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await run(
		'delete clip 3',
		{ action: 'delete_clip', fromClip: 3 },
		"I'll delete clip 3: its part of the video won't play."
	)
	await expect(clips(page)).toHaveCount(2)
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(clips(page)).toHaveCount(3)
	await undo.click()
	await expect(clips(page)).toHaveCount(2)
	await undo.click()
	await expect(joinRow(page, 1).getByRole('button', { name: 'None' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
})
