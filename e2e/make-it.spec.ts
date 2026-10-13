import { writeFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import type { MakeReply } from '../src/app/[locale]/(app)/make/make-plan'
import { openTool, recordTestVideo, seekTo, w } from './editor-helpers'
import { exportVideo, readExportFrames, readToneLevels } from './export-frames'
import { makeReply, mockMakeActions, NOTHING_TO_FIX, submitMake } from './make-helpers'
import { recordTextBoxes, textBoxReport } from './text-boxes'

// Make it: a video and a request in, a whole edit planned, shown, and
// applied in the editor. The transcript and Gemini's replies are canned
// (no paid call is made); what's tested is what the app does with them:
// the questions, the plan it shows, and the edit Apply builds — its clips,
// word captions, the crop following the "face", Undo, and the export.

// Tone on while each sentence is said; a long pause before the last.
const TONE: Array<[number, boolean]> = [
	[1, true],
	[0.6, false],
	[2, true],
	[1.4, false],
	[1, true]
]
const WORDS = [
	w('Hello.', 0.1, 0.9),
	w('This', 1.7, 2.1),
	w('is', 2.1, 2.4),
	w('the', 2.4, 2.7),
	w('key', 2.7, 3.1),
	w('point.', 3.1, 3.5),
	w('Bye.', 5.1, 5.9)
]
// Sentences 1 and 2 stay one piece (0 to 3.75 s); the long pause before 3 goes.
const FIRST_PIECE_END = 3.75
const LAST_PIECE_START = 4.85
// The test video's orange square, read as the "face": its centre at 1 s and 3 s.
const FACES = [
	{ frame: 1, x: 406, y: 500 },
	{ frame: 2, x: 906, y: 500 }
]

const reply = (fields: Partial<MakeReply> = {}): MakeReply => makeReply({ faces: FACES, ...fields })

async function startMaking(page: Page, request: string) {
	await page.goto('/make')
	const video = await recordTestVideo(page, TONE)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: video })
	await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
	await submitMake(page, request)
}

const plan = (page: Page) => page.getByRole('status', { name: 'The plan' })

/** Apply opens the edited video with only the chat; these tests then go on in the full editor. */
async function applyAndEditManually(page: Page) {
	await plan(page).getByRole('button', { name: 'Apply' }).click()
	await page
		.getByRole('group', { name: 'Editor mode' })
		.getByRole('button', { name: 'Edit manually' })
		.click({ timeout: 30_000 })
}

test('Home offers Make it: the video and what it should become go on to the Make it page', async ({
	page
}) => {
	await page.goto('/home')
	const card = page.getByRole('region', { name: 'Make it with AI' })
	await card.getByRole('button', { name: 'Make it funny' }).click()
	await expect(card.getByRole('textbox', { name: 'What should it become?' })).toHaveValue(
		'Make it funny'
	)
	const video = await recordTestVideo(page, TONE)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'from-home.webm', mimeType: 'video/webm', buffer: video })
	// A first visit compiles the page: the same allowance as the other first loads.
	await expect(page.getByRole('heading', { level: 1, name: 'Make it with AI' })).toBeVisible({
		timeout: 30_000
	})
	await expect(page.getByText('from-home.webm')).toBeVisible()
	await expect(page.getByRole('textbox', { name: 'What should it become?' })).toHaveValue(
		'Make it funny'
	)
	await expect(page.getByRole('button', { name: 'Make it', exact: true })).toBeEnabled()
	// Nothing is planned until asked.
	await expect(page.getByRole('status', { name: 'The plan' })).toHaveCount(0)
})

test('a reel is planned, shown, applied as one undo step, and exported vertical following the face', async ({
	page
}) => {
	// A key line on sentence 2: its key words are where the zoom goes.
	const seen = await mockMakeActions(page, WORDS, [
		reply({ keyLines: [{ sentence: 2, text: 'the key point' }] })
	])
	await startMaking(page, 'make this an Instagram reel')

	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	// The transcript and a picture every 2 s went with the request.
	const [sent] = seen.plans
	expect(sent).toContain('make this an Instagram reel')
	expect(sent).toContain('key point.')
	expect(sent?.match(/\/9j\//g)?.length).toBe(3)
	// It says first what it's making, and how long it came out.
	await expect(plan(page).getByRole('heading')).toHaveText(/^An Instagram Reel, about \d seconds$/)
	for (const line of [
		'A short talk, cut into a vertical reel.',
		'Shortened from 0:0',
		'Under 60 seconds, as reels, TikToks and Shorts need',
		'Captions, one big word at a time',
		'Checked against your request: nothing to fix.',
		'1 zoom on key lines',
		'No music: there are no tracks in public/music yet',
		'Vertical 9:16, zoomed in to follow the face; the edges are cut off'
	]) {
		await expect(plan(page)).toContainText(line)
	}

	await applyAndEditManually(page)
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await expect(scrubber).toBeVisible({ timeout: 30_000 })
	// Two pieces: the long pause before the last sentence is gone.
	await expect
		.poll(async () => JSON.parse((await scrubber.getAttribute('data-segments')) ?? '[]').length)
		.toBe(2)
	const pieces: Array<[number, number]> = JSON.parse(
		(await scrubber.getAttribute('data-segments')) ?? '[]'
	)
	expect(pieces[0]?.[0]).toBe(0)
	expect(pieces[0]?.[1]).toBeCloseTo(FIRST_PIECE_END, 5)
	expect(pieces[1]?.[0]).toBeCloseTo(LAST_PIECE_START, 5)
	// Captions on, word by word; the transcript came with it (no second one).
	await openTool(page, 'Captions')
	await expect(
		page.getByRole('button', { name: 'Captions', exact: true, pressed: true })
	).toHaveText('On')
	await expect(page.getByRole('combobox', { name: 'Caption style' })).toHaveValue('words')
	expect(seen.editorTranscripts).toBe(0)

	// The export is 9:16, and the crop follows the square: near the crop's
	// middle at 1 s, and at 3 s still in it, where a centred crop has lost it.
	const bytes = await exportVideo(page)
	const { videoWidth, videoHeight, frames } = await readExportFrames(
		page,
		bytes,
		[1, 3],
		({ context, width, height }) => {
			const data = context.getImageData(0, 0, width, height).data
			let sum = 0
			let count = 0
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = (y * width + x) * 4
					if ((data[i] ?? 0) > 200 && (data[i + 2] ?? 0) < 90) {
						sum += x
						count++
					}
				}
			}
			return { squareX: count > 0 ? sum / count / width : -1 }
		}
	)
	expect([videoWidth, videoHeight]).toEqual([102, 180])
	expect(frames[0]?.squareX).toBeGreaterThan(0.3)
	expect(frames[0]?.squareX).toBeLessThan(0.7)
	// At 3 s the crop has panned right to the frame's edge, the square right of its middle.
	expect(frames[1]?.squareX).toBeGreaterThan(0.5)

	// One Undo takes the whole plan away; Redo brings it back.
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect
		.poll(async () => JSON.parse((await scrubber.getAttribute('data-segments')) ?? '[]').length)
		.toBe(1)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect
		.poll(async () => JSON.parse((await scrubber.getAttribute('data-segments')) ?? '[]').length)
		.toBe(2)
})

