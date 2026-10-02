import { test, expect, type Page } from '@playwright/test'
import type { EditCommand } from '../src/app/[locale]/editor/edit-command'
import { toTranscript } from '../src/app/[locale]/editor/transcript'

const RECORDING_SECONDS = 3

// Records a short WebM in the page itself — a moving square on a canvas —
// so the suite needs no binary fixture checked in. MediaRecorder output is
// also exactly the awkward case: no duration header, so the browser reports
// Infinity until the editor forces a scan. Returned as bytes for
// setInputFiles, which drives the real <input type="file">.
//
// With a tone schedule — [seconds, toneOn] pieces laid end to end — the clip
// also gets an audio track: a 440 Hz tone, switched on and off on cue, so
// silences land at known times.
async function recordTestVideo(
	page: Page,
	toneSchedule?: Array<[number, boolean]>
): Promise<Buffer> {
	const seconds = toneSchedule
		? toneSchedule.reduce((total, [length]) => total + length, 0)
		: RECORDING_SECONDS
	const bytes = await page.evaluate(
		async ({ seconds, toneSchedule }) => {
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
					gain.gain.setValueAtTime(on ? 0.5 : 0, at)
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
		{ seconds, toneSchedule }
	)
	return Buffer.from(bytes)
}

// A recording counts as intact when it lost no more than this to dropped frames.
const MIN_RECORDED_SECONDS = RECORDING_SECONDS - 0.5
const RECORDING_ATTEMPTS = 3

/**
 * Opens the editor with a freshly recorded test video loaded. A recorder
 * starved of frames — four browsers recording while a cold dev server
 * compiles — writes a file shorter than asked for, so a short one is
 * recorded again rather than handed to a test that relies on its length.
 */
async function openEditorWithVideo(page: Page): Promise<void> {
	await page.goto('/editor')
	for (let attempt = 1; attempt <= RECORDING_ATTEMPTS; attempt++) {
		const video = await recordTestVideo(page)
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
		if (duration >= MIN_RECORDED_SECONDS) return
	}
	throw new Error(`no intact ${RECORDING_SECONDS}s recording in ${RECORDING_ATTEMPTS} attempts`)
}

type TimedWord = { word: string; punctuated_word: string; start: number; end: number }

/** A timed word, as the transcriber returns it. */
const w = (punctuated_word: string, start: number, end: number): TimedWord => ({
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
async function mockActions(
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
async function seekTo(page: Page, seconds: number): Promise<void> {
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await scrubber.scrollIntoViewIfNeeded()
	const box = await scrubber.boundingBox()
	const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
	if (!box) throw new Error('scrubber has no layout box')
	await page.mouse.click(box.x + (seconds / duration) * box.width, box.y + box.height / 2)
}

async function playheadSeconds(page: Page): Promise<number> {
	return page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)
}

test('home links to the editor, which starts empty', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('link', { name: 'Open the editor' }).click()
	await expect(page).toHaveURL(/\/editor$/)
	await expect(page.getByText('Drop a video here, or click to choose one')).toBeVisible()
	await expect(page.getByText('Your timeline appears here once a video loads.')).toBeVisible()
})

test('a picked video plays in the editor and can be scrubbed on the timeline', async ({ page }) => {
	await openEditorWithVideo(page)
	await expect(page.locator('video')).toBeVisible()
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	// The real, resolved duration — recorded in real time, so it can land a
	// little either side of RECORDING_SECONDS under load.
	const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
	expect(duration).toBeGreaterThan(RECORDING_SECONDS - 1)
	await expect(scrubber).toHaveAttribute('aria-valuemax', String(Math.round(duration)))
	await expect(page.getByText('test-take.webm').first()).toBeVisible()
	// The duration probe must hand the playhead back at the start.
	await expect(scrubber).toHaveAttribute('aria-valuenow', '0')

	// Clicking the middle of the track seeks the video to the middle. The
	// timeline sits below the fold, and mouse.click takes raw viewport
	// coordinates without scrolling, so bring it into view first.
	await scrubber.scrollIntoViewIfNeeded()
	const box = await scrubber.boundingBox()
	if (!box) throw new Error('scrubber has no layout box')
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(RECORDING_SECONDS / 2, 0)

	// Keyboard: End jumps to the end, Home back to the start, arrows nudge.
	await scrubber.focus()
	await page.keyboard.press('End')
	await expect(scrubber).toHaveAttribute('aria-valuenow', String(Math.round(duration)))
	await page.keyboard.press('Home')
	await expect(scrubber).toHaveAttribute('aria-valuenow', '0')
	await page.keyboard.press('ArrowRight')
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(1, 1)
})

test('dragging a trim handle trims the clip, previews the cut, and can be undone', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const startHandle = page.getByRole('slider', { name: 'Trim start' })
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	await startHandle.scrollIntoViewIfNeeded()
	const track = await scrubber.boundingBox()
	const handle = await startHandle.boundingBox()
	if (!track || !handle) throw new Error('timeline has no layout box')
	const handleY = handle.y + handle.height / 2

	// Drag the start handle a third of the way in: about 1s of a 3s clip.
	await page.mouse.move(handle.x + handle.width / 2, handleY)
	await page.mouse.down()
	await page.mouse.move(track.x + track.width / 3, handleY, { steps: 5 })
	await page.mouse.up()
	const trimStart = Number(await startHandle.getAttribute('aria-valuenow'))
	expect(trimStart).toBeCloseTo(RECORDING_SECONDS / 3, 0)
	// The preview jumped to the new cut frame with no separate apply step.
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(trimStart, 1)

	// Seeking into the trimmed-away footage snaps to the in-point.
	await page.mouse.click(track.x + 5, track.y + 10)
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(trimStart, 1)

	// Non-destructive: dragging the handle back restores the whole clip.
	await page.mouse.move(track.x + track.width / 3, handleY)
	await page.mouse.down()
	await page.mouse.move(track.x - 20, handleY, { steps: 5 })
	await page.mouse.up()
	await expect(startHandle).toHaveAttribute('aria-valuenow', '0')
})

test('long silences are flagged on the timeline and jump there when clicked', async ({ page }) => {
	// The transcript is a real Gemini call; block Server Action requests so
	// the suite never spends quota. Silences are measured in the browser and
	// don't need it.
	await page.route('**/editor', (route) =>
		route.request().headers()['next-action'] ? route.abort() : route.continue()
	)
	await page.goto('/editor')
	const video = await recordTestVideo(page, [
		[1, true],
		[7.5, false],
		[1.5, true]
	])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take-with-pause.webm', mimeType: 'video/webm', buffer: video })

	await expect(page.getByText('1 silence', { exact: true })).toBeVisible({ timeout: 30_000 })
	// ~1s to ~8.5s; recorder start-up can shift both edges by a fraction.
	const pin = page.getByRole('button', { name: /^Silence from 0:0[01] to 0:0[89]/ })
	await expect(pin).toBeVisible()
	await pin.click()
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(1, 0)
})

test('filler words in the transcript are flagged apart from silences and open their cut editor', async ({
	page
}) => {
	// "I like it" is a verb and must not be flagged. The audio is one
	// unbroken tone — no gaps anywhere — so neither filler can be cut safely:
	// both must be flagged for a manual cut, never auto-removed.
	await mockActions(page, {
		words: [
			w('So,', 0, 0.3),
			w('um,', 0.4, 0.6),
			w('this', 0.7, 0.9),
			w('is,', 1.0, 1.2),
			w('like,', 1.5, 1.7),
			w('the', 1.8, 2.0),
			w('take.', 2.1, 2.6),
			w('I', 3.0, 3.1),
			w('like', 3.2, 3.4),
			w('it.', 3.5, 3.8)
		]
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[4, true]])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take-with-fillers.webm', mimeType: 'video/webm', buffer: video })

	await expect(page.getByText('So, um, this is, like, the take.')).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('2 filler words', { exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: /^Filler word/ })).toHaveCount(2)
	await expect(page.getByRole('button', { name: /^Silence from/ })).toHaveCount(0)
	const review = page.getByRole('button', { name: /needs a manual cut/ })
	await expect(review).toHaveCount(2)
	await expect(
		page.getByRole('button', { name: /^Filler word "um" at 0:00, needs a manual cut/ })
	).toBeVisible()

	await page
		.getByRole('button', { name: /^Filler word "like" at 0:01, needs a manual cut/ })
		.click()
	// A filler flag opens its cut editor, with the playhead a second ahead of
	// the filler (the editor window's start) so playback leads into it.
	await expect(page.getByRole('region', { name: 'Cut editor for "like"' })).toBeVisible()
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(0.5, 1)

	// Nothing here is safe to remove automatically.
	await expect(page.getByRole('button', { name: 'Clean up recording' })).toBeDisabled()
})

