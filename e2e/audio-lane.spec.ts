import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, seekTo, openTool } from './editor-helpers'
import { exportVideo, readExportFrames, readToneLevels } from './export-frames'

// The Audio lane on real exports. The video: 2 s of red with a 440 Hz tone,
// then 2 s of blue with 880 Hz, split at 2 s into two clips. The added file:
// 1.5 s of 660 Hz. Each tone's level in the export (Goertzel, as a share of
// a full 0.5-amplitude tone) says what sounds where.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const SECTION_SECONDS = 2
const TONE_AMPLITUDE = 0.5
const LENGTH_TOLERANCE_SECONDS = 0.25
/** A tone counts as there over this share of full, and as absent under ABSENT. */
const PRESENT = 0.75
const ABSENT = 0.1

/** 1.5 s of a 660 Hz tone at amplitude 0.5, as a 48 kHz WAV. */
function toneWav(seconds = 1.5, hz = 660): Buffer {
	const rate = 48_000
	const count = Math.round(seconds * rate)
	const wav = Buffer.alloc(44 + count * 2)
	wav.write('RIFF', 0)
	wav.writeUInt32LE(36 + count * 2, 4)
	wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16)
	wav.writeUInt16LE(1, 20)
	wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(rate, 24)
	wav.writeUInt32LE(rate * 2, 28)
	wav.writeUInt16LE(2, 32)
	wav.writeUInt16LE(16, 34)
	wav.write('data', 36)
	wav.writeUInt32LE(count * 2, 40)
	for (let i = 0; i < count; i++) {
		const sample = TONE_AMPLITUDE * Math.sin((2 * Math.PI * hz * i) / rate)
		wav.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * 2)
	}
	return wav
}

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
	await expect(page.getByRole('region', { name: 'Clips' }).getByRole('option')).toHaveCount(2)
}

const lane = (page: Page) => page.getByRole('region', { name: 'Audio', exact: true })
const laneItem = (page: Page, n: number) =>
	lane(page).getByRole('group', { name: new RegExp(`^${n}\\. `) })

/** Adds the 660 Hz file to the lane (through the picker the button opens), starting at `seconds`. */
async function addTone(page: Page, seconds: number) {
	const choosing = page.waitForEvent('filechooser')
	await openTool(page, 'Audio')
	await lane(page).getByRole('button', { name: 'Add audio file' }).click()
	await (await choosing).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() })
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toBeVisible()
	await setStart(page, 1, seconds)
}

async function setStart(page: Page, n: number, seconds: number) {
	await openTool(page, 'Audio')
	const field = laneItem(page, n).getByLabel('Starts at (s)')
	await field.fill(String(seconds))
	await field.press('Enter')
	await openTool(page, 'Audio')
	await expect(laneItem(page, n).getByLabel('Starts at (s)')).toHaveValue(String(seconds))
}

type Probe = {
	at: number
	/** The time of the frame the export had for `at` (export-frames.ts); the levels are read at `at`. */
	shown: number
	low: number
	mid: number
	high: number
	red: number
	blue: number
}

/** Exports and reads, at each time, the 440, 660 and 880 Hz levels and the picture's red and blue. */
async function exportAndProbe(page: Page, times: number[]) {
	const bytes = await exportVideo(page)
	const { seconds, frames } = await readExportFrames(
		page,
		bytes,
		times,
		({ context }) => {
			const [red = 0, , blue = 0] = context.getImageData(160, 90, 1, 1).data
			return { red, blue }
		},
		{ size: { width: 320, height: 180 } }
	)
	const levels = await readToneLevels(
		page,
		bytes,
		times,
		{ low: 440, mid: 660, high: 880 },
		TONE_AMPLITUDE
	)
	const probes: Probe[] = frames.map((frame, index) => ({
		...frame,
		low: 0,
		mid: 0,
		high: 0,
		...levels[index]
	}))
	console.log('EXPORT', seconds.toFixed(3), JSON.stringify(probes))
	expect(Math.abs(seconds - 2 * SECTION_SECONDS), `exported ${seconds.toFixed(2)} s`).toBeLessThan(
		LENGTH_TOLERANCE_SECONDS
	)
	// Its toast goes after 5 s; until then it can cover what the test clicks next.
	await expect(page.getByText('Export finished')).toHaveCount(0, { timeout: 10_000 })
	return probes
}