test('an unclear request asks first; the plan says what it left out; Cancel changes nothing', async ({
	page
}) => {
	const seen = await mockMakeActions(page, WORDS, [
		reply({ questions: ['Where will you post it?', 'Should it be funny or serious?'] }),
		reply({
			style: 'professional',
			format: 'other',
			captions: 'classic',
			shape: 'original',
			zoomSentences: [],
			title: 'Meet Jordan from the team',
			cannotDo: ["Adding stock footage isn't something Retake can do."]
		})
	])
	await startMaking(page, 'make it better')

	await expect(page.getByRole('heading', { name: 'A few questions first' })).toBeVisible({
		timeout: 60_000
	})
	await page.getByRole('textbox', { name: 'Where will you post it?' }).fill('LinkedIn')
	await page.getByRole('textbox', { name: 'Should it be funny or serious?' }).fill('Serious')
	await page.getByRole('button', { name: 'Plan it' }).click()

	await expect(plan(page)).toBeVisible({ timeout: 30_000 })
	expect(seen.plans).toHaveLength(2)
	expect(seen.plans[1]).toContain('LinkedIn')
	await expect(plan(page).getByRole('heading')).toHaveText(
		/^A professional edit, about \d seconds$/
	)
	await expect(plan(page)).toContainText('Captions, a line or two at a time')
	// The title named someone never mentioned: left out, and said so.
	await expect(plan(page)).toContainText(
		'Left out a title that named someone or something not in the video'
	)
	await expect(plan(page)).toContainText("Adding stock footage isn't something Retake can do.")

	// Cancel: back to the request, nothing opened.
	await plan(page).getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByRole('textbox', { name: 'What should it become?' })).toHaveValue(
		'make it better'
	)
	await expect(page).toHaveURL(/\/make$/)
})

/** A 2 s, 660 Hz tone at amplitude 0.5 as a 48 kHz WAV: the "music". */
function toneWav(seconds = 2, hz = 660): Buffer {
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
		wav.writeInt16LE(Math.round(0.5 * Math.sin((2 * Math.PI * hz * i) / rate) * 0x7fff), 44 + i * 2)
	}
	return wav
}

test('the music picked plays under the whole edit, turned down while someone speaks', async ({
	page
}) => {
	await mockMakeActions(
		page,
		WORDS,
		[reply({ music: 'tone.wav', shape: 'original', zoomSentences: [], captions: 'off' })],
		['tone.wav']
	)
	await page.route('**/music/tone.wav', (route) =>
		route.fulfill({ body: toneWav(), contentType: 'audio/wav' })
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText('Music: tone.wav, quieter while someone speaks', {
		timeout: 60_000
	})
	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await openTool(page, 'Audio')
	// The 2 s track, repeated to fill the edit.
	await expect(page.getByText('tone.wav').first()).toBeVisible()

	// In the edit: "Hello." 0.1–0.9 s, then speech from 1.7 s on. The music
	// (660 Hz, at 35%) is down to a quarter of that under the words and back
	// up in the pause between them.
	const bytes = await exportVideo(page)
	const [hello, pause, speech] = await readToneLevels(
		page,
		bytes,
		[0.5, 1.3, 2.5],
		{ music: 660 },
		0.5
	)
	expect(pause?.music, `music in the pause: ${pause?.music}`).toBeGreaterThan(0.25)
	expect(hello?.music, `music under "Hello.": ${hello?.music}`).toBeLessThan(0.15)
	expect(speech?.music, `music under speech: ${speech?.music}`).toBeLessThan(0.15)
	expect(speech?.music, 'still playing under speech').toBeGreaterThan(0.03)
})

/**
 * Records a video of coloured noise, square, with a tone throughout (busy
 * pictures like a real recording's, each as large as a small JPEG of the
 * picture gets), and picks it in the file input labelled `label`, as a
 * user would. It stays in the page: tens of MB, too big to pass back and
 * forth. Recorded in real time, so `seconds` long to make.
 */
async function pickNoiseVideo(page: Page, label: string, seconds: number): Promise<void> {
	await page.evaluate(
		async ({ label, seconds }) => {
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 320 })
			const context = canvas.getContext('2d')
			if (!context) throw new Error('no 2d context')
			const stream = canvas.captureStream(10)
			const audio = new AudioContext()
			await audio.resume()
			const destination = audio.createMediaStreamDestination()
			const oscillator = audio.createOscillator()
			oscillator.connect(destination)
			oscillator.start()
			for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
			const recorder = new MediaRecorder(stream, {
				mimeType: 'video/webm;codecs=vp8,opus',
				videoBitsPerSecond: 8_000_000
			})
			const chunks: Blob[] = []
			recorder.ondataavailable = (event) => chunks.push(event.data)
			const stopped = new Promise((resolve) => (recorder.onstop = resolve))
			const image = context.createImageData(320, 320)
			const draw = setInterval(() => {
				for (let i = 0; i < image.data.length; i++) {
					image.data[i] = i % 4 === 3 ? 255 : Math.random() * 256
				}
				context.putImageData(image, 0, 0)
			}, 100)
			recorder.start(100)
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			recorder.stop()
			await stopped
			clearInterval(draw)
			const input = document.querySelector(`input[aria-label="${label}"]`)
			if (!(input instanceof HTMLInputElement)) throw new Error(`no file input ${label}`)
			const picked = new DataTransfer()
			picked.items.add(new File(chunks, 'busy.webm', { type: 'video/webm' }))
			input.files = picked.files
			input.dispatchEvent(new Event('change', { bubbles: true }))
		},
		{ label, seconds }
	)
}

/** The most text React lets the strings inside one array of a server action's arguments hold. */
const REACT_ARRAY_LIMIT = 1_000_000

test("a long, busy video's pictures reach the server whole, and its reel comes out under a minute", async ({
	page
}) => {
	// A minute of noise to record, then its 35 pictures to take.
	test.setTimeout(240_000)
	// Twenty 3 s sentences, half a second apart, over the 70 s: the reply
	// cuts none, so the plan runs about 70 s until it's cut to fit.
	const sentences = Array.from({ length: 20 }, (_, i) => w(`Step${i + 1}.`, i * 3.5, i * 3.5 + 3))
	const seen = await mockMakeActions(page, sentences, [
		reply({
			zoomSentences: [],
			moments: [
				{ first: 12, last: 14 },
				{ first: 3, last: 5 }
			],
			faces: []
		})
	])
	await page.goto('/make')
	await pickNoiseVideo(page, 'Video to make into something', 70)
	await expect(page.getByText('busy.webm')).toBeVisible()
	await page.getByRole('textbox', { name: 'What should it become?' }).fill('make it a reel')
	await submitMake(page, 'make it a reel')

	// Sent as an array of strings, these pictures were refused by the server
	// before the action ran: in production, "Minified React error #441".
	await expect(plan(page)).toBeVisible({ timeout: 120_000 })
	const pictures = seen.plans[0]?.match(/\/9j\/[A-Za-z0-9+/=]*/g) ?? []
	const characters = pictures.reduce((sum, picture) => sum + picture.length, 0)
	expect(pictures.length).toBeGreaterThanOrEqual(34)
	expect(characters, `the pictures held ${characters} characters`).toBeGreaterThan(
		REACT_ARRAY_LIMIT
	)

	// Under 60 seconds, said so, and so in the editor.
	await expect(plan(page).getByRole('heading')).toHaveText(/^An Instagram Reel, about 5\d seconds$/)
	// The recording runs about 70 s (a little less when frames were dropped).
	await expect(plan(page)).toContainText(/Shortened from 1:\d\d to 0:5\d/)
	await expect(plan(page)).toContainText(
		'Cut further to stay under 60 seconds, keeping the key moments'
	)
	// It opens with the strongest moment, not with what came first.
	await expect(plan(page)).toContainText('Opens with its strongest line: “Step12.”')
	await applyAndEditManually(page)
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await expect(scrubber).toBeVisible({ timeout: 60_000 })
	await expect
		.poll(async () => Number(await scrubber.getAttribute('aria-valuemax')), { timeout: 30_000 })
		.toBeGreaterThan(50)
	expect(Number(await scrubber.getAttribute('aria-valuemax'))).toBeLessThan(60)
})

