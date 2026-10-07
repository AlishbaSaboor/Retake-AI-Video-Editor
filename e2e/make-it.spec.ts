import { test, expect, type Page } from '@playwright/test'
import type { CheckReply, MakeReply } from '../src/app/[locale]/(app)/make/make-plan'
import { toTranscript } from '../src/app/[locale]/editor/transcript'
import { openTool, recordTestVideo, seekTo, w, type TimedWord } from './editor-helpers'
import { exportVideo, readExportFrames, readToneLevels } from './export-frames'

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

const reply = (fields: Partial<MakeReply> = {}): MakeReply => ({
	questions: [],
	style: 'reel',
	format: 'instagram_reel',
	subject: 'one_person',
	summary: 'A short talk, cut into a vertical reel.',
	pictureMatters: false,
	moments: [],
	removeSentences: [],
	removeSpans: [],
	captions: 'bold_words',
	zoomSentences: [2],
	transition: 'none',
	keyLines: [],
	vertical: true,
	faces: FACES,
	music: null,
	title: null,
	cannotDo: [],
	...fields
})

/** The second check's answer: nothing to fix, unless a test says otherwise. */
const NOTHING_TO_FIX: CheckReply = {
	problems: [],
	title: null,
	keyLines: [],
	captions: 'classic',
	transition: 'none',
	dropSentences: []
}

/**
 * Answers the transcript, plan and check requests with canned results, on
 * the Make it page and in the editor. Each request still reaches the real
 * server, which decodes it as it would any other, with one field emptied so
 * validation stops it before any AI call (the audio; the request's text,
 * leaving the pictures whole); only the result inside the reply is
 * swapped. Returns what was asked.
 */
async function mockMakeActions(
	page: Page,
	words: TimedWord[],
	replies: MakeReply[],
	tracks: string[] = [],
	checks: CheckReply[] = [NOTHING_TO_FIX]
) {
	const seen = { plans: [] as string[], checks: [] as string[], editorTranscripts: 0 }
	await page.route(
		(url) => url.pathname.endsWith('/make') || url.pathname.endsWith('/editor'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			const body = request.postData() ?? ''
			const isTranscript = body.includes('"audioBase64"')
			const isPlan = body.includes('"frames"')
			const isCheck = body.includes('"planText"')
			if (!isTranscript && !isPlan && !isCheck) return route.continue()
			if (isTranscript && request.url().includes('/editor')) seen.editorTranscripts++
			const data = isTranscript
				? toTranscript(words)
				: isPlan
					? { reply: replies[Math.min(seen.plans.length, replies.length - 1)], tracks }
					: checks[Math.min(seen.checks.length, checks.length - 1)]
			if (isPlan) seen.plans.push(body)
			if (isCheck) seen.checks.push(body)
			const response = await route.fetch({
				postData: !isTranscript
					? body.replace(/"request":"(?:[^"\\]|\\.)*"/, '"request":""')
					: body.replace(/"audioBase64":"[^"]*"/, '"audioBase64":""')
			})
			await route.fulfill({
				response,
				body: (await response.text()).replace(
					/\{"ok":false[^\n]*\}/,
					JSON.stringify({ ok: true, data })
				)
			})
		}
	)
	return seen
}

async function startMaking(page: Page, request: string) {
	await page.goto('/make')
	const video = await recordTestVideo(page, TONE)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: video })
	await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
	await page.getByRole('button', { name: 'Make it', exact: true }).click()
}

const plan = (page: Page) => page.getByRole('status', { name: 'The plan' })

test('Home offers Make it', async ({ page }) => {
	await page.goto('/home')
	await page.getByRole('link', { name: 'Make it' }).click()
	// A first visit compiles the page: the same allowance as the other first loads.
	await expect(page.getByRole('heading', { level: 1, name: 'Make it with AI' })).toBeVisible({
		timeout: 30_000
	})
})

test('a reel is planned, shown, applied as one undo step, and exported vertical following the face', async ({
	page
}) => {
	const seen = await mockMakeActions(page, WORDS, [reply()])
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
		'Vertical 9:16, following the face'
	]) {
		await expect(plan(page)).toContainText(line)
	}

	await plan(page).getByRole('button', { name: 'Apply' }).click()
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
			vertical: false,
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
		[reply({ music: 'tone.wav', vertical: false, zoomSentences: [], captions: 'off' })],
		['tone.wav']
	)
	await page.route('**/music/tone.wav', (route) =>
		route.fulfill({ body: toneWav(), contentType: 'audio/wav' })
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText('Music: tone.wav, quieter while someone speaks', {
		timeout: 60_000
	})
	await plan(page).getByRole('button', { name: 'Apply' }).click()
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
	await page.getByRole('button', { name: 'Make it', exact: true }).click()

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
	await plan(page).getByRole('button', { name: 'Apply' }).click()
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
	const seen = await mockMakeActions(page, WORDS, [reply({ subject: 'screen', zoomSentences: [] })])
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText(
		'Vertical 9:16, the whole picture kept, with black bars above and below',
		{ timeout: 60_000 }
	)
	expect(seen.plans).toHaveLength(1)
	await plan(page).getByRole('button', { name: 'Apply' }).click()
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

test('the second check fixes the plan before it shows: its title and key line come in word by word', async ({
	page
}) => {
	const seen = await mockMakeActions(
		page,
		WORDS,
		// The plan names someone never mentioned and has no key line; the check fixes both.
		// A screen recording: the whole picture fitted, 180 × 320, so the
		// captions are large enough to measure in the export, on black.
		[
			reply({
				title: 'Meet Jordan',
				zoomSentences: [],
				captions: 'bold_words',
				subject: 'screen',
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
				dropSentences: []
			}
		]
	)
	await startMaking(page, 'make this an Instagram reel')
	await expect(plan(page)).toContainText('Checked against your request, and fixed:', {
		timeout: 60_000
	})
	await expect(plan(page)).toContainText('The title named someone who is never mentioned.')
	await expect(plan(page)).toContainText('Title at the start: “This is the key point”')
	await expect(plan(page)).toContainText('Captions with the word being said highlighted')
	// The check read the plan as made: its title, what it made, how long.
	expect(seen.checks).toHaveLength(1)
	// It had already lost its title (Jordan was never mentioned): the check put one back.
	expect(seen.checks[0]).toContain('Title: none')
	expect(seen.checks[0]).toContain('Making: instagram_reel')

	await plan(page).getByRole('button', { name: 'Apply' }).click()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	// The key line (after the title: never two at once) is on the Text lane, beside the title.
	await expect(page.getByRole('button', { name: 'Bye', exact: true })).toBeVisible()
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
	// is all there, and a word of "This is the key point." is being said:
	// highlighted yellow at the bottom (yellowish, as the encoder blurs it).
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
				captionYellow: count(
					Math.round(height * 0.6),
					height,
					(r, g, b) => r > 170 && g > 140 && r - b > 90
				)
			}
		}
	)
	const [start, later] = frames
	expect(later?.titleWhite, 'the whole title by 2.5 s').toBeGreaterThan(40)
	expect(start?.titleWhite ?? 0, `the title at ${start?.shown} s`).toBeLessThan(
		(later?.titleWhite ?? 0) / 2
	)
	expect(later?.captionYellow, 'the word being said, highlighted').toBeGreaterThan(5)
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
