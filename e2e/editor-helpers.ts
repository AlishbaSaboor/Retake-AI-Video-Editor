import { expect, type Page } from '@playwright/test'
import type { EditCommand } from '../src/app/[locale]/editor/edit-command'
import { toTranscript } from '../src/app/[locale]/editor/transcript'

// Shared by the editor's e2e specs: a recorded test video, canned AI
// replies, and timeline helpers.

export const RECORDING_SECONDS = 3

// Records a short WebM in the page itself — a moving square on a canvas —
// so the suite needs no binary fixture checked in. MediaRecorder output is
// also exactly the awkward case: no duration header, so the browser reports
// Infinity until the editor forces a scan. Returned as bytes for
// setInputFiles, which drives the real <input type="file">.
//
// With a tone schedule — [seconds, toneOn] pieces laid end to end — the clip
// also gets an audio track: a 440 Hz tone, switched on and off on cue, so
// silences land at known times. Those silences are digital silence unless
// `quietLevel` gives them a faint tone instead, like a real room's.
export async function recordTestVideo(
	page: Page,
	toneSchedule?: Array<[number, boolean]>,
	quietLevel = 0
): Promise<Buffer> {
	const seconds = toneSchedule
		? toneSchedule.reduce((total, [length]) => total + length, 0)
		: RECORDING_SECONDS
	const bytes = await page.evaluate(
		async ({ seconds, toneSchedule, quietLevel }) => {
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d')
			if (!context) throw new Error('no 2d context')
			const stream = canvas.captureStream(30)
			if (toneSchedule) {
				const audio = new AudioContext()
				await audio.resume()
				const destination = audio.createMediaStreamDestination()
				const oscillator = audio.createOscillator()
				const gain = audio.createGain()
				oscillator.connect(gain).connect(destination)
				let at = audio.currentTime
				for (const [length, on] of toneSchedule) {
					gain.gain.setValueAtTime(on ? 0.5 : quietLevel, at)
					at += length
				}
				oscillator.start()
				for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
			}
			const recorder = new MediaRecorder(stream, {
				mimeType: toneSchedule ? 'video/webm;codecs=vp8,opus' : 'video/webm'
			})
			const chunks: Blob[] = []
			recorder.ondataavailable = (event) => chunks.push(event.data)
			const stopped = new Promise((resolve) => (recorder.onstop = resolve))
			const startedAt = performance.now()
			const draw = setInterval(() => {
				const elapsed = (performance.now() - startedAt) / 1000
				context.fillStyle = '#112233'
				context.fillRect(0, 0, 320, 180)
				context.fillStyle = '#ee6633'
				context.fillRect(20 + elapsed * 80, 60, 60, 60)
			}, 1000 / 30)
			recorder.start(100)
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			recorder.stop()
			await stopped
			clearInterval(draw)
			return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
		},
		{ seconds, toneSchedule, quietLevel }
	)
	return Buffer.from(bytes)
}

// A recording counts as intact when it lost no more than this to dropped frames.
const MAX_RECORDING_LOSS_SECONDS = 0.5
const RECORDING_ATTEMPTS = 3

/**
 * Opens the editor with a freshly recorded test video loaded, and returns
 * its duration. A recorder
 * starved of frames — four browsers recording while a cold dev server
 * compiles — writes a file shorter than asked for, so a short one is
 * recorded again rather than handed to a test that relies on its length.
 */
export async function openEditorWithVideo(
	page: Page,
	toneSchedule?: Array<[number, boolean]>,
	quietLevel = 0
): Promise<number> {
	const seconds = toneSchedule
		? toneSchedule.reduce((total, [length]) => total + length, 0)
		: RECORDING_SECONDS
	await page.goto('/editor')
	for (let attempt = 1; attempt <= RECORDING_ATTEMPTS; attempt++) {
		const video = await recordTestVideo(page, toneSchedule, quietLevel)
		await page
			.getByLabel('Choose a video file')
			.setInputFiles({ name: 'test-take.webm', mimeType: 'video/webm', buffer: video })
		// Visible only once a real, finite duration has been resolved. Same 30 s
		// allowance as the other video waits: with the whole suite recording and
		// decoding in parallel, a cold load can pass 5 s.
		await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
			timeout: 30_000
		})
		const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
		if (duration >= seconds - MAX_RECORDING_LOSS_SECONDS) return duration
	}
	throw new Error(`no intact ${seconds}s recording in ${RECORDING_ATTEMPTS} attempts`)
}

