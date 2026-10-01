import { test, expect, type Page } from '@playwright/test'

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

/** Opens the editor with a freshly recorded test video loaded. */
async function openEditorWithVideo(page: Page): Promise<void> {
	await page.goto('/editor')
	const video = await recordTestVideo(page)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'test-take.webm', mimeType: 'video/webm', buffer: video })
	// Visible only once a real, finite duration has been resolved.
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible()
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
	await expect(scrubber).toHaveAttribute('aria-valuemax', String(RECORDING_SECONDS))
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
	await expect(scrubber).toHaveAttribute('aria-valuenow', String(RECORDING_SECONDS))
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