test('clean-up cuts a filler with clear gaps around it, keeps one without, and undo restores', async ({
	page
}) => {
	// Tone with two 150 ms gaps around "um" (1.15-1.45 s), then unbroken tone
	// through "so uh done": that "uh" runs straight into its neighbours.
	await mockActions(page, {
		words: [
			w('Hello,', 0, 1.0),
			w('um,', 1.15, 1.45),
			w('world.', 1.6, 3.0),
			w('So', 3.0, 3.4),
			w('uh', 3.4, 3.7),
			w('done.', 3.7, 4.5)
		]
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [
		[1, true],
		[0.15, false],
		[0.3, true],
		[0.15, false],
		[2.9, true]
	])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take-with-filler-gaps.webm', mimeType: 'video/webm', buffer: video })
	await expect(page.getByText('2 filler words', { exact: true })).toBeVisible({ timeout: 30_000 })
	await expect(
		page.getByRole('button', { name: /^Filler word "um" at 0:01. Open the cut editor/ })
	).toBeVisible()
	await expect(
		page.getByRole('button', { name: /^Filler word "uh" at 0:03, needs a manual cut/ })
	).toBeVisible()

	await page.getByRole('button', { name: 'Clean up recording' }).click()
	await expect(page.getByText('(0 silences, 1 filler word)')).toBeVisible()
	await expect(page.getByText(/^1 filler word runs straight into the next word/)).toBeVisible()
	await page.getByRole('button', { name: 'Apply clean-up' }).click()

	// Inside the cut "um": playback can't land there, it continues past it...
	await seekTo(page, 1.3)
	await expect.poll(() => playheadSeconds(page)).toBeGreaterThan(1.4)
	// ...while the "uh" with no gap was left alone, as were its neighbours.
	await seekTo(page, 3.55)
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(3.55, 0)

	await page.getByRole('button', { name: 'Undo last cut' }).click()
	await seekTo(page, 1.3)
	await expect.poll(() => playheadSeconds(page)).toBeLessThan(1.4)
})

test('clean-up removes flagged silences after an estimate, and undo restores them', async ({
	page
}) => {
	await page.route('**/editor', (route) =>
		route.request().headers()['next-action'] ? route.abort() : route.continue()
	)
	await page.goto('/editor')
	// Tone, an 8 s silence, tone: the silence (~1-9 s) is interior, so it
	// becomes a cut of ~1.3-8.7 s — 0.3 s of padding kept at each edge.
	const video = await recordTestVideo(page, [
		[1, true],
		[8, false],
		[1.5, true]
	])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take-to-clean.webm', mimeType: 'video/webm', buffer: video })
	await expect(page.getByText('1 silence', { exact: true })).toBeVisible({ timeout: 30_000 })

	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	const seekToMiddle = async () => {
		await scrubber.scrollIntoViewIfNeeded()
		const box = await scrubber.boundingBox()
		if (!box) throw new Error('scrubber has no layout box')
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	}

	await page.getByRole('button', { name: 'Clean up recording' }).click()
	await expect(page.getByText(/This will remove approximately [78] seconds\./)).toBeVisible()
	await page.getByRole('button', { name: 'Apply clean-up' }).click()

	// The middle of the clip (~5 s) is inside the cut: seeking there lands
	// just after it, at ~8.7 s.
	await seekToMiddle()
	await expect.poll(() => playheadSeconds(page)).toBeGreaterThan(8)

	// Playback jumps the cut too: played from 0.5 s, it is past ~8.7 s
	// within about a second of real time, not 8 seconds later.
	await page.locator('video').evaluate(async (element: HTMLVideoElement) => {
		element.muted = true
		element.currentTime = 0.5
		await element.play()
	})
	await expect.poll(() => playheadSeconds(page), { timeout: 4000 }).toBeGreaterThan(8.6)
	await page.locator('video').evaluate((element: HTMLVideoElement) => element.pause())

	// One-step undo brings the silence back: the middle is reachable again.
	await page.getByRole('button', { name: 'Undo last cut' }).click()
	await expect(page.getByRole('button', { name: 'Undo last cut' })).toHaveCount(0)
	await seekToMiddle()
	await expect.poll(() => playheadSeconds(page)).toBeLessThan(6.5)
	await expect(page.getByRole('button', { name: 'Clean up recording' })).toBeEnabled()
})

test('the cut editor cuts a filler set by hand, previews it, and undo or cancel leave it intact', async ({
	page
}) => {
	// One unbroken tone: the "uh" has no gap around it, so only a manual cut
	// can remove it. Its transcriber span (0.5-0.8 s) seeds the handles.
	await mockActions(page, { words: [w('So', 0, 0.4), w('uh', 0.5, 0.8), w('done.', 0.9, 2.5)] })
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[3, true]])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take-with-uh.webm', mimeType: 'video/webm', buffer: video })
	const flag = page.getByRole('button', { name: /^Filler word "uh" at 0:00, needs a manual cut/ })
	await expect(flag).toBeVisible({ timeout: 30_000 })

	await flag.click()
	const editor = page.getByRole('region', { name: 'Cut editor for "uh"' })
	await expect(editor).toBeVisible()
	const start = editor.getByRole('slider', { name: 'Cut start' })
	await expect(start).toHaveAttribute('aria-valuenow', '0.5')
	// Widen the cut 50 ms earlier, in 10 ms key steps.
	await start.focus()
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
	await expect
		.poll(async () => Number(await start.getAttribute('aria-valuenow')))
		.toBeCloseTo(0.45, 3)

	// "Play with cut" plays the window (0-1.8 s), jumping the pending cut,
	// and stops at the window's end.
	await editor.getByRole('button', { name: 'Play with cut' }).click()
	await expect
		.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused), {
			timeout: 5000
		})
		.toBe(true)
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(1.8, 1)

	await editor.getByRole('button', { name: 'Cut', exact: true }).click()
	await expect(editor).toHaveCount(0)
	await seekTo(page, 0.6)
	await expect.poll(() => playheadSeconds(page)).toBeGreaterThan(0.79)

	// One-step undo restores it...
	await page.getByRole('button', { name: 'Undo last cut' }).click()
	await seekTo(page, 0.6)
	await expect.poll(() => playheadSeconds(page)).toBeLessThan(0.75)

	// ...and Cancel never cuts at all.
	await flag.click()
	await page
		.getByRole('region', { name: 'Cut editor for "uh"' })
		.getByRole('button', { name: 'Cancel' })
		.click()
	await expect(page.getByRole('region', { name: 'Cut editor for "uh"' })).toHaveCount(0)
	await seekTo(page, 0.6)
	await expect.poll(() => playheadSeconds(page)).toBeLessThan(0.75)
	await expect(page.getByRole('button', { name: 'Undo last cut' })).toHaveCount(0)
})

