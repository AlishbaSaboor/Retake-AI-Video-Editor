import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions } from './editor-helpers'

// Several videos in one project, on real exports. The main video: 320×180,
// red, with a 440 Hz tone, 4 s. The added one: square (240×240), green, with
// a 660 Hz tone, 3 s, so it's fitted into the main one's frame with black
// bars either side. Colour, tone and those bars say which video plays where.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const TONE_AMPLITUDE = 0.5
const LENGTH_TOLERANCE_SECONDS = 0.25
const PRESENT = 0.75
const ABSENT = 0.1

type Recording = { width: number; height: number; color: string; hz: number; seconds: number }
const MAIN: Recording = { width: 320, height: 180, color: '#ff0000', hz: 440, seconds: 4 }
const ADDED: Recording = { width: 240, height: 240, color: '#00ff00', hz: 660, seconds: 3 }

/** Records a still-coloured video with a steady tone in the page. */
async function recordVideo(page: Page, recording: Recording): Promise<Buffer> {
	const bytes = await page.evaluate(async ({ width, height, color, hz, seconds }) => {
		const canvas = Object.assign(document.createElement('canvas'), { width, height })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		const stream = canvas.captureStream(30)
		const audio = new AudioContext()
		await audio.resume()
		const destination = audio.createMediaStreamDestination()
		const oscillator = audio.createOscillator()
		const gain = audio.createGain()
		gain.gain.value = 0.5
		oscillator.frequency.value = hz
		oscillator.connect(gain).connect(destination)
		oscillator.start()
		for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		const stopped = new Promise((resolve) => (recorder.onstop = resolve))
		const draw = setInterval(() => {
			context.fillStyle = color
			context.fillRect(0, 0, width, height)
		}, 1000 / 30)
		recorder.start(100)
		await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
		recorder.stop()
		await stopped
		clearInterval(draw)
		oscillator.stop()
		return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
	}, recording)
	return Buffer.from(bytes)
}

const clips = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')

/** Opens the editor with the main video and adds the square one through Add video. */
async function openTwoVideos(page: Page, words = mockActions(page, { words: [] })) {
	await words
	await page.goto('/editor')
	const main = await recordVideo(page, MAIN)
	const added = await recordVideo(page, ADDED)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'red.webm', mimeType: 'video/webm', buffer: main })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	const choosing = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: 'Add video' }).click()
	await (await choosing).setFiles({ name: 'green.webm', mimeType: 'video/webm', buffer: added })
	await expect(clips(page)).toHaveCount(2)
	await expect(clips(page).nth(1)).toContainText('green.webm')
}

type Probe = { at: number; low: number; added: number; centre: number[]; edge: number[] }

/** Exports and reads, at each time, the two tones and the picture at its centre and left edge. */
async function exportAndProbe(page: Page, times: number[], seconds: number) {
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
			const level = (at: number, hz: number) => {
				const from = Math.max(0, Math.floor((at - 0.05) * audio.sampleRate))
				const to = Math.min(samples.length, Math.floor((at + 0.05) * audio.sampleRate))
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
				video.currentTime = at
				await next('seeked')
				context.drawImage(video, 0, 0, 320, 180)
				probes.push({
					at,
					low: +level(at, 440).toFixed(3),
					added: +level(at, 660).toFixed(3),
					centre: [...context.getImageData(160, 90, 1, 1).data.slice(0, 3)],
					edge: [...context.getImageData(20, 90, 1, 1).data.slice(0, 3)]
				})
			}
			return { seconds: video.duration, probes }
		},
		{ bytes: [...bytes], times, amplitude: TONE_AMPLITUDE }
	)
	console.log('EXPORT', result.seconds.toFixed(3), JSON.stringify(result.probes))
	expect(
		Math.abs(result.seconds - seconds),
		`exported ${result.seconds.toFixed(2)} s for ${seconds} s`
	).toBeLessThan(LENGTH_TOLERANCE_SECONDS)
	// Its toast goes after 5 s; until then it can cover what the test clicks next.
	await expect(page.getByText('Export finished')).toHaveCount(0, { timeout: 10_000 })
	return result.probes
}