test('a screen recording made vertical keeps all of its picture, with black bars above and below', async ({
	page
}) => {
	// A screen demo whose picture matters: fitted with black bars, not designed.
	const seen = await mockMakeActions(page, WORDS, [
		reply({ subject: 'screen', pictureMatters: true, zoomSentences: [] })
	])
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText('Vertical 9:16, the whole picture with black bars', {
		timeout: 60_000
	})
	expect(seen.plans).toHaveLength(1)
	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})

	// 320 × 180 fitted into 9:16 is 320 wide and 569 high, recorded at 180 × 320:
	// the picture in a band across the middle (y 110 to 210), black above and below.
	const bytes = await exportVideo(page)
	const { videoWidth, videoHeight, frames } = await readExportFrames(
		page,
		bytes,
		[1],
		({ context, width, height }) => {
			const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)]
			const brightest = (y: number) => {
				let most = 0
				const row = context.getImageData(0, y, width, 1).data
				// Red, green and blue; not alpha, which is always 255.
				for (let i = 0; i < row.length; i++) if (i % 4 !== 3) most = Math.max(most, row[i] ?? 0)
				return most
			}
			let left = width
			let right = -1
			for (let y = 0; y < height; y++) {
				const row = context.getImageData(0, y, width, 1).data
				for (let x = 0; x < width; x++) {
					if ((row[x * 4] ?? 0) > 200 && (row[x * 4 + 2] ?? 0) < 90) {
						left = Math.min(left, x)
						right = Math.max(right, x)
					}
				}
			}
			return {
				topBar: brightest(40),
				bottomBar: brightest(280),
				leftEdge: pixel(2, 160),
				rightEdge: pixel(width - 3, 160),
				squareLeft: left,
				squareRight: right
			}
		}
	)
	expect([videoWidth, videoHeight]).toEqual([180, 320])
	const [frame] = frames
	// Black bars: nothing brighter than the encoder's noise above and below.
	expect(frame?.topBar).toBeLessThan(30)
	expect(frame?.bottomBar).toBeLessThan(30)
	// The picture's own background (#112233) reaches both sides: nothing was cut off.
	for (const edge of [frame?.leftEdge, frame?.rightEdge]) {
		expect(edge?.[2], `blue at the edge: ${String(edge)}`).toBeGreaterThan(35)
	}
	// The whole orange square is in: about 60 × 0.5625 = 34 px wide, at its ~1 s place.
	expect((frame?.squareRight ?? 0) - (frame?.squareLeft ?? 0)).toBeGreaterThan(28)
	expect(frame?.squareLeft).toBeGreaterThan(40)
})

test('a request that fails on the server shows a plain message, never the error itself', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [reply()])
	// The plan request crashes on the server, as the pictures once did: the
	// page gets an error in place of a reply.
	await page.route(
		(url) => url.pathname.endsWith('/make'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action'] || !request.postData()?.includes('"frames"')) {
				return route.fallback()
			}
			await route.fulfill({ status: 500, body: 'Internal Server Error' })
		}
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(
		page.getByText("Retake couldn't plan the edit just now. Go back and try again in a moment.")
	).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText(/React|Error|500/)).toHaveCount(0)
	await page.getByRole('button', { name: 'Back' }).click()
	await expect(page.getByRole('textbox', { name: 'What should it become?' })).toHaveValue(
		'make this an Instagram reel'
	)
})

/**
 * A plan that names someone never mentioned and has no key line, and a
 * second check that fixes both. A screen recording: the whole picture
 * fitted, 180 × 320, so the captions are large enough to measure in the
 * export, on black.
 */
const mockCheckThatFixes = (page: Page) =>
	mockMakeActions(
		page,
		WORDS,
		[
			reply({
				title: 'Meet Jordan',
				zoomSentences: [],
				captions: 'bold_words',
				subject: 'screen',
				// The picture matters here: fitted with black bars, not designed.
				pictureMatters: true,
				faces: []
			})
		],
		[],
		[
			{
				problems: ['The title named someone who is never mentioned.'],
				title: 'This is the key point',
				keyLines: [{ sentence: 3, text: 'Bye' }],
				captions: 'highlight',
				transition: 'none',
				dropSentences: [],
				tooShort: false
			}
		]
	)

/** The plan card says the check fixed the plan, and what it fixed; the check read the plan as made. */
async function expectCheckFixed(page: Page, seen: { checks: string[] }) {
	await expect(plan(page)).toContainText('Checked against your request, and fixed:', {
		timeout: 60_000
	})
	await expect(plan(page)).toContainText('The title named someone who is never mentioned.')
	await expect(plan(page)).toContainText('Title at the start: “This is the key point”')
	// The check read the plan as made: its title, what it made, how long.
	expect(seen.checks).toHaveLength(1)
	// It had already lost its title (Jordan was never mentioned): the check put one back.
	expect(seen.checks[0]).toContain('Title: none')
	expect(seen.checks[0]).toContain('Making: instagram_reel')
}

