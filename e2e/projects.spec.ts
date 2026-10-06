import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, seekTo, w, openTool } from './editor-helpers'
import { exportVideo, readExportFrames, readToneLevels } from './export-frames'

// Saving and reopening projects (kept in the browser, IndexedDB). The main
// video: 2 s of red with a 440 Hz tone, then 2 s of blue with 880 Hz. An
// added video: 1.5 s of green (square) with 330 Hz. An audio file: 1.5 s of
// 660 Hz. A project with several kinds of edits is saved, the page reloaded,
// the project reopened, and its timeline and an export compared with the
// original's.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const AMPLITUDE = 0.5
const WORDS = [w('Hello', 0.2, 0.6), w('there.', 0.6, 1.1)]

type Recording = {
	width: number
	height: number
	colors: string[]
	tones: number[]
	seconds: number
}
const MAIN: Recording = {
	width: 320,
	height: 180,
	colors: ['#ff0000', '#0000ff'],
	tones: [440, 880],
	seconds: 4
}
const ADDED: Recording = {
	width: 240,
	height: 240,
	colors: ['#00ff00'],
	tones: [330],
	seconds: 1.5
}

/** Records a video whose colour and tone change in equal parts, in the page. */
async function recordVideo(page: Page, recording: Recording): Promise<Buffer> {
	const bytes = await page.evaluate(async ({ width, height, colors, tones, seconds }) => {
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
		const part = seconds / tones.length
		for (const [index, hz] of tones.entries()) {
			oscillator.frequency.setValueAtTime(hz, audio.currentTime + index * part)
		}
		oscillator.connect(gain).connect(destination)
		oscillator.start()
		for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		const stopped = new Promise((resolve) => (recorder.onstop = resolve))
		const startedAt = performance.now()
		const draw = setInterval(() => {
			const elapsed = (performance.now() - startedAt) / 1000
			context.fillStyle = colors[Math.min(colors.length - 1, Math.floor(elapsed / part))] ?? '#000'
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
		wav.writeInt16LE(
			Math.round(AMPLITUDE * Math.sin((2 * Math.PI * hz * i) / rate) * 0x7fff),
			44 + i * 2
		)
	}
	return wav
}

/** Counts the editor's transcription requests (each would be a Deepgram call). */
async function countTranscriptions(page: Page) {
	const counter = { count: 0 }
	page.on('request', (request) => {
		if (request.headers()['next-action'] && request.postData()?.includes('"audioBase64"')) {
			counter.count++
		}
	})
	return counter
}

async function openMain(page: Page, main: Buffer) {
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'red-blue.webm', mimeType: 'video/webm', buffer: main })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
}

const clips = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')
const projectPanel = (page: Page) => page.getByRole('region', { name: 'Project', exact: true })

/** Several kinds of edits: split, speed, colour, title, a box, an audio file, an added video. */
async function makeEdits(page: Page, added: Buffer) {
	await seekTo(page, 2)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(clips(page)).toHaveCount(2)
	await openTool(page, 'Clip sound and speed')
	const speed = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 2' })
		.getByLabel('Speed (×)')
	await speed.fill('2')
	await speed.press('Enter')
	await openTool(page, 'Color')
	const color = page.getByRole('region', { name: 'Color' })
	await color
		.getByRole('group', { name: 'Apply to' })
		.getByRole('button', { name: 'Clip 1' })
		.click()
	await openTool(page, 'Color')
	await color.getByRole('button', { name: 'Black and white' }).click()
	await openTool(page, 'Graphics')
	const graphics = page.getByRole('region', { name: 'Graphics' })
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Title text').fill('HELLO')
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	await openTool(page, 'Graphics')
	const titleColor = graphics.getByRole('group', { name: 'Title style' }).getByLabel('Color')
	await titleColor.fill('#ff0000')
	await titleColor.blur()
	await openTool(page, 'Captions')
	await page
		.getByRole('region', { name: 'Captions' })
		.getByRole('button', { name: 'Captions' })
		.click()
	// A box over the top-left corner, from the start.
	await seekTo(page, 0.05)
	await openTool(page, 'Annotations')
	const annotations = page.getByRole('region', { name: 'Annotations' })
	await annotations
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Box', exact: true })
		.click()
	const layer = page.getByTestId('annotation-layer')
	await layer.scrollIntoViewIfNeeded()
	const box = await layer.boundingBox()
	if (!box) throw new Error('no layer')
	await page.mouse.move(box.x + 0.02 * box.width, box.y + 0.02 * box.height)
	await page.mouse.down()
	await page.mouse.move(box.x + 0.2 * box.width, box.y + 0.2 * box.height, { steps: 4 })
	await page.mouse.up()
	await annotations
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Box', exact: true })
		.click()
	// An audio file at 0.5 s.
	await openTool(page, 'Audio')
	const lane = page.getByRole('region', { name: 'Audio', exact: true })
	const choosingAudio = page.waitForEvent('filechooser')
	await openTool(page, 'Audio')
	await lane.getByRole('button', { name: 'Add audio file' }).click()
	await (
		await choosingAudio
	).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() })
	await openTool(page, 'Audio')
	const start = lane.getByRole('group', { name: /^1\. / }).getByLabel('Starts at (s)')
	await start.fill('0.5')
	await start.press('Enter')
	// An added video, last.
	const choosingVideo = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: 'Add video' }).click()
	await (
		await choosingVideo
	).setFiles({ name: 'green.webm', mimeType: 'video/webm', buffer: added })
	await expect(clips(page)).toHaveCount(3)
}