test('an AI command shows what it understood and changes nothing until confirmed', async ({
	page
}) => {
	await mockActions(page, {
		words: [],
		command: { action: 'trim', startSeconds: 1, endSeconds: 2 }
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[3, true]])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take.webm', mimeType: 'video/webm', buffer: video })
	const input = page.getByLabel('Edit command')
	await expect(input).toBeVisible({ timeout: 30_000 })
	const trimStart = page.getByRole('slider', { name: 'Trim start' })
	const trimEnd = page.getByRole('slider', { name: 'Trim end' })
	const untrimmedEnd = await trimEnd.getAttribute('aria-valuenow')

	const run = async () => {
		await input.fill('cut from 1 to 2 seconds')
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(page.getByText('You asked: “cut from 1 to 2 seconds”')).toBeVisible()
	}

	// The plan is shown, and nothing has changed yet.
	await run()
	await expect(page.getByText("I'll keep 0:01–0:02 (1.0 s)", { exact: false })).toBeVisible()
	await expect(trimStart).toHaveAttribute('aria-valuenow', '0')
	await expect(trimEnd).toHaveAttribute('aria-valuenow', untrimmedEnd ?? '')

	// Cancel drops it without touching the clip.
	await page.getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByText('You asked:', { exact: false })).toHaveCount(0)
	await expect(trimStart).toHaveAttribute('aria-valuenow', '0')

	// Confirming applies exactly what was shown.
	await run()
	await page.getByRole('button', { name: 'Apply', exact: true }).click()
	await expect(trimStart).toHaveAttribute('aria-valuenow', '1')
	await expect(trimEnd).toHaveAttribute('aria-valuenow', '2')
	await expect(input).toHaveValue('')
})