test('the second check fixes the plan before it shows: Cinematic, its title comes in word by word', async ({
	page
}) => {
	const seen = await mockCheckThatFixes(page)
	// Cinematic: a title that comes in word by word (the look sets it, not the check).
	await startMaking(page, 'make this a cinematic Instagram reel')
	await expectCheckFixed(page, seen)
	// The look's captions, a line or two at a time (the check's highlight is not the user's words).
	await expect(plan(page)).toContainText('Captions, a line or two at a time')

	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	// At the start, the title's words haven't come in yet, each one its own.
	const words = page.locator('[data-title-text] > span > span')
	await expect(words).toHaveCount(5)
	await expect.poll(() => words.first().evaluate((w) => getComputedStyle(w).opacity)).toBe('0')
	// Once in, it's the whole line at rest: no word by word left.
	await seekTo(page, 1.5)
	await expect(words).toHaveCount(0)
	await expect(page.locator('[data-title-text]')).toHaveText('This is the key point')

	// The export (the 320 × 180 video fitted to 9:16 with black bars). At
	// 0.1 s the title (near the top) has barely begun to come in; by 2.5 s it
	// is all there, and "This is the key point." is captioned at the bottom.
	const bytes = await exportVideo(page)
	const { frames } = await readExportFrames(
		page,
		bytes,
		[0.1, 2.5],
		({ context, width, height }) => {
			const count = (
				top: number,
				bottom: number,
				test: (r: number, g: number, b: number) => boolean
			) => {
				const data = context.getImageData(0, top, width, bottom - top).data
				let n = 0
				for (let i = 0; i < data.length; i += 4) {
					if (test(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) n++
				}
				return n
			}
			return {
				titleWhite: count(
					Math.round(height * 0.08),
					Math.round(height * 0.28),
					(r, g, b) => r > 220 && g > 220 && b > 220
				),
				captionWhite: count(
					Math.round(height * 0.6),
					height,
					(r, g, b) => r > 200 && g > 200 && b > 200
				)
			}
		}
	)
	const [start, later] = frames
	expect(later?.titleWhite, 'the whole title by 2.5 s').toBeGreaterThan(40)
	expect(start?.titleWhite ?? 0, `the title at ${start?.shown} s`).toBeLessThan(
		(later?.titleWhite ?? 0) / 2
	)
	expect(later?.captionWhite, 'the line being said, captioned').toBeGreaterThan(5)
})

test('the second check fixes the plan before it shows: Bold by default, its title and key line applied', async ({
	page
}) => {
	const seen = await mockCheckThatFixes(page)
	// No look named: a reel's own, Bold, whose pacing leaves room for the check's key line.
	await startMaking(page, 'make this an Instagram reel')
	await expectCheckFixed(page, seen)
	await expect(plan(page)).toContainText('Captions, one big word at a time')

	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	// The key line (after the title: never two at once) is on the Text lane, beside the title.
	await expect(page.getByRole('button', { name: 'Bye', exact: true })).toBeVisible()
	await seekTo(page, 1.5)
	await expect(page.locator('[data-title-text]')).toHaveText('This is the key point')
})

test("the plan's summary shows whole, with the edit's real length; a check's too short is shown", async ({
	page
}) => {
	// Over 200 characters, and its length (55 s) a guess: the edit is a few seconds.
	const summary =
		'Shortened the 6s take to 55 seconds, keeping the greeting, the key point and the goodbye, ' +
		'while cutting out the long pause before the last line, the dead air at the start and the ' +
		'end, and every filler word in between.'
	const seen = await mockMakeActions(
		page,
		WORDS,
		[reply({ format: 'other', style: 'professional', shape: 'original', summary })],
		[],
		[{ ...NOTHING_TO_FIX, tooShort: true }]
	)
	await startMaking(page, 'make it professional')
	const heading = plan(page).getByRole('heading', {
		name: /A professional edit, about \d+ seconds/
	})
	await expect(heading).toBeVisible({ timeout: 60_000 })
	const seconds = Number((await heading.textContent())?.match(/about (\d+) seconds/)?.[1])
	// Whole, to its last word, and saying the length the plan shows.
	await expect(
		plan(page).getByText(summary.replace('55 seconds', `${seconds} seconds`))
	).toBeVisible()
	await expect(plan(page)).not.toContainText('55 seconds')
	// The check found it too short: a professional edit has nothing to fill to, so it says so.
	expect(seen.checks).toHaveLength(1)
	await expect(plan(page).getByRole('note')).toHaveText(
		`The check found this shorter than you asked for, at ${seconds} seconds, and there was nothing more to add. Edit manually to add more.`
	)
	await expect(plan(page)).toContainText('Checked against your request: nothing to fix.')
	await expect(plan(page).getByRole('button', { name: 'Apply' })).toBeEnabled()
})

test("a second check that can't run leaves the plan as made, and says so", async ({ page }) => {
	await mockMakeActions(page, WORDS, [reply()])
	await page.route(
		(url) => url.pathname.endsWith('/make'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action'] || !request.postData()?.includes('"planText"')) {
				return route.fallback()
			}
			await route.fulfill({ status: 500, body: 'Internal Server Error' })
		}
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText(
		'The second check couldn’t run, so this is the plan as first made.',
		{ timeout: 60_000 }
	)
	await expect(plan(page).getByRole('button', { name: 'Apply' })).toBeEnabled()
})

test('a plan that never comes back is given up after about a minute, with a plain message and a way back', async ({
	page
}) => {
	// The server gives up at 60 s; the page, 5 s after, whatever happens to the request.
	test.setTimeout(150_000)
	await mockMakeActions(page, WORDS, [reply()])
	// A fake AI that never answers: the plan request is held, never fulfilled.
	await page.route(
		(url) => url.pathname.endsWith('/make'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action'] || !request.postData()?.includes('"frames"')) {
				return route.fallback()
			}
			await new Promise(() => {})
		}
	)
	await startMaking(page, 'make this an Instagram reel')
	const message = page.getByText(
		"Retake couldn't plan the edit just now. Go back and try again in a moment."
	)
	await expect(page.getByText('Planning the edit…')).toBeVisible({ timeout: 60_000 })
	await expect(message).toBeVisible({ timeout: 90_000 })
	await page.getByRole('button', { name: 'Back' }).click()
	await expect(page.getByRole('textbox', { name: 'What should it become?' })).toHaveValue(
		'make this an Instagram reel'
	)
})

test("a refused key or a usage limit shows the server's plain words", async ({ page }) => {
	await mockMakeActions(page, WORDS, [reply()])
	const refused = "The AI isn't available right now. Try again later."
	// The plan request comes back as the server answers a refused key.
	await page.route(
		(url) => url.pathname.endsWith('/make'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action'] || !request.postData()?.includes('"frames"')) {
				return route.fallback()
			}
			const response = await route.fetch({ postData: JSON.stringify([{ frames: '' }]) })
			await route.fulfill({
				response,
				body: (await response.text()).replace(
					/\{"ok":false[^\n]*\}/,
					JSON.stringify({ ok: false, error: refused, status: 401 })
				)
			})
		}
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(page.getByText(refused)).toBeVisible({ timeout: 60_000 })
})

test('a plan cut off by its output cap comes back as no plan: a plain message, never a crash', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [reply()])
	// The plan action's answer when Gemini's reply was cut off and didn't parse.
	await page.route(
		(url) => url.pathname.endsWith('/make'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action'] || !request.postData()?.includes('"frames"')) {
				return route.fallback()
			}
			const response = await route.fetch({ postData: JSON.stringify([{ frames: '' }]) })
			await route.fulfill({
				response,
				body: (await response.text()).replace(
					/\{"ok":false[^\n]*\}/,
					JSON.stringify({ ok: true, data: { reply: null, tracks: [] } })
				)
			})
		}
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(
		page.getByText("Retake couldn't make a plan from that. Try saying it another way.")
	).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText(/React|Error|500/)).toHaveCount(0)
})

/** The average colour of a region of an image, its edges as fractions of it. */
type Region = { x: number; y: number; width: number; height: number }
const REGIONS: Record<string, Region> = {
	// The background, at the left and right edges, clear of all text.
	left: { x: 0.02, y: 0.36, width: 0.08, height: 0.12 },
	right: { x: 0.9, y: 0.36, width: 0.08, height: 0.12 },
	// Inside the picture card's top-left corner: the test video's dark blue (#112233).
	card: { x: 0.08, y: 0.79, width: 0.06, height: 0.02 }
}

/** Each region's average red, green and blue in an image (PNG bytes), read in the page. */
async function regionColours(page: Page, png: Buffer, regions: Record<string, Region> = REGIONS) {
	return page.evaluate(
		async ({ bytes, regions }) => {
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: 'image/png' })
			)
			const canvas = Object.assign(document.createElement('canvas'), {
				width: image.width,
				height: image.height
			})
			const context = canvas.getContext('2d')
			if (!context) throw new Error('no 2d context')
			context.drawImage(image, 0, 0)
			return Object.fromEntries(
				Object.entries(regions).map(([name, r]) => {
					const data = context.getImageData(
						Math.round(r.x * image.width),
						Math.round(r.y * image.height),
						Math.max(1, Math.round(r.width * image.width)),
						Math.max(1, Math.round(r.height * image.height))
					).data
					const sum = [0, 0, 0]
					for (let i = 0; i < data.length; i += 4) {
						for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0)
					}
					return [name, sum.map((v) => Math.round(v / (data.length / 4)))]
				})
			) as Record<string, number[]>
		},
		{ bytes: [...png], regions }
	)
}