test('an added audio file plays where it is put, mixed over the video, at its volume, in the export', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openRedBlue(page)
	await addTone(page, 1)
	const [before, during, after] = await exportAndProbe(page, [0.5, 1.75, 2.9])
	expect(before?.mid, 'no 660 Hz before it starts').toBeLessThan(ABSENT)
	expect(during?.mid, '660 Hz from 1 s').toBeGreaterThan(PRESENT)
	expect(during?.low, "the video's own 440 Hz still there, mixed").toBeGreaterThan(PRESENT)
	expect(after?.mid, 'no 660 Hz after it ends (2.5 s)').toBeLessThan(ABSENT)
	expect(after?.high, "the video's own 880 Hz").toBeGreaterThan(PRESENT)

	// At 50%, half as loud; muted, gone; each one change.
	await openTool(page, 'Audio')
	const volume = laneItem(page, 1).getByRole('slider', { name: /^Volume/ })
	await volume.fill('50')
	await volume.blur()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toContainText('Volume 50%')
	const [, half] = await exportAndProbe(page, [0.5, 1.75])
	expect(Math.abs((half?.mid ?? 0) - 0.5), `660 Hz at ${half?.mid} for 0.5`).toBeLessThan(0.12)
	await openTool(page, 'Audio')
	await laneItem(page, 1).getByRole('button', { name: 'Mute' }).click()
	const [, muted] = await exportAndProbe(page, [0.5, 1.75])
	expect(muted?.mid, 'muted').toBeLessThan(ABSENT)

	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1).getByRole('button', { name: 'Mute' })).toHaveAttribute(
		'aria-pressed',
		'false'
	)
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toContainText('Volume 100%')
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toHaveCount(0)
})

test("a clip's sound taken out plays where it is moved, while the clip plays silent", async ({
	page
}) => {
	test.setTimeout(180_000)
	await openRedBlue(page)
	await openTool(page, 'Audio')
	await lane(page).getByLabel('Clip', { exact: true }).selectOption('1')
	await openTool(page, 'Audio')
	await lane(page).getByRole('button', { name: "Extract the clip's sound" }).click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toContainText('Clip 2 sound')
	await openTool(page, 'Clip sound and speed')
	await expect(
		page
			.getByRole('region', { name: 'Clip sound and speed' })
			.getByRole('group', { name: 'Clip 2' })
	).toContainText('Its sound is in the Audio lane.')
	// Where the clip plays, it sounds the same as before.
	const [inPlace] = await exportAndProbe(page, [3])
	expect(inPlace?.high, 'clip 2 sound from the lane, in place').toBeGreaterThan(PRESENT)

	// Moved to the start: 880 Hz over clip 1, and clip 2 itself silent.
	await setStart(page, 1, 0)
	const [early, late] = await exportAndProbe(page, [0.75, 3])
	expect(early?.low, "clip 1's own 440 Hz").toBeGreaterThan(PRESENT)
	expect(early?.high, "clip 2's sound, moved to the start").toBeGreaterThan(PRESENT)
	expect(late?.high, 'clip 2 silent where it plays').toBeLessThan(ABSENT)
	expect(late?.blue, "clip 2's picture still there").toBeGreaterThan(200)

	// A sped clip's sound can't be taken out.
	await openTool(page, 'Clip sound and speed')
	const speed = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 1' })
		.getByLabel('Speed (×)')
	await speed.fill('2')
	await speed.press('Enter')
	await openTool(page, 'Audio')
	await lane(page).getByLabel('Clip', { exact: true }).selectOption('0')
	await openTool(page, 'Audio')
	await expect(lane(page).getByRole('button', { name: "Extract the clip's sound" })).toBeDisabled()
	await openTool(page, 'Audio')
	await expect(lane(page)).toContainText('Sped up or slowed: set it back to 1× first.')

	// Undo puts the clip's sound back in it.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await undo.click()
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toHaveCount(0)
	await openTool(page, 'Clip sound and speed')
	await expect(
		page
			.getByRole('region', { name: 'Clip sound and speed' })
			.getByRole('group', { name: 'Clip 2' })
	).not.toContainText('Its sound is in the Audio lane.')
})