test('a command it cannot do gets a plain answer listing what it can, and changes nothing', async ({
	page
}) => {
	await mockActions(page, {
		words: [],
		command: { action: 'unsupported', startSeconds: null, endSeconds: null }
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[3, true]])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take.webm', mimeType: 'video/webm', buffer: video })
	const input = page.getByLabel('Edit command')
	await expect(input).toBeVisible({ timeout: 30_000 })
	const trimStart = page.getByRole('slider', { name: 'Trim start' })

	await input.fill('add a title card that says hello')
	await page.getByRole('button', { name: 'Run' }).click()
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await expect(reply).toContainText("I can't do that yet.")
	await expect(reply).toContainText('Keep a time range')
	await expect(reply).toContainText('Clean up recording')
	await expect(reply).toContainText('Reorder clips by dragging')
	await expect(reply.getByRole('button', { name: 'Apply' })).toHaveCount(0)
	await expect(trimStart).toHaveAttribute('aria-valuenow', '0')
	await reply.getByRole('button', { name: 'OK' }).click()
	await expect(reply).toHaveCount(0)

	// A trim it understood but that falls outside the clip is explained too.
	await page.unrouteAll({ behavior: 'wait' })
	await mockActions(page, { command: { action: 'trim', startSeconds: 8, endSeconds: 9 } })
	await input.fill('cut from 8 to 9 seconds')
	await page.getByRole('button', { name: 'Run' }).click()
	await expect(page.getByText("That range isn't in this clip.")).toBeVisible()
	await expect(trimStart).toHaveAttribute('aria-valuenow', '0')
})