test('a reel of a meeting is designed around the speech: a 9:16 frame, its picture a card, the export as the preview', async ({
	page
}) => {
	test.setTimeout(150_000)
	await mockMakeActions(page, WORDS, [
		reply({
			subject: 'meeting',
			faces: [],
			card: 'corner',
			zoomSentences: [],
			title: 'This is the key point',
			keyLines: [{ sentence: 3, text: 'Bye' }]
		})
	])
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText(
		'Vertical 9:16, designed around the speech: a moving background, big text, and the picture as a small card in the corner',
		{ timeout: 60_000 }
	)
	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})

	// The preview's frame is itself 9:16, the background drawn in it, the picture a card low on the left.
	const frame = page.getByTestId('output-frame')
	const box = await frame.boundingBox()
	if (!box) throw new Error('no output frame')
	expect(box.width / box.height).toBeCloseTo(9 / 16, 2)
	await expect(frame.getByTestId('design-background')).toBeVisible()
	const card = await frame.getByTestId('picture').boundingBox()
	if (!card) throw new Error('no picture card')
	expect((card.x - box.x) / box.width).toBeCloseTo(0.06, 1)
	expect(card.width / box.width).toBeCloseTo(0.44, 1)
	expect((card.y + card.height - box.y) / box.height).toBeCloseTo(0.92, 1)

	// The preview at 1 s, and the export's frame at 1 s: the same colours, region by region.
	await seekTo(page, 1)
	await page.waitForTimeout(300)
	const preview = await regionColours(page, await frame.screenshot())
	const bytes = await exportVideo(page)
	const { videoWidth, videoHeight, frames } = await readExportFrames(
		page,
		bytes,
		[1],
		({ context }) => ({ png: context.canvas.toDataURL('image/png') })
	)
	expect([videoWidth, videoHeight]).toEqual([180, 320])
	const exported = await regionColours(
		page,
		Buffer.from(String(frames[0]?.png).split(',')[1] ?? '', 'base64')
	)
	for (const name of Object.keys(REGIONS)) {
		const a = preview[name] ?? []
		const b = exported[name] ?? []
		const off = Math.max(...a.map((value, c) => Math.abs(value - (b[c] ?? 0))))
		expect(off, `${name}: preview ${a}, export ${b}`).toBeLessThan(25)
	}
	// A coloured background, not black bars; the card the picture's own dark blue.
	expect(Math.max(...(exported.left ?? [])), 'the background is coloured').toBeGreaterThan(40)
	const [r = 0, g = 0, blue = 0] = exported.card ?? []
	expect(blue > r && blue > 35 && g < 80, `the card shows the picture: ${exported.card}`).toBe(true)
})

test('the plan comes beside the video; Apply opens the edited video with only the chat, and the full editor is a click away', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [reply()])
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	// The plan beside the video it's made from, as the design has it.
	await expect(page.getByLabel('talk.webm, the video you picked')).toBeVisible()
	await expect(plan(page).getByRole('button', { name: 'Change my request' })).toBeVisible()

	await plan(page).getByRole('button', { name: 'Apply' }).click()
	const modes = page.getByRole('group', { name: 'Editor mode' })
	await expect(modes.getByRole('button', { name: 'Edit with AI' })).toHaveAttribute(
		'aria-pressed',
		'true',
		{ timeout: 30_000 }
	)
	// Only the chat beside the video: no tools, no timeline.
	await expect(page.getByRole('region', { name: 'Chat' })).toBeVisible()
	await expect(page.getByRole('tab', { name: 'Text & logo' })).toBeHidden()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toHaveCount(0)
	await expect(page.getByRole('region', { name: 'What was applied' })).toContainText(
		'Vertical 9:16, zoomed in to follow the face; the edges are cut off'
	)

	// The full editor, on the same edit: two pieces, the long pause gone.
	await page.getByRole('button', { name: 'Edit manually' }).last().click()
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await expect(scrubber).toBeVisible()
	await expect(page.getByRole('tab', { name: 'Text & logo' })).toBeVisible()
	await expect(modes.getByRole('button', { name: 'Edit manually' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await expect
		.poll(async () => JSON.parse((await scrubber.getAttribute('data-segments')) ?? '[]').length)
		.toBe(2)
	// And back: the chat only again.
	await modes.getByRole('button', { name: 'Edit with AI' }).click()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toHaveCount(0)
})

test('Edit manually on the plan opens the full editor with the plan applied', async ({ page }) => {
	await mockMakeActions(page, WORDS, [reply()])
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	await plan(page).getByRole('button', { name: 'Edit manually' }).click()
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await expect(scrubber).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('tab', { name: /^Transcript/ })).toHaveAttribute(
		'aria-selected',
		'true'
	)
	await expect
		.poll(async () => JSON.parse((await scrubber.getAttribute('data-segments')) ?? '[]').length)
		.toBe(2)
	await expect(page.getByRole('group', { name: 'Editor mode' })).toHaveCount(0)
})