/** A parsed command with only the fields that matter given; the rest null, as Gemini sends them. */
export const editCommand = (
	fields: Partial<EditCommand> & Pick<EditCommand, 'action'>
): EditCommand => ({
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null,
	degrees: null,
	axis: null,
	aspect: null,
	percent: null,
	seconds: null,
	property: null,
	target: null,
	color: null,
	background: null,
	font: null,
	effect: null,
	...fields
})

export type TimedWord = { word: string; punctuated_word: string; start: number; end: number }

/** A timed word, as the transcriber returns it. */
export const w = (punctuated_word: string, start: number, end: number): TimedWord => ({
	word: punctuated_word.toLowerCase().replace(/[^a-z'-]/g, ''),
	punctuated_word,
	start,
	end
})

/**
 * Answers the editor's Server Actions with canned results, so AI features
 * can be tested without Deepgram or Gemini. Each request still reaches the
 * real server — with its input emptied, which fails validation before any
 * AI call — so the reply comes back in this build's real Server Action
 * format, and only the result inside it is swapped for the canned one.
 * The transcript is built from a word list by the app's own toTranscript.
 */
export async function mockActions(
	page: Page,
	canned: { words?: TimedWord[]; command?: EditCommand }
): Promise<void> {
	await page.route(
		(url) => url.pathname.endsWith('/editor'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			const body = request.postData() ?? ''
			const isTranscript = body.includes('"audioBase64"')
			const data = isTranscript ? toTranscript(canned.words ?? []) : canned.command
			const response = await route.fetch({
				postData: body.replace(/"(audioBase64|command)":"[^"]*"/, '"$1":""')
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
}

/** Clicks the timeline at a given time, as a user would to seek there. */
export async function seekTo(page: Page, seconds: number): Promise<void> {
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await scrubber.scrollIntoViewIfNeeded()
	const box = await scrubber.boundingBox()
	const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
	if (!box) throw new Error('scrubber has no layout box')
	await page.mouse.click(box.x + (seconds / duration) * box.width, box.y + box.height / 2)
}

export async function playheadSeconds(page: Page): Promise<number> {
	return page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)
}

// The pauses between the video's "sentences" hold a faint tone (~-57 dBFS)
// rather than digital silence, as a real room does: against digital
// silence, the encoder's fade-out after each tone reads as sound for ~0.3 s
// and pushes every pause's start back.
export const ROOM_TONE = 0.002

export const reRecordButton = (page: Page, at: string) =>
	page.getByRole('button', { name: `Re-record the sentence at ${at}` })

/**
 * Opens a take of three "sentences" — A, B (2 s, which a re-record replaces
 * with the fake mic's 0.8 s) and D, with pauses between — and returns its
 * duration once B can be re-recorded.
 */
export async function openThreeSentences(page: Page): Promise<number> {
	await mockActions(page, {
		words: [w('Alpha.', 0, 1), w('Bravo', 1.6, 2.6), w('words.', 2.6, 3.6), w('Delta.', 4.2, 5.2)]
	})
	const duration = await openEditorWithVideo(
		page,
		[
			[1, true],
			[0.6, false],
			[2, true],
			[0.6, false],
			[1, true]
		],
		ROOM_TONE
	)
	await openTool(page, 'Transcript')
	await expect(reRecordButton(page, '0:01')).toBeVisible({ timeout: 30_000 })
	return duration
}

// Which tab of the tools column holds each panel (by the panel's name).
const TOOL_TABS: Record<string, string> = {
	'Clean up': 'AI & Clean up',
	Picture: 'Picture',
	Zoom: 'Picture',
	Color: 'Picture',
	'Clip sound and speed': 'Sound',
	Audio: 'Sound',
	Graphics: 'Graphics',
	Annotations: 'Graphics',
	Transitions: 'Transitions',
	Transcript: 'Transcript',
	Project: 'Project'
}

/** Opens the tools tab holding a panel, as a user would before using it. */
export async function openTool(page: Page, panel: keyof typeof TOOL_TABS): Promise<void> {
	const tab = page.getByRole('tab', { name: TOOL_TABS[panel], exact: true })
	// No tabs while no video is in (an empty editor shows My projects itself).
	if ((await tab.count()) === 0) return
	if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
}