const isRed = ([r = 0, g = 0, b = 0]: number[]) => r > 200 && g < 60 && b < 60
const isGreen = ([r = 0, g = 0, b = 0]: number[]) => g > 200 && r < 60 && b < 60
const isBlack = ([r = 0, g = 0, b = 0]: number[]) => r < 30 && g < 30 && b < 30

test('an added video plays after the first, fitted into its frame, with its own sound', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openTwoVideos(page)
	const [main, added] = await exportAndProbe(page, [1, 5.5], MAIN.seconds + ADDED.seconds)
	expect(isRed(main?.centre ?? []), `red first: ${main?.centre}`).toBe(true)
	expect(isRed(main?.edge ?? []), 'the main video fills the frame').toBe(true)
	expect(main?.low, '440 Hz with it').toBeGreaterThan(PRESENT)
	expect(main?.added, 'no 660 Hz').toBeLessThan(ABSENT)
	expect(isGreen(added?.centre ?? []), `then green: ${added?.centre}`).toBe(true)
	expect(isBlack(added?.edge ?? []), `the square video letterboxed: ${added?.edge}`).toBe(true)
	expect(added?.added, '660 Hz with it').toBeGreaterThan(PRESENT)
	expect(added?.low, 'no 440 Hz').toBeLessThan(ABSENT)

	// The preview plays on into it: its own player shown, the main one paused.
	const state = await page.evaluate(async () => {
		const main = document.querySelector<HTMLVideoElement>('video:not([data-testid])')
		const added = document.querySelector<HTMLVideoElement>('[data-testid="added-player"]')
		if (!main || !added) throw new Error('no players')
		main.muted = true
		added.muted = true
		main.currentTime = 3.5
		await new Promise((resolve) => main.addEventListener('seeked', resolve, { once: true }))
		await main.play()
		await new Promise((resolve) => setTimeout(resolve, 1500))
		return {
			addedShown: added.style.opacity,
			addedPlaying: !added.paused,
			addedTime: added.currentTime,
			mainPaused: main.paused
		}
	})
	console.log('PREVIEW', JSON.stringify(state))
	expect(state.addedShown, 'the added player shown').toBe('1')
	expect(state.addedPlaying, 'and playing').toBe(true)
	expect(state.addedTime, 'from its start').toBeGreaterThan(0.3)
	expect(state.mainPaused, 'the main one paused, away').toBe(true)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
	// The timeline shows the video the playhead is in.
	await expect(page.getByText('green.webm', { exact: true }).first()).toBeVisible()
})

test('clips of an added video reorder, speed up, take a colour and dissolve like any other', async ({
	page
}) => {
	test.setTimeout(240_000)
	await openTwoVideos(page)
	// The green clip first.
	await clips(page).nth(1).press('Alt+ArrowLeft')
	await expect(clips(page).nth(0)).toContainText('green.webm')
	// At 2×: 1.5 s.
	const speed = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 1' })
		.getByLabel('Speed (×)')
	await speed.fill('2')
	await speed.press('Enter')
	const reordered = await exportAndProbe(page, [0.75, 3.5], 1.5 + MAIN.seconds)
	expect(isGreen(reordered[0]?.centre ?? []), 'green first').toBe(true)
	expect(reordered[0]?.added, '660 Hz, its pitch kept at 2×').toBeGreaterThan(PRESENT)
	expect(isRed(reordered[1]?.centre ?? []), 'then red').toBe(true)

	// Black and white on the green clip; a 1 s dissolve into the red one.
	const color = page.getByRole('region', { name: 'Color' })
	await color
		.getByRole('group', { name: 'Apply to' })
		.getByRole('button', { name: 'Clip 1' })
		.click()
	await color.getByRole('button', { name: 'Black and white' }).click()
	const join = page
		.getByRole('region', { name: 'Transitions' })
		.getByRole('group', { name: 'Clip 1 to clip 2' })
	await join.getByRole('button', { name: 'Dissolve' }).click()
	// The green clip plays 1.5 s, so the dissolve is at most 0.75 s there.
	const [grey, middle, red] = await exportAndProbe(page, [0.3, 1.1, 3.5], 1.5 + MAIN.seconds - 0.75)
	const [r = 0, g = 0, b = 0] = grey?.centre ?? []
	expect(Math.max(r, g, b) - Math.min(r, g, b), `green as grey: ${grey?.centre}`).toBeLessThan(25)
	expect(g, 'a mid grey').toBeGreaterThan(80)
	// Half way through: the red coming in over the grey.
	const [mr = 0, mg = 0] = middle?.centre ?? []
	expect(mr, `red coming in: ${middle?.centre}`).toBeGreaterThan(mg + 20)
	expect(mg, `grey going out: ${middle?.centre}`).toBeGreaterThan(30)
	expect((middle?.low ?? 0) + (middle?.added ?? 0), 'both tones in the overlap').toBeGreaterThan(
		0.6
	)
	expect(isRed(red?.centre ?? []), 'then red').toBe(true)
})