test('a follow-up in the chat changes the plan: questions first, what changed, Cancel, Apply, Undo, and what it cannot do', async ({
	page
}) => {
	// A key line on sentence 2: the zoom on its key words.
	const first = reply({ keyLines: [{ sentence: 2, text: 'the key point' }] })
	// Shorter: sentence 2 (the long one) out, large captions; the zoom on it goes too.
	const shorter = { ...first, removeSentences: [2], captions: 'large' as const, maxSeconds: null }
	const seen = await mockMakeActions(
		page,
		WORDS,
		[first],
		[],
		[NOTHING_TO_FIX],
		[
			{ ...first, questions: ['What should go?'], maxSeconds: null },
			shorter,
			shorter,
			// Asked of the plan again after Undo: it can't, and changes nothing.
			{ ...first, cannotDo: ['Add stock footage of a city'], maxSeconds: null }
		]
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	await plan(page).getByRole('button', { name: 'Apply' }).click()
	const chat = page.getByRole('region', { name: 'Chat' })
	await expect(chat).toBeVisible({ timeout: 30_000 })
	const yourEdit = page.getByText('Your edit', { exact: true }).locator('..')
	const firstLength = (await yourEdit.locator('.font-mono').textContent()) ?? ''
	expect(firstLength).toMatch(/^0:0\d$/)

	// The chat speaks of the plan now.
	const box = chat.getByRole('textbox', { name: 'Edit command' })
	await expect(box).toHaveAttribute('placeholder', 'Try "make it shorter"')
	await chat.getByRole('button', { name: 'Make it shorter' }).click()
	// The caption change is the user's own ask: their words name the captions.
	await box.press('End')
	await box.pressSequentially(' and make the captions bigger')
	await chat.getByRole('button', { name: 'Run' }).click()

	// Unclear: a question first, nothing planned.
	const answer = chat.getByRole('status', { name: 'The changed plan' })
	await expect(answer).toContainText('A few questions first:', { timeout: 60_000 })
	await answer.getByRole('textbox', { name: 'What should go?' }).fill('The long middle sentence')
	await answer.getByRole('button', { name: 'Update the plan' }).click()

	// What would change, against the plan applied: shorter, larger captions, the zoom gone.
	await expect(answer).toContainText('What would change:', { timeout: 60_000 })
	const lengths = (await answer.textContent())?.match(/Length (\d+) s to (\d+) s/)
	expect(lengths, 'the length, before and after').not.toBeNull()
	expect(Number(lengths?.[2])).toBeLessThan(Number(lengths?.[1]))
	await expect(answer).toContainText('Captions: one big word at a time to large lines')
	await expect(answer).toContainText('Zooms 1 to 0')
	// The follow-up sent the plan, the transcript and the answer; not the pictures again.
	expect(seen.followUps).toHaveLength(2)
	const asked = seen.followUps[1] ?? ''
	expect(asked).toContain('"followUp":"Make it shorter and make the captions bigger"')
	expect(asked).toContain('"answer":"The long middle sentence"')
	expect(asked).toContain('"captions":"bold_words"')
	expect(asked).toContain('"text":"This is the key point."')
	expect(asked).not.toContain('"frames"')
	expect(seen.plans).toHaveLength(1)

	// Cancel: nothing changes.
	await answer.getByRole('button', { name: 'Cancel' }).click()
	await expect(chat).toContainText('Cancelled. The plan stays as it was.')
	await expect(yourEdit.locator('.font-mono')).toHaveText(firstLength)

	// Asked again and applied: the edit is the new plan.
	await box.fill('make it shorter')
	await box.press('Enter')
	const again = chat.getByRole('status', { name: 'The changed plan' })
	await expect(again).toContainText('What would change:', { timeout: 60_000 })
	await again.getByRole('button', { name: 'Apply changes' }).click()
	await expect(chat).toContainText('Applied. Undo, at the top, goes back to the plan before.')
	await expect(yourEdit.locator('.font-mono')).toHaveText(`0:0${lengths?.[2]}`)

	// Undo: back to the plan before the follow-up.
	await page.getByRole('button', { name: 'Undo' }).click()
	await expect(yourEdit.locator('.font-mono')).toHaveText(firstLength)

	// A follow-up now changes that plan (sentence 2 back in), and says plainly what it can't do.
	await box.fill('add stock footage of a city')
	await box.press('Enter')
	const cannot = chat.getByRole('status', { name: 'The changed plan' })
	await expect(cannot).toContainText('Nothing in the plan would change.', { timeout: 60_000 })
	await expect(cannot).toContainText('What Retake can’t do:')
	await expect(cannot).toContainText('Add stock footage of a city')
	await expect(cannot.getByRole('button', { name: 'Apply changes' })).toHaveCount(0)
	await expect(cannot).not.toContainText('changed by hand')
	expect(seen.followUps[3]).toContain('"removeSentences":[]')
	expect(seen.followUps[3]).toContain('"earlier":["make it shorter"]')
})

test('shape and fit: wide made vertical over a blur, tall made horizontal with bars, a match left whole, then made square; each export the preview, at its own size', async ({
	page
}) => {
	test.setTimeout(300_000)
	const WIDE = { width: 320, height: 180 }
	const TALL = { width: 180, height: 320 }
	// An ad of a product demo filmed (not a screen recording, which has its
	// own treatments): its picture carries it, so nothing is designed or followed.
	const ad = (fields: Partial<MakeReply>) =>
		reply({
			style: 'ad',
			format: 'other',
			subject: 'other',
			pictureMatters: true,
			faces: [],
			captions: 'off',
			zoomSentences: [],
			...fields
		})

	/** Makes `request` of a video `size`, opens the plan in the full editor, and returns the plan's text. */
	async function make(size: typeof WIDE, request: string) {
		await page.goto('/make')
		const video = await recordTestVideo(page, TONE, 0, size)
		await page
			.getByLabel('Video to make into something')
			.setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: video })
		await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
		await submitMake(page, request)
		await expect(plan(page)).toBeVisible({ timeout: 60_000 })
		return (await plan(page).textContent()) ?? ''
	}

	/**
	 * The preview's frame is `ratio`; at 1 s its `regions` have the export's
	 * colours; the export is `width` × `height`. Returns the export's colours.
	 */
	async function matches(
		ratio: number,
		size: { width: number; height: number },
		regions: Record<string, Region>
	) {
		const frame = page.getByTestId('output-frame')
		const box = await frame.boundingBox()
		if (!box) throw new Error('no output frame')
		expect(box.width / box.height).toBeCloseTo(ratio, 1)
		await seekTo(page, 1)
		await page.waitForTimeout(300)
		const preview = await regionColours(page, await frame.screenshot(), regions)
		const bytes = await exportVideo(page)
		const { videoWidth, videoHeight, frames } = await readExportFrames(
			page,
			bytes,
			[1],
			({ context }) => ({ png: context.canvas.toDataURL('image/png') })
		)
		expect([videoWidth, videoHeight], 'the exported file’s own size').toEqual([
			size.width,
			size.height
		])
		const exported = await regionColours(
			page,
			Buffer.from(String(frames[0]?.png).split(',')[1] ?? '', 'base64'),
			regions
		)
		for (const name of Object.keys(regions)) {
			const a = preview[name] ?? []
			const b = exported[name] ?? []
			const off = Math.max(...a.map((value, c) => Math.abs(value - (b[c] ?? 0))))
			expect(off, `${name}: preview ${a}, export ${b}`).toBeLessThan(25)
		}
		return exported
	}
	const brightest = (colour: number[] | undefined) => Math.max(...(colour ?? [0]))
	// Above the picture in a tall frame; beside it in a wide one; and its middle.
	const TOP = { top: { x: 0.1, y: 0.03, width: 0.8, height: 0.12 } }
	const SIDE = { side: { x: 0.02, y: 0.3, width: 0.08, height: 0.4 } }
	const MIDDLE = { middle: { x: 0.42, y: 0.15, width: 0.16, height: 0.1 } }

	// 1. Wide made a vertical ad over a blur, from a brief.
	await mockMakeActions(page, WORDS, [
		ad({
			shape: 'vertical',
			fit: 'blur',
			brief: { ...reply().brief, audience: 'small business owners', callToAction: 'Try it free' }
		})
	])
	const first = await make(WIDE, 'A vertical ad for small business owners. End with: Try it free')
	expect(first).toContain('Vertical 9:16, the whole picture over a blurred copy of itself')
	expect(first).toContain('So nothing of the picture is cut off')
	expect(first).toContain('From your brief: for small business owners · ends with “Try it free”')
	await applyAndEditManually(page)
	await expect(page.getByTestId('blur-backdrop')).toBeVisible({ timeout: 30_000 })
	const blurred = await matches(9 / 16, { width: 180, height: 320 }, { ...TOP, ...MIDDLE })
	// Above the picture: the blurred, darkened picture, not black.
	expect(brightest(blurred.top), `blurred, not black: ${blurred.top}`).toBeGreaterThan(14)

	// 2. Tall made a horizontal ad, with black bars.
	await mockMakeActions(page, WORDS, [ad({ shape: 'horizontal', fit: 'bars' })])
	const second = await make(TALL, 'a horizontal ad, keep the black bars')
	expect(second).toContain('Horizontal 16:9, the whole picture with black bars')
	await applyAndEditManually(page)
	await expect(page.getByTestId('blur-backdrop')).toHaveCount(0)
	const barred = await matches(16 / 9, { width: 320, height: 180 }, { ...SIDE, ...MIDDLE })
	expect(brightest(barred.side), `black bars: ${barred.side}`).toBeLessThan(12)
	expect(brightest(barred.middle), `the picture: ${barred.middle}`).toBeGreaterThan(30)

	// 3. Wide asked horizontal: already that shape, nothing cropped or barred.
	await mockMakeActions(
		page,
		WORDS,
		[ad({ shape: 'horizontal', fit: 'fill', fitAsked: true })],
		[],
		undefined,
		// Then "make it square", over a blur.
		[ad({ shape: 'square', fit: 'blur', fitAsked: true })]
	)
	const third = await make(WIDE, 'a horizontal ad')
	expect(third).toContain('Horizontal 16:9: the video is already this shape, so nothing is cropped')
	await applyAndEditManually(page)
	const whole = await matches(16 / 9, WIDE, { ...SIDE, ...MIDDLE })
	expect(brightest(whole.side), `the picture to the edge: ${whole.side}`).toBeGreaterThan(30)

	// The follow-up: square, over a blur; what changes, then the export 320 × 320.
	await page
		.getByRole('group', { name: 'Editor mode' })
		.getByRole('button', { name: 'Edit with AI' })
		.click()
	const chat = page.getByRole('region', { name: 'Chat' })
	const box = chat.getByRole('textbox', { name: 'Edit command' })
	await box.fill('make it square')
	await box.press('Enter')
	const answer = chat.getByRole('status', { name: 'The changed plan' })
	await expect(answer).toContainText('Shape: horizontal 16:9 to square 1:1', { timeout: 60_000 })
	await expect(answer).toContainText('Fit: none (already that shape) to a blurred background')
	await answer.getByRole('button', { name: 'Apply changes' }).click()
	await page
		.getByRole('group', { name: 'Editor mode' })
		.getByRole('button', { name: 'Edit manually' })
		.click()
	await expect(page.getByTestId('blur-backdrop')).toBeVisible()
	const square = await matches(1, { width: 320, height: 320 }, { ...TOP, ...MIDDLE })
	expect(brightest(square.top), `blurred, not black: ${square.top}`).toBeGreaterThan(14)
})