test('splitting at the playhead makes two independent clips without changing what plays', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const clips = page.getByRole('region', { name: 'Clips' })
	const split = clips.getByRole('button', { name: 'Split at playhead' })
	await expect(clips.getByText('1 clip', { exact: true })).toBeVisible()
	// At 0:00 there's nothing before the playhead to split off.
	await expect(split).toBeDisabled()

	await seekTo(page, 1.5)
	const at = await playheadSeconds(page)
	await split.click()
	await expect(clips.getByText('2 clips', { exact: true })).toBeVisible()
	const items = clips.getByRole('option')
	await expect(items).toHaveCount(2)
	await expect(items.nth(0)).toHaveAttribute('aria-label', /^Clip 1: plays 0:01, from 0:00–0:01 /)
	await expect(items.nth(1)).toHaveAttribute('aria-label', /^Clip 2: plays 0:0\d, from 0:01–0:0\d /)
	// The split didn't move the playhead, which now sits at the start of Clip 2.
	expect(await playheadSeconds(page)).toBeCloseTo(at, 2)
	await expect(items.nth(1)).toHaveAttribute('aria-current', 'true')

	// Played straight through from inside Clip 1, nothing is skipped or
	// repeated: the playhead crosses the split and the highlight follows it.
	await seekTo(page, 1)
	await expect(items.nth(0)).toHaveAttribute('aria-current', 'true')
	await page.locator('video').evaluate(async (element: HTMLVideoElement) => {
		element.muted = true
		await element.play()
	})
	await expect.poll(() => playheadSeconds(page), { timeout: 5000 }).toBeGreaterThan(2)
	await expect(items.nth(1)).toHaveAttribute('aria-current', 'true')
	await expect(items.nth(0)).not.toHaveAttribute('aria-current', 'true')
})