test("an added video's own trim and a split work while the playhead is in it", async ({ page }) => {
	test.setTimeout(180_000)
	await openTwoVideos(page)
	// Play from near the main video's end into the green one, then pause there.
	await page.evaluate(async () => {
		const main = document.querySelector<HTMLVideoElement>('video:not([data-testid])')
		if (!main) throw new Error('no player')
		main.muted = true
		main.currentTime = 3.6
		await new Promise((resolve) => main.addEventListener('seeked', resolve, { once: true }))
		await main.play()
	})
	await expect
		.poll(() =>
			page.locator('[data-testid="added-player"]').evaluate((v: HTMLVideoElement) => v.currentTime)
		)
		.toBeGreaterThan(0.8)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	// The timeline is the green video's now: its trim end, a second back.
	const trimEnd = page.getByRole('slider', { name: 'Trim end' })
	await expect(trimEnd).toHaveAttribute('aria-valuemax', /^2\.9|^3/)
	const length = Number(await trimEnd.getAttribute('aria-valuenow'))
	await trimEnd.focus()
	await trimEnd.press('Shift+ArrowLeft')
	await expect
		.poll(async () => Number(await trimEnd.getAttribute('aria-valuenow')))
		.toBeCloseTo(length - 1, 1)
	// Split the green clip where the playhead is.
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(clips(page)).toHaveCount(3)
	await expect(clips(page).nth(2)).toContainText('green.webm')
	const [main, green] = await exportAndProbe(page, [1, 4.8], MAIN.seconds + ADDED.seconds - 1)
	expect(isRed(main?.centre ?? []), 'red').toBe(true)
	expect(isGreen(green?.centre ?? []), 'green').toBe(true)
})

test('"add another video" is a command, confirmed first; undo and reset take the video away', async ({
	page
}) => {
	test.setTimeout(120_000)
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	const main = await recordVideo(page, MAIN)
	const added = await recordVideo(page, ADDED)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'red.webm', mimeType: 'video/webm', buffer: main })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await mockActions(page, { words: [], command: editCommand({ action: 'add_video' }) })
	await command.fill('add another video')
	await page.getByRole('button', { name: 'Run' }).click()
	await expect(reply).toContainText("I'll add another video after the clips. Choose the file next.")
	const choosing = page.waitForEvent('filechooser')
	await reply.getByRole('button', { name: 'Apply' }).click()
	await (await choosing).setFiles({ name: 'green.webm', mimeType: 'video/webm', buffer: added })
	await expect(clips(page)).toHaveCount(2)
	await expect(page.locator('[data-testid="added-player"]')).toHaveCount(1)

	// Clips of two videos can't be one.
	await mockActions(page, {
		words: [],
		command: editCommand({ action: 'merge', fromClip: 1, toClip: 2 })
	})
	await command.fill('merge clips 1 and 2')
	await page.getByRole('button', { name: 'Run' }).click()
	await expect(reply).toContainText(
		"Those clips are from different videos, so they can't be one clip."
	)
	await reply.getByRole('button', { name: 'OK' }).click()

	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(clips(page)).toHaveCount(1)
	await expect(page.locator('[data-testid="added-player"]')).toHaveCount(0)
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect(clips(page)).toHaveCount(2)
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(clips(page)).toHaveCount(1)
	await expect(page.locator('[data-testid="added-player"]')).toHaveCount(0)
})