test('the preview plays a lane item from where playback is', async ({ page }) => {
	test.setTimeout(120_000)
	// Every buffer the page starts, with its offset into the sound.
	await page.addInitScript(() => {
		const starts: Array<[number, number]> = []
		document.addEventListener('lane-reset', () => (starts.length = 0))
		const start = AudioBufferSourceNode.prototype.start
		AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
			starts.push([offset ?? 0, duration ?? -1])
			document.documentElement.dataset.laneStarts = JSON.stringify(starts)
			return start.call(this, when, offset, duration)
		}
	})
	await openRedBlue(page)
	await addTone(page, 1)
	const starts = async () =>
		JSON.parse((await page.evaluate(() => document.documentElement.dataset.laneStarts)) ?? '[]')
	/** Plays from `seconds` for a moment, and returns the lane starts it made. */
	const playFrom = async (seconds: number) => {
		await seekTo(page, seconds)
		await page.evaluate(() => {
			document.dispatchEvent(new Event('lane-reset'))
			document.documentElement.dataset.laneStarts = '[]'
		})
		await page.locator('video').evaluate(async (v: HTMLVideoElement) => {
			v.muted = true
			await v.play()
			await new Promise((resolve) => setTimeout(resolve, 400))
			v.pause()
		})
		return (await starts()) as Array<[number, number]>
	}
	// From 0.5 s: the file from its start.
	const fromBefore = await playFrom(0.5)
	// One start for the stretch: the lane isn't restarted every frame.
	expect(fromBefore.length, `starts ${JSON.stringify(fromBefore)}`).toBe(1)
	expect(fromBefore[0]?.[0], 'from its start').toBeLessThan(0.01)
	// From 1.3 s: 0.3 s into the file. (Well before the clips' join at 2 s,
	// where the lane rightly starts again for the next stretch.)
	const fromInside = await playFrom(1.3)
	expect(fromInside.length, `starts ${JSON.stringify(fromInside)}`).toBe(1)
	expect(
		Math.abs((fromInside[0]?.[0] ?? -1) - 0.3),
		`from ${fromInside[0]?.[0]} s in`
	).toBeLessThan(0.1)
	// The Original view has no lane.
	await page
		.getByRole('group', { name: 'Compare with the original' })
		.getByRole('button', { name: 'Original' })
		.click()
	expect(await playFrom(1.3)).toEqual([])
})

test('audio lane commands are confirmed first and are one undo step each', async ({ page }) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await openRedBlue(page)
	const ask = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await openTool(page, 'Assistant')
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
	}
	await ask(
		'add music at 0:01',
		{ action: 'add_audio', startSeconds: 1 },
		"I'll add an audio file at 0:01 of the edited video. Choose the file next."
	)
	const choosing = page.waitForEvent('filechooser')
	await reply.getByRole('button', { name: 'Apply' }).click()
	await (await choosing).setFiles({ name: 'music.wav', mimeType: 'audio/wav', buffer: toneWav() })
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toContainText('music.wav')
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1).getByLabel('Starts at (s)')).toHaveValue('1')

	await ask(
		'extract the audio of clip 2',
		{ action: 'extract_audio', fromClip: 2 },
		"I'll take clip 2's sound out into its own track in the Audio lane"
	)
	await reply.getByRole('button', { name: 'Apply' }).click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 2)).toContainText('Clip 2 sound')

	await ask(
		'delete the music',
		{ action: 'delete_audio', fromClip: 1 },
		"I'll delete audio track 1"
	)
	await reply.getByRole('button', { name: 'Apply' }).click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toContainText('Clip 2 sound')
	await openTool(page, 'Audio')
	await expect(laneItem(page, 2)).toHaveCount(0)

	await ask(
		'extract the audio of clip 2',
		{ action: 'extract_audio', fromClip: 2 },
		"That clip's sound is already in the Audio lane."
	)
	await reply.getByRole('button', { name: 'OK' }).click()

	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 2)).toContainText('Clip 2 sound')
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 2)).toHaveCount(0)
	await undo.click()
	await openTool(page, 'Audio')
	await expect(laneItem(page, 1)).toHaveCount(0)
})