/** What the editor shows of the edit: the clips, the lane, the title, the colour scope. */
async function editorState(page: Page) {
	return {
		clips: await clips(page).evaluateAll((items) =>
			items.map((item) => item.getAttribute('aria-label'))
		),
		lane: await (await openTool(page, 'Audio'), page)
			.getByRole('region', { name: 'Audio', exact: true })
			.getByRole('group')
			.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))),
		title: await (await openTool(page, 'Graphics'), page)
			.getByRole('region', { name: 'Graphics' })
			.getByLabel('Title text')
			.inputValue(),
		speed: await (await openTool(page, 'Clip sound and speed'), page)
			.getByRole('region', { name: 'Clip sound and speed' })
			.getByRole('group', { name: 'Clip 2' })
			.getByLabel('Speed (×)')
			.inputValue(),
		captions: await (await openTool(page, 'Captions'), page)
			.getByRole('region', { name: 'Captions' })
			.getByRole('button', { name: 'Captions' })
			.getAttribute('aria-pressed')
	}
}

type Probe = {
	at: number
	/** The time of the frame the export had for `at` (export-frames.ts); the tones are read at `at`. */
	shown: number
	centre: number[]
	corner: number[]
	red: number
	tones: Record<string, number>
}

/** Exports and reads, at each time: the centre's and top-left corner's colour, red title pixels, and four tones. */
async function exportAndProbe(page: Page, times: number[]) {
	const bytes = await exportVideo(page)
	const { seconds, frames } = await readExportFrames(
		page,
		bytes,
		times,
		({ context }) => {
			const band = context.getImageData(0, 76, 320, 28).data
			let red = 0
			for (let i = 0; i < band.length; i += 4) {
				if ((band[i] ?? 0) > 180 && (band[i + 1] ?? 0) < 90 && (band[i + 2] ?? 0) < 90) red++
			}
			return {
				centre: [...context.getImageData(160, 140, 1, 1).data.slice(0, 3)],
				corner: [...context.getImageData(20, 15, 1, 1).data.slice(0, 3)],
				red
			}
		},
		{ size: { width: 320, height: 180 } }
	)
	const levels = await readToneLevels(
		page,
		bytes,
		times,
		{ 330: 330, 440: 440, 660: 660, 880: 880 },
		AMPLITUDE
	)
	const probes: Probe[] = frames.map((frame, index) => ({ ...frame, tones: levels[index] ?? {} }))
	const result = { seconds, probes }
	console.log('EXPORT', JSON.stringify(result))
	await expect(page.getByText('Export finished')).toHaveCount(0, { timeout: 10_000 })
	return result
}