test('clips reorder by dragging or by keyboard, and play back in their new order', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const clips = page.getByRole('region', { name: 'Clips' })
	await seekTo(page, 1.5)
	await clips.getByRole('button', { name: 'Split at playhead' }).click()
	const items = clips.getByRole('option')
	await expect(items).toHaveCount(2)
	const startsAt = (seconds: string) => new RegExp(`from ${seconds}–`)

	await items.nth(1).dragTo(items.nth(0))
	await expect(items.nth(0)).toHaveAttribute('aria-label', startsAt('0:01'))
	await expect(items.nth(1)).toHaveAttribute('aria-label', startsAt('0:00'))

	// The keyboard does the same: Alt+→ moves the first clip back after the second…
	await items.nth(0).press('Alt+ArrowRight')
	await expect(items.nth(0)).toHaveAttribute('aria-label', startsAt('0:00'))
	// …and Alt+← moves it forward again; moving off either end does nothing.
	await items.nth(1).press('Alt+ArrowLeft')
	await items.nth(0).press('Alt+ArrowLeft')
	await expect(items.nth(0)).toHaveAttribute('aria-label', startsAt('0:01'))
	await expect(items.nth(1)).toHaveAttribute('aria-label', startsAt('0:00'))

	// Played from the start of the sequence, the later part of the take comes
	// first, then playback jumps back to the beginning of the source and stops
	// where the moved clip ends.
	await seekTo(page, 1.5)
	await page.locator('video').evaluate(async (element: HTMLVideoElement) => {
		element.muted = true
		await element.play()
	})
	await expect.poll(() => playheadSeconds(page), { timeout: 5000 }).toBeLessThan(1)
	await expect(items.nth(1)).toHaveAttribute('aria-current', 'true')
	await expect
		.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused), {
			timeout: 5000
		})
		.toBe(true)
	expect(await playheadSeconds(page)).toBeCloseTo(1.5, 0)
})