// A screen recording of one known colour, 16:9: where it lands in an export is plain to read.
const GREEN = '#20c040'
const GREEN_SOURCE = { width: 320, height: 180 }
const isGreen = (r: number, g: number, b: number) =>
	Math.abs(r - 0x20) < 45 && g > 140 && Math.abs(b - 0x40) < 50

/** Makes `request` of the green screen recording, and opens the plan in the full editor. */
async function makeGreen(page: Page, request: string) {
	await page.goto('/make')
	const video = await recordTestVideo(page, TONE, 0, GREEN_SOURCE, GREEN)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'screen.webm', mimeType: 'video/webm', buffer: video })
	await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
	await submitMake(page, request)
	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	const text = (await plan(page).textContent()) ?? ''
	await applyAndEditManually(page)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	return text
}

/** The export's frame at 1 s (saved as `name` under SHOT_DIR when set), and the file's own size. */
async function exportedFrame(page: Page, name: string) {
	const bytes = await exportVideo(page)
	const { videoWidth, videoHeight, frames } = await readExportFrames(
		page,
		bytes,
		[1],
		({ context }) => ({ png: context.canvas.toDataURL('image/png') })
	)
	const png = Buffer.from(String(frames[0]?.png).split(',')[1] ?? '', 'base64')
	if (process.env.SHOT_DIR) {
		await writeFile(`${process.env.SHOT_DIR}/${process.env.SHOT_LABEL ?? 'frame'}-${name}.png`, png)
	}
	return { png, size: [videoWidth, videoHeight] }
}

/** The share of each region (fractions of the image) that is the screen's green. */
async function greenShares(page: Page, png: Buffer, regions: Record<string, Region>) {
	return page.evaluate(
		async ({ bytes, regions, isGreenSource }) => {
			const green = new Function(`return (${isGreenSource})`)() as (
				r: number,
				g: number,
				b: number
			) => boolean
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: 'image/png' })
			)
			const canvas = Object.assign(document.createElement('canvas'), {
				width: image.width,
				height: image.height
			})
			const context = canvas.getContext('2d')
			if (!context) throw new Error('no 2d context')
			context.drawImage(image, 0, 0)
			return Object.fromEntries(
				Object.entries(regions).map(([name, r]) => {
					const data = context.getImageData(
						Math.round(r.x * image.width),
						Math.round(r.y * image.height),
						Math.max(1, Math.round(r.width * image.width)),
						Math.max(1, Math.round(r.height * image.height))
					).data
					let count = 0
					for (let i = 0; i < data.length; i += 4) {
						if (green(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) count++
					}
					return [name, count / (data.length / 4)]
				})
			) as Record<string, number>
		},
		{ bytes: [...png], regions, isGreenSource: isGreen.toString() }
	)
}

/**
 * Checks the green screen is as wide as a frame of `ratio`, centred: green
 * over the middle of where it should be, none in the frame's corners above
 * and below it (or green to the edges, when it fills the frame).
 */
async function expectWholeScreen(page: Page, png: Buffer, ratio: number, label: string) {
	const height = Math.min(1, ratio / (GREEN_SOURCE.width / GREEN_SOURCE.height))
	const top = (1 - height) / 2
	const inner = { x: 0.1, y: top + height * 0.1, width: 0.8, height: height * 0.8 }
	const corner = (x: number, y: number) => ({
		x,
		y,
		width: 0.08,
		height: Math.min(0.08, top * 0.8)
	})
	const bottom = 0.99 - Math.min(0.08, top * 0.8)
	const regions: Record<string, Region> =
		height < 1
			? {
					inner,
					topLeft: corner(0.01, 0.01),
					topRight: corner(0.91, 0.01),
					bottomLeft: corner(0.01, bottom),
					bottomRight: corner(0.91, bottom)
				}
			: { inner, whole: { x: 0, y: 0, width: 1, height: 1 } }
	const shares = await greenShares(page, png, regions)
	expect.soft(shares.inner, `${label}: the screen fills the middle`).toBeGreaterThan(0.95)
	for (const [name, share] of Object.entries(shares)) {
		if (name === 'inner') continue
		if (name === 'whole')
			expect.soft(share, `${label}: the screen fills the frame`).toBeGreaterThan(0.95)
		else expect.soft(share, `${label}: no screen in the ${name} corner`).toBeLessThan(0.05)
	}
}

/** Checks no part of the green screen shows anywhere: no picture, and no card in a corner. */
async function expectNoScreen(page: Page, png: Buffer, label: string) {
	const shares = await greenShares(page, png, {
		whole: { x: 0, y: 0, width: 1, height: 1 },
		bottomLeft: { x: 0, y: 0.6, width: 0.6, height: 0.4 }
	})
	expect.soft(shares.whole, `${label}: no picture of the screen`).toBeLessThan(0.005)
	expect.soft(shares.bottomLeft, `${label}: no card in the corner`).toBeLessThan(0.005)
}

test('a screen recording, slides or any other label fills the frame’s width, centred, in every shape: never a card in a corner', async ({
	page
}) => {
	test.setTimeout(300_000)
	// Each shape, the request that asks for it, and the exported file's size.
	const VERTICAL = {
		shape: 'vertical',
		ratio: 9 / 16,
		request: 'make this an Instagram reel',
		size: [180, 320]
	} as const
	// A screen recording in every shape; then, as a 9:16 reel, the other
	// labels Gemini might give it, and one that isn't on the list at all.
	const CASES = [
		{ ...VERTICAL, subject: 'screen' },
		{ shape: 'square', ratio: 1, request: 'a square video', size: [320, 320], subject: 'screen' },
		{
			shape: 'portrait',
			ratio: 4 / 5,
			request: 'a 4:5 video',
			size: [256, 320],
			subject: 'screen'
		},
		{
			shape: 'horizontal',
			ratio: 16 / 9,
			request: 'a horizontal video',
			size: [320, 180],
			subject: 'screen'
		},
		{ ...VERTICAL, subject: 'slides' },
		{ ...VERTICAL, subject: 'other' },
		{ ...VERTICAL, subject: 'webcam_over_screen' }
	] as const
	for (const { shape, ratio, request, size, subject } of CASES) {
		// Judged by its speech (the picture doesn't carry it): the case that was
		// designed around a card in the corner. The fake reply reaches the page
		// as given, so an unknown label does too.
		await mockMakeActions(page, WORDS, [
			reply({
				style: shape === 'vertical' ? 'reel' : 'ad',
				format: shape === 'vertical' ? 'instagram_reel' : 'other',
				subject: subject as MakeReply['subject'],
				pictureMatters: false,
				faces: [],
				captions: 'off',
				zoomSentences: [],
				shape,
				fit: 'bars'
			})
		])
		await makeGreen(page, request)
		const { png, size: exported } = await exportedFrame(page, `${subject}-${shape}`)
		expect.soft(exported, `${subject}, ${shape}: the exported file's size`).toEqual([...size])
		await expectWholeScreen(page, png, ratio, `${subject}, ${shape}`)
	}
})