/** Two exports of the same edit agree: length, colours, title, tones. */
function expectSameExport(
	before: Awaited<ReturnType<typeof exportAndProbe>>,
	after: Awaited<ReturnType<typeof exportAndProbe>>
) {
	expect(
		Math.abs(after.seconds - before.seconds),
		`length ${after.seconds} for ${before.seconds}`
	).toBeLessThan(0.25)
	for (const [index, was] of before.probes.entries()) {
		const now = after.probes[index]
		const at = `at ${was.at} s`
		for (const [c, value] of was.centre.entries()) {
			expect(
				Math.abs((now?.centre[c] ?? -99) - value),
				`${at} centre ${now?.centre} for ${was.centre}`
			).toBeLessThan(20)
		}
		for (const [c, value] of was.corner.entries()) {
			expect(
				Math.abs((now?.corner[c] ?? -99) - value),
				`${at} corner ${now?.corner} for ${was.corner}`
			).toBeLessThan(20)
		}
		expect(
			Math.abs((now?.red ?? 0) - was.red),
			`${at} red title pixels ${now?.red} for ${was.red}`
		).toBeLessThan(Math.max(20, was.red * 0.2))
		for (const [hz, value] of Object.entries(was.tones)) {
			expect(
				Math.abs((now?.tones[hz] ?? -1) - value),
				`${at} ${hz} Hz ${now?.tones[hz]} for ${value}`
			).toBeLessThan(0.15)
		}
	}
}

test('a project with several kinds of edits, saved, survives a reload: same timeline, same export', async ({
	page
}) => {
	test.setTimeout(300_000)
	await mockActions(page, { words: WORDS })
	await page.goto('/editor')
	const main = await recordVideo(page, MAIN)
	const added = await recordVideo(page, ADDED)
	await openMain(page, main)
	await openTool(page, 'Transcript')
	await expect(page.getByRole('button', { name: /Hello there\./ })).toBeVisible({ timeout: 30_000 })
	await makeEdits(page, added)
	// 2 s grey (clip 1, black and white), 1 s of blue at 2×, 1.5 s of green.
	const times = [1, 2.5, 3.75]
	const before = await exportAndProbe(page, times)
	const [one, two, three] = before.probes
	expect(one?.red, 'the red title').toBeGreaterThan(50)
	expect(Math.max(...(one?.corner ?? [255])), 'the black box').toBeLessThan(30)
	expect(one?.tones['440'], "clip 1's sound").toBeGreaterThan(0.75)
	expect(one?.tones['660'], 'the audio file').toBeGreaterThan(0.75)
	expect(two?.tones['880'], 'clip 2 at 2×, pitch kept').toBeGreaterThan(0.75)
	expect(three?.tones['330'], 'the added video').toBeGreaterThan(0.75)
	const state = await editorState(page)

	await page.getByLabel('Project name').fill('Saved edit')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Saved at')

	// Reload: nothing in the editor; the project in My projects.
	const transcriptions = await countTranscriptions(page)
	await page.reload()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toHaveCount(0)
	const listed = page
		.getByRole('list', { name: 'My projects' })
		.getByRole('listitem', { name: 'Saved edit' })
	await openTool(page, 'Project')
	await listed.getByRole('button', { name: 'Open' }).click()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(clips(page)).toHaveCount(3)
	expect(await editorState(page)).toEqual(state)
	await openTool(page, 'Transcript')
	await expect(page.getByRole('button', { name: /Hello there\./ })).toBeVisible({ timeout: 30_000 })
	expect(transcriptions.count, 'no transcription on reopening: the saved transcript').toBe(0)
	// A reopened project starts with no history: nothing to undo.
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()

	const after = await exportAndProbe(page, times)
	expectSameExport(before, after)
})