test('a selected run of adjacent clips merges into one, and merging a split undoes it', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const clips = page.getByRole('region', { name: 'Clips' })
	const split = clips.getByRole('button', { name: 'Split at playhead' })
	const merge = clips.getByRole('button', { name: 'Merge clips' })
	// Clicked seeks can land a pixel short (2 → 1.999999), so split well inside
	// a second: the labels below show whole seconds, rounded down.
	for (const seconds of [1.5, 2.2]) {
		await seekTo(page, seconds)
		await split.click()
	}
	const items = clips.getByRole('option')
	await expect(items).toHaveCount(3)
	await expect(merge).toBeDisabled()

	// One clip selected isn't enough to merge; Shift+click extends the run.
	await items.nth(0).click()
	await expect(items.nth(0)).toHaveAttribute('aria-selected', 'true')
	await expect(merge).toBeDisabled()
	await items.nth(1).click({ modifiers: ['Shift'] })
	await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true')
	await expect(items.nth(2)).toHaveAttribute('aria-selected', 'false')
	await merge.click()
	await expect(items).toHaveCount(2)
	await expect(items.nth(0)).toHaveAttribute('aria-label', /^Clip 1: plays 0:02, from 0:00–0:02 /)

	// Merging out of source order keeps the playback order inside the clip.
	await items.nth(1).dragTo(items.nth(0))
	await expect(items.nth(0)).toHaveAttribute('aria-label', /from 0:02–0:0\d of/)
	// From the keyboard: Space selects, Shift+Space extends.
	await items.nth(0).press('Space')
	await items.nth(1).press('Shift+Space')
	await merge.click()
	await expect(items).toHaveCount(1)
	await expect(items.nth(0)).toHaveAttribute(
		'aria-label',
		/^Clip 1: plays 0:0\d, from 0:02–0:0\d, 0:00–0:02 /
	)
	await expect(merge).toBeDisabled()
})

test('the original and edited takes can be compared without moving the playhead', async ({
	page
}) => {
	await mockActions(page, {
		words: [],
		command: { action: 'trim', startSeconds: 1, endSeconds: 2 }
	})
	await openEditorWithVideo(page)
	await page.getByLabel('Edit command').fill('keep 1 to 2 seconds')
	await page.getByRole('button', { name: 'Run' }).click()
	await page.getByRole('button', { name: 'Apply', exact: true }).click()
	await expect(page.getByRole('slider', { name: 'Trim start' })).toHaveAttribute(
		'aria-valuenow',
		'1'
	)
	const compare = page.getByRole('group', { name: 'Compare with the original' })
	const original = compare.getByRole('button', { name: 'Original' })
	const edited = compare.getByRole('button', { name: 'Edited' })
	await expect(edited).toHaveAttribute('aria-pressed', 'true')
	const video = page.locator('video')
	const play = () =>
		video.evaluate(async (element: HTMLVideoElement) => {
			element.muted = true
			await element.play()
		})
	const paused = () => video.evaluate((element: HTMLVideoElement) => element.paused)

	// The edit plays 1–2 s and stops at the trim's end.
	await seekTo(page, 1.2)
	await play()
	await expect.poll(paused, { timeout: 5000 }).toBe(true)
	const stoppedAt = await playheadSeconds(page)
	expect(stoppedAt).toBeCloseTo(2, 0)
	expect(stoppedAt).toBeLessThan(2.3)

	// Switching to the original keeps the playhead exactly where it was, and
	// from there the untouched take plays on past where the edit stopped.
	await original.click()
	await expect(original).toHaveAttribute('aria-pressed', 'true')
	expect(await playheadSeconds(page)).toBe(stoppedAt)
	await play()
	await expect.poll(() => playheadSeconds(page), { timeout: 5000 }).toBeGreaterThan(2.4)
	await video.evaluate((element: HTMLVideoElement) => element.pause())

	// Before the trim's start, too: the original plays what the edit removed,
	// and switching back to the edit doesn't move the playhead either.
	await seekTo(page, 0.5)
	const before = await playheadSeconds(page)
	expect(before).toBeLessThan(1)
	await edited.click()
	await expect(edited).toHaveAttribute('aria-pressed', 'true')
	expect(await playheadSeconds(page)).toBe(before)
})

test('a file that is not a video is rejected with a message', async ({ page }) => {
	await page.goto('/editor')
	await page.getByLabel('Choose a video file').setInputFiles({
		name: 'notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not a video')
	})
	// exact: the toaster also mirrors its text into a screen-reader live
	// region, which a substring match would find as a second element.
	await expect(page.getByText("That file isn't a video", { exact: true })).toBeVisible()
	await expect(page.locator('video')).toHaveCount(0)
})
