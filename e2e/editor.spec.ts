import { test, expect, type Page } from '@playwright/test'

const RECORDING_SECONDS = 3

// Records a short WebM in the page itself — a moving square on a canvas —
// so the suite needs no binary fixture checked in. MediaRecorder output is
// also exactly the awkward case: no duration header, so the browser reports
// Infinity until the editor forces a scan. Returned as bytes for
// setInputFiles, which drives the real <input type="file">.
async function recordTestVideo(page: Page): Promise<Buffer> {
	const bytes = await page.evaluate(async (seconds) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' })
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
	}, RECORDING_SECONDS)
	return Buffer.from(bytes)
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
	await page.goto('/editor')
	const video = await recordTestVideo(page)

	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'test-take.webm', mimeType: 'video/webm', buffer: video })

	await expect(page.locator('video')).toBeVisible()
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	// Visible only once a real, finite duration has been resolved.
	await expect(scrubber).toBeVisible()
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