test('a saved project saves itself after each change', async ({ page }) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	await openMain(page, await recordVideo(page, MAIN))
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Saved at')
	// A change after saving: no Save pressed.
	await openTool(page, 'Clip sound and speed')
	const mute = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 1' })
		.getByRole('button', { name: 'Mute' })
	await openTool(page, 'Clip sound and speed')
	await mute.click()
	await page.waitForTimeout(3000)
	await page.reload()
	await page
		.getByRole('list', { name: 'My projects' })
		.getByRole('listitem', { name: 'red-blue' })
		.getByRole('button', { name: 'Open' })
		.click()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await openTool(page, 'Clip sound and speed')
	await expect(mute).toHaveAttribute('aria-pressed', 'true')
})

test('a project whose video the browser lost asks for the file; a deleted project is gone', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	const main = await recordVideo(page, MAIN)
	await openMain(page, main)
	await page.getByLabel('Project name').fill('Lost video')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Saved at')
	// The browser's copy of the video gone, as if its storage were cleared.
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('retake')
				open.onsuccess = () => {
					const clear = open.result.transaction('media', 'readwrite').objectStore('media').clear()
					clear.onsuccess = () => {
						open.result.close()
						resolve()
					}
					clear.onerror = () => reject(clear.error)
				}
			})
	)
	await page.reload()
	const item = page
		.getByRole('list', { name: 'My projects' })
		.getByRole('listitem', { name: 'Lost video' })
	await item.getByRole('button', { name: 'Open' }).click()
	const relink = page.getByRole('region', { name: 'Find the missing files' })
	await expect(relink).toContainText('Find red-blue.webm')
	// Another file is refused; the same one opens the project.
	await relink
		.getByLabel('Find red-blue.webm')
		.setInputFiles({ name: 'other.webm', mimeType: 'video/webm', buffer: main })
	await expect(page.getByText('other.webm isn’t red-blue.webm: pick that file.')).toBeVisible()
	await relink
		.getByLabel('Find red-blue.webm')
		.setInputFiles({ name: 'red-blue.webm', mimeType: 'video/webm', buffer: main })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(page.getByLabel('Project name')).toHaveValue('Lost video')

	// Deleting asks first, then it's gone.
	await openTool(page, 'Project')
	const listed = projectPanel(page).getByRole('listitem', { name: 'Lost video' })
	await openTool(page, 'Project')
	await listed.getByRole('button', { name: 'Delete' }).click()
	await expect(listed).toContainText('Delete this project?')
	await openTool(page, 'Project')
	await listed.getByRole('button', { name: 'Delete' }).click()
	// The project open was the one deleted: the panel starts afresh, unsaved.
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Not saved yet.')
	await openTool(page, 'Project')
	await expect(projectPanel(page)).toContainText('No saved projects yet.')
	await page.reload()
	await expect(page.getByText('No saved projects yet.', { exact: false })).toBeVisible()
})

test('save and open as typed commands, each confirmed first', async ({ page }) => {
	test.setTimeout(120_000)
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	const main = await recordVideo(page, MAIN)
	await openMain(page, main)
	const ask = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await openTool(page, 'Assistant')
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
	}
	await ask(
		'save the project as Demo',
		{ action: 'save_project', text: 'Demo' },
		"I'll save this project as “Demo”."
	)
	await reply.getByRole('button', { name: 'Apply' }).click()
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Saved at')
	// A new video, edited and never saved: opening Demo warns.
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'second.webm', mimeType: 'video/webm', buffer: main })
	await openTool(page, 'Project')
	await expect(projectPanel(page).getByRole('status')).toContainText('Not saved yet.')
	await openTool(page, 'Clip sound and speed')
	await page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 1' })
		.getByRole('button', { name: 'Mute' })
		.click()
	await ask(
		'open my project demo',
		{ action: 'open_project', text: 'demo' },
		"I'll open “Demo” in place of this edit. This edit has changes that were never saved: they'll be lost."
	)
	await reply.getByRole('button', { name: 'Apply' }).click()
	await expect(page.getByLabel('Project name')).toHaveValue('Demo')
	await ask(
		'open my project wedding',
		{ action: 'open_project', text: 'wedding' },
		"There's no saved project by that name. My projects lists them."
	)
})