test('a screen recording: the whole screen by default, designed with no picture for a promo or text only, whole for an unknown label', async ({
	page
}) => {
	test.setTimeout(300_000)
	// A screen recording, judged by its speech, asking for everything that would zoom into it.
	const screen = (fields: Partial<MakeReply> = {}) =>
		reply({
			subject: 'screen',
			pictureMatters: false,
			faces: [],
			captions: 'off',
			fit: 'fill',
			zoomSentences: [2],
			transition: 'zoom_cut',
			...fields
		})

	// 1. The default: the whole screen, full width and centred; then "text only".
	await mockMakeActions(page, WORDS, [screen()], [], undefined, [screen({ treatment: 'designed' })])
	const first = await makeGreen(page, 'make this an Instagram reel')
	expect(first).toContain('Vertical 9:16, the whole picture with black bars')
	expect(first).toContain('Showing the whole screen so the product stays visible')
	const byDefault = await exportedFrame(page, 'default')
	expect.soft(byDefault.size).toEqual([180, 320])
	await expectWholeScreen(page, byDefault.png, 9 / 16, 'default')

	await page
		.getByRole('group', { name: 'Editor mode' })
		.getByRole('button', { name: 'Edit with AI' })
		.click()
	const chat = page.getByRole('region', { name: 'Chat' })
	const box = chat.getByRole('textbox', { name: 'Edit command' })
	await box.fill('text only')
	await box.press('Enter')
	const answer = chat.getByRole('status', { name: 'The changed plan' })
	await expect(answer).toContainText('Fit: black bars to designed around the speech', {
		timeout: 60_000
	})
	await answer.getByRole('button', { name: 'Apply changes' }).click()
	const textOnly = await exportedFrame(page, 'text-only')
	expect.soft(textOnly.size).toEqual([180, 320])
	await expectNoScreen(page, textOnly.png, 'text only')

	// 2. A promo: designed, no picture of the screen and no card in a corner.
	await mockMakeActions(page, WORDS, [screen()])
	const promo = await makeGreen(page, 'make a promo reel of this')
	expect(promo).toContain(
		'Vertical 9:16, designed around what’s said: a palette background, big captions and text; no picture of the screen'
	)
	expect(promo).toContain('It’s a promo, so it’s text and captions')
	const designed = await exportedFrame(page, 'promo')
	expect.soft(designed.size).toEqual([180, 320])
	await expectNoScreen(page, designed.png, 'promo')

	// 3. A label not on the list, for the same promo: whole, never designed.
	await mockMakeActions(page, WORDS, [
		screen({ subject: 'screencast_with_webcam' as MakeReply['subject'], fit: 'bars' })
	])
	await makeGreen(page, 'make a promo reel of this')
	const unknown = await exportedFrame(page, 'unknown')
	await expectWholeScreen(page, unknown.png, 9 / 16, 'unknown label')
})

test('a brief part the user never gave is shown as chosen for them, not as their brief', async ({
	page
}) => {
	// Gemini fills a tone in whether or not anyone gave one.
	const energetic = reply({ brief: { ...reply().brief, tone: 'energetic' } })
	await mockMakeActions(page, WORDS, [energetic])
	await startMaking(page, 'make a promo ad')
	await expect(plan(page)).toContainText('Chosen for a promo: energetic tone', { timeout: 60_000 })
	await expect(plan(page)).not.toContainText('From your brief')

	await mockMakeActions(page, WORDS, [energetic])
	await startMaking(page, 'make it energetic')
	await expect(plan(page)).toContainText('From your brief: energetic tone', { timeout: 60_000 })
	// The tone was the user's: no "Chosen for" line names it.
	await expect(
		plan(page)
			.getByRole('listitem')
			.filter({ hasText: /^Chosen for/ })
			.filter({ hasText: 'energetic tone' })
	).toHaveCount(0)
	// What it is was asked and skipped (Skip all): chosen for the user, and labelled so.
	await expect(plan(page)).toContainText('Chosen for you: an Instagram Reel')
})

// Five sentences, the first one full caption line of long words; a short pause between each.
const TALK_TONE: Array<[number, boolean]> = [
	[0.95, true],
	[0.45, false],
	[1.6, true],
	[0.5, false],
	[1.6, true],
	[0.5, false],
	[1.6, true],
	[0.5, false],
	[1.6, true]
]
const TALK_WORDS = [
	w('Remarkably', 0.05, 0.4),
	w('good', 0.4, 0.6),
	w('results.', 0.6, 0.9),
	w('This', 1.4, 1.7),
	w('is', 1.7, 1.9),
	w('the', 1.9, 2.1),
	w('key', 2.1, 2.5),
	w('point.', 2.5, 3),
	w('Here', 3.5, 3.9),
	w('is', 3.9, 4.2),
	w('another', 4.2, 4.7),
	w('one.', 4.7, 5.1),
	w('We', 5.6, 5.9),
	w('love', 5.9, 6.3),
	w('how', 6.3, 6.6),
	w('it', 6.6, 6.9),
	w('works.', 6.9, 7.2),
	w('Try', 7.7, 8.1),
	w('it', 8.1, 8.4),
	w('free', 8.4, 8.8),
	w('today.', 8.8, 9.3)
]

test("a designed promo's text never overlaps, in every shape: popping words make room inside the margins, cards sit clear of the captions", async ({
	page
}) => {
	test.setTimeout(480_000)
	await recordTextBoxes(page)
	// A screen recording made a designed ad: a long title, a key line and a
	// call to action over large captions, popping each word.
	const ad = (shape: MakeReply['shape']) =>
		reply({
			style: 'ad',
			format: 'other',
			subject: 'screen',
			pictureMatters: false,
			faces: [],
			zoomSentences: [],
			captions: 'large',
			fit: 'bars',
			shape,
			title: 'Remarkably good results for every single team here',
			keyLines: [{ sentence: 3, text: 'Here is another one' }],
			brief: { ...reply().brief, callToAction: 'Try it free today' }
		})
	const shapes: Array<[string, MakeReply['shape'], [number, number]]> = [
		['9:16', 'vertical', [180, 320]],
		['1:1', 'square', [320, 320]],
		['4:5', 'portrait', [256, 320]],
		['16:9', 'horizontal', [320, 180]]
	]
	for (const [label, shape, size] of shapes) {
		await mockMakeActions(page, TALK_WORDS, [ad(shape)])
		await page.goto('/make')
		const video = await recordTestVideo(page, TALK_TONE, 0, GREEN_SOURCE, GREEN)
		await page
			.getByLabel('Video to make into something')
			.setInputFiles({ name: 'screen.webm', mimeType: 'video/webm', buffer: video })
		// Clean: captions in lines, each word popping (Bold's one word at a time has no line to pop in).
		await page
			.getByRole('textbox', { name: 'What should it become?' })
			.fill('make a clean promo ad')
		await submitMake(page, 'make a clean promo ad')
		await expect(plan(page)).toContainText('designed around what’s said', { timeout: 60_000 })
		await applyAndEditManually(page)
		await expect(page.getByRole('button', { name: 'Export video' })).toBeEnabled({
			timeout: 30_000
		})
		const bytes = await exportVideo(page)
		const report = await textBoxReport(page)
		// Every frame drawn, the preview's and the export's: nothing overlapping, nothing past the margins.
		expect.soft(report.problems, label).toEqual([])
		// And what was checked was there: captions, cards, both at once, and words popping.
		expect.soft(report.frames, `${label}: frames checked`).toBeGreaterThan(100)
		expect.soft(report.withBoth, `${label}: a card over captions`).toBeGreaterThan(0)
		expect.soft(report.popped, `${label}: words popping`).toBeGreaterThan(0)
		// The full-width first line popping, the title over it, the key line, the call to action.
		const { videoWidth, videoHeight, frames } = await readExportFrames(
			page,
			bytes,
			[0.5, 2.2, 4.2, 8.5],
			({ context }) => ({ png: context.canvas.toDataURL('image/png') })
		)
		expect.soft([videoWidth, videoHeight], label).toEqual(size)
		if (process.env.SHOT_DIR) {
			for (const frame of frames) {
				const png = Buffer.from(String(frame.png).split(',')[1] ?? '', 'base64')
				await writeFile(`${process.env.SHOT_DIR}/${label.replace(':', 'x')}-${frame.at}s.png`, png)
			}
		}
	}
})
