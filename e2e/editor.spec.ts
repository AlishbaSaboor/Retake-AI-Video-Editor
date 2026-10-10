import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import {
	editCommand,
	mockActions,
	openEditorWithVideo,
	playheadSeconds,
	recordTestVideo,
	RECORDING_SECONDS,
	seekTo,
	w,
	openTool
} from './editor-helpers'
import { readExportFrames } from './export-frames'

test('a picked video plays in the editor and can be scrubbed on the timeline', async ({ page }) => {
	await openEditorWithVideo(page)
	await expect(page.locator('video')).toBeVisible()
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	// The real, resolved duration — recorded in real time, so it can land a
	// little either side of RECORDING_SECONDS under load.
	const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
	expect(duration).toBeGreaterThan(RECORDING_SECONDS - 1)
	// The timeline is as long as the edit: the whole take, to start with.
	expect(Number(await scrubber.getAttribute('aria-valuemax'))).toBeCloseTo(duration, 1)
	await expect(
		page.getByRole('region', { name: 'Clips' }).getByText('test-take.webm').first()
	).toBeVisible()
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
	await expect(scrubber).toHaveAttribute('aria-valuenow', String(Number(duration.toFixed(2))))
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

	// Non-destructive: the trimmed part leaves the timeline, and the handle,
	// now at its start, dragged back out past it restores the whole clip.
	const trimmed = await startHandle.boundingBox()
	if (!trimmed) throw new Error('trim handle has no layout box')
	await page.mouse.move(trimmed.x + trimmed.width / 2, handleY)
	await page.mouse.down()
	await page.mouse.move(trimmed.x - track.width / 2, handleY, { steps: 5 })
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

	await openTool(page, 'Transcript')
	await expect(page.getByText('So, um, this is, like, the take.')).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText('2 filler words', { exact: true })).toBeVisible()
	await expect(page.getByRole('button', { name: /^Filler word "/ })).toHaveCount(2)
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
	await openTool(page, 'Clean up')
	await expect(
		page.getByRole('button', { name: 'Remove silences and filler words' })
	).toBeDisabled()
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

	await openTool(page, 'Clean up')
	// What it takes out is shown before the one click.
	await expect(page.getByText('No long silences', { exact: true })).toBeVisible()
	await expect(page.getByText('1 filler word', { exact: true })).toBeVisible()
	await expect(page.getByText(/^1 filler word runs straight into the next word/)).toBeVisible()
	await page.getByRole('button', { name: 'Remove silences and filler words' }).click()

	// Inside the cut "um": playback can't land there, it continues past it...
	await seekTo(page, 1.3)
	await expect.poll(() => playheadSeconds(page)).toBeGreaterThan(1.4)
	// ...while the "uh" with no gap was left alone, as were its neighbours.
	await seekTo(page, 3.55)
	await expect.poll(() => playheadSeconds(page)).toBeCloseTo(3.55, 0)

	await page.getByRole('button', { name: 'Undo last change' }).click()
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

	await openTool(page, 'Clean up')
	await expect(page.getByText(/^Saves about [78] seconds\./)).toBeVisible()
	await page.getByRole('button', { name: 'Remove silences and filler words' }).click()

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
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()
	await seekToMiddle()
	await expect.poll(() => playheadSeconds(page)).toBeLessThan(6.5)
	await openTool(page, 'Clean up')
	await expect(page.getByRole('button', { name: 'Remove silences and filler words' })).toBeEnabled()
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
	await page.getByRole('button', { name: 'Undo last change' }).click()
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
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()
})

test('an AI command shows what it understood and changes nothing until confirmed', async ({
	page
}) => {
	await mockActions(page, {
		words: [],
		command: editCommand({ action: 'trim', startSeconds: 1, endSeconds: 2 })
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
		await openTool(page, 'Assistant')
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
	await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
	await expect(trimStart).toHaveAttribute('aria-valuenow', '1')
	await expect(trimEnd).toHaveAttribute('aria-valuenow', '2')
	await expect(input).toHaveValue('')
})

test('a command it cannot do gets a plain answer listing what it can, and changes nothing', async ({
	page
}) => {
	await mockActions(page, {
		words: [],
		command: editCommand({ action: 'unsupported' })
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[3, true]])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take.webm', mimeType: 'video/webm', buffer: video })
	const input = page.getByLabel('Edit command')
	await expect(input).toBeVisible({ timeout: 30_000 })
	const trimStart = page.getByRole('slider', { name: 'Trim start' })

	await openTool(page, 'Assistant')
	await input.fill('make the colours warmer')
	await page.getByRole('button', { name: 'Run' }).click()
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await expect(reply).toContainText("I can't do that yet.")
	await expect(reply).toContainText('Keep a time range')
	await expect(reply).toContainText('Add a title card')
	await expect(reply).toContainText('Add a logo watermark')
	await expect(reply).toContainText('Remove long silences and filler words')
	await expect(reply).toContainText('Reorder clips: “move clip 2 to the start”')
	await expect(reply).toContainText('Compare the edit with the original')
	await expect(reply.getByRole('button', { name: 'Apply' })).toHaveCount(0)
	await expect(trimStart).toHaveAttribute('aria-valuenow', '0')
	await reply.getByRole('button', { name: 'OK' }).click()
	await expect(reply).toHaveCount(0)

	// A trim it understood but that falls outside the clip is explained too.
	await page.unrouteAll({ behavior: 'wait' })
	await mockActions(page, {
		command: editCommand({ action: 'trim', startSeconds: 8, endSeconds: 9 })
	})
	await openTool(page, 'Assistant')
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
		command: editCommand({ action: 'trim', startSeconds: 1, endSeconds: 2 })
	})
	await openEditorWithVideo(page)
	await openTool(page, 'Assistant')
	await page.getByLabel('Edit command').fill('keep 1 to 2 seconds')
	await page.getByRole('button', { name: 'Run' }).click()
	await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
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

test('export records a real video of the edit: its length, sound and pictures follow the edit', async ({
	page
}) => {
	await mockActions(page, { words: [] })
	// A tone for the first and last second, silence in between; the square
	// on screen moves 80 px a second, so each frame shows its source time.
	const duration = await openEditorWithVideo(page, [
		[1, true],
		[1, false],
		[1, true]
	])
	const clips = page.getByRole('region', { name: 'Clips' })
	await seekTo(page, 1.5)
	const splitAt = await playheadSeconds(page)
	await clips.getByRole('button', { name: 'Split at playhead' }).click()
	const items = clips.getByRole('option')
	await items.nth(1).dragTo(items.nth(0))
	await expect(items.nth(0)).toHaveAttribute('aria-label', /from 0:01–/)

	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	await expect(page.getByText(/^Exporting… \d+%$/)).toBeVisible()
	const download = await downloading
	expect(download.suggestedFilename()).toBe('test-take-edited.webm')
	await expect(page.getByText('Export finished', { exact: true })).toBeVisible()
	// Just that: no second "… is downloading." line under it.
	await expect(page.getByText(/is downloading/)).toHaveCount(0)
	const bytes = await readFile(await download.path())

	// The edit plays the take from the split to the end, then its start.
	// Probes sit mid-way through each stretch of tone or silence, clear of
	// the edges, and are mapped from source time to time in the export.
	const firstPart = duration - splitAt
	const toExport = (source: number) => (source >= splitAt ? source - splitAt : firstPart + source)
	const probes = [
		{ source: 1.75, tone: false },
		{ source: (2 + duration) / 2, tone: true },
		{ source: 0.5, tone: true },
		{ source: 1.25, tone: false }
	].map((probe) => ({ ...probe, at: toExport(probe.source) }))
	const frames = [1.75, 0.5].map((source) => ({ source, at: toExport(source) }))

	const measured = await page.evaluate(
		async ({ bytes, probeTimes }) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			const rms = (at: number) => {
				const from = Math.floor((at - 0.05) * audio.sampleRate)
				const to = Math.floor((at + 0.05) * audio.sampleRate)
				let sum = 0
				for (let i = from; i < to; i++) sum += (samples[i] ?? 0) ** 2
				return Math.sqrt(sum / (to - from))
			}

			return { audioSeconds: audio.duration, loudness: probeTimes.map(rms) }
		},
		{ bytes: [...bytes], probeTimes: probes.map((p) => p.at) }
	)
	const pictures = await readExportFrames(
		page,
		bytes,
		frames.map((f) => f.at),
		({ context }) => {
			const row = context.getImageData(0, 90, 320, 1).data
			for (let x = 0; x < 320; x++) {
				const [r = 0, g = 0, b = 0] = row.slice(x * 4, x * 4 + 3)
				if (r > 180 && g > 60 && g < 150 && b < 110) return { square: x }
			}
			return { square: null }
		},
		{ size: { width: 320, height: 180 } }
	)

	// As long as the edit — no stalls recorded at the jump between clips.
	expect(Math.abs(pictures.seconds - duration)).toBeLessThan(0.25)
	expect(Math.abs(measured.audioSeconds - duration)).toBeLessThan(0.25)
	// The sound is the edit's order, not the take's: silence first, then tone.
	for (const [index, probe] of probes.entries()) {
		const loudness = measured.loudness[index] ?? 0
		if (probe.tone) expect(loudness, `tone at ${probe.at.toFixed(2)}s`).toBeGreaterThan(0.1)
		else expect(loudness, `silence at ${probe.at.toFixed(2)}s`).toBeLessThan(0.02)
	}
	// And so are the pictures: each frame shows the square where it was at
	// its source time (20 px + 80 px a second), within a few frames. That's
	// the time of the frame the export had, not always the one asked
	// (export-frames.ts); both stay inside one clip.
	for (const [index, frame] of frames.entries()) {
		const read = pictures.frames[index]
		const source = frame.source + (read?.shown ?? frame.at) - frame.at
		expect(read?.square, `frame for source ${source.toFixed(2)}s`).not.toBeNull()
		expect(Math.abs((read?.square ?? 0) - (20 + source * 80))).toBeLessThan(30)
	}
})

/** A 3 s tone take split at 1.5 s: the export pauses and resumes the recorder between the two. */
async function openSplitTake(page: Page) {
	await openEditorWithVideo(page, [[3, true]])
	await seekTo(page, 1.5)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
}

/** Exports, and checks the file still downloads with the wrong-length warning in place of "Export finished". */
async function exportAndWarn(page: Page, direction: 'long' | 'short') {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	expect((await downloading).suggestedFilename()).toBe('test-take-edited.webm')
	await expect(
		page.getByText('test-take-edited.webm came out the wrong length', { exact: true })
	).toBeVisible()
	const message = page.getByText(/^This export came out /)
	await expect(message).toBeVisible()
	const match = (await message.innerText()).match(
		/^This export came out (\d+\.\d) s too (long|short), probably because the computer ran low on memory\. Close other apps and export again\.$/
	)
	expect(match?.[2]).toBe(direction)
	// The forced 600 ms, give or take a frame or two; over the 0.25 s allowed.
	expect(Number(match?.[1])).toBeGreaterThan(0.25)
	await expect(page.getByText('Export finished', { exact: true })).toHaveCount(0)
}

// The two ways an export goes wrong under memory pressure (PROGRESS_NOTES.md
// 4f), forced in the page. The file still downloads; the user is told.
test('an export that comes out too long says so, and still downloads', async ({ page }) => {
	await mockActions(page, { words: [] })
	await openSplitTake(page)
	// The main thread stalls 600 ms at each segment's end, so the recorder is
	// paused late and keeps recording the held frame.
	await page.evaluate(() => {
		const pause = MediaRecorder.prototype.pause
		MediaRecorder.prototype.pause = function () {
			const until = performance.now() + 600
			while (performance.now() < until) {
				// A stalled main thread.
			}
			pause.call(this)
		}
	})
	await exportAndWarn(page, 'long')
})

test('an export that comes out too short says so, and still downloads', async ({ page }) => {
	await mockActions(page, { words: [] })
	await openSplitTake(page)
	// Recording resumes 600 ms into the second segment, which is lost.
	await page.evaluate(() => {
		const resume = MediaRecorder.prototype.resume
		MediaRecorder.prototype.resume = function () {
			setTimeout(() => resume.call(this), 600)
		}
	})
	await exportAndWarn(page, 'short')
})

test('export waits for the transcript: clicked as soon as the video opens, it says it is getting ready, and starts only once it can', async ({
	page
}) => {
	await mockActions(page, {
		words: [w('Hello', 0.2, 0.6), w('there.', 0.6, 1.0), w('Bye.', 2.0, 2.4)]
	})
	// The transcript held back, as a long video keeps the editor reading it.
	let release = () => {}
	const held = new Promise<void>((resolve) => (release = resolve))
	await page.route(
		(url) => url.pathname.endsWith('/editor'),
		async (route) => {
			if (!route.request().postData()?.includes('"audioBase64"')) return route.fallback()
			await held
			await route.fallback()
		}
	)
	const downloads: string[] = []
	page.on('download', (download) => downloads.push(download.suggestedFilename()))
	// With sound, so there is a transcript to wait for.
	await openEditorWithVideo(page, [
		[1, true],
		[0.6, false],
		[1.4, true]
	])

	// Straight away: Export is there, but waits, saying why; a click does nothing.
	const button = page.getByRole('button', { name: 'Export video' })
	await expect(button).toBeDisabled()
	await expect(button).toHaveText('Getting ready…')
	await button.click({ force: true })
	await page.waitForTimeout(1500)
	expect(downloads).toEqual([])
	await expect(page.getByRole('status').filter({ hasText: 'Exporting' })).toHaveCount(0)

	// The transcript comes: Export opens, and records a real file.
	release()
	await expect(button).toBeEnabled({ timeout: 30_000 })
	await expect(button).toHaveText('Export')
	const downloading = page.waitForEvent('download')
	await button.click()
	const file = await readFile(await (await downloading).path())
	expect(file.length).toBeGreaterThan(1024)
	await expect(page.getByText('Export finished', { exact: true })).toBeVisible()
})

test('an export that comes out empty says so plainly, and offers no file', async ({ page }) => {
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	// A recorder that hands over nothing: a file with no frames in it.
	await page.evaluate(() => {
		const handler = Object.getOwnPropertyDescriptor(MediaRecorder.prototype, 'ondataavailable')
		Object.defineProperty(MediaRecorder.prototype, 'ondataavailable', {
			configurable: true,
			get() {
				return handler?.get?.call(this)
			},
			set(listener: ((event: BlobEvent) => void) | null) {
				handler?.set?.call(
					this,
					listener && ((event: BlobEvent) => listener({ ...event, data: new Blob([]) }))
				)
			}
		})
	})
	const downloads: string[] = []
	page.on('download', (download) => downloads.push(download.suggestedFilename()))
	await page.getByRole('button', { name: 'Export video' }).click()
	await expect(page.getByText('The export came out empty.', { exact: true }).first()).toBeVisible({
		timeout: 60_000
	})
	await expect(
		page
			.getByText(
				'Nothing was recorded, so there is no file to download. Export again, and keep this tab open and in front while it runs.'
			)
			.first()
	).toBeVisible()
	await expect(page.getByText('Export finished', { exact: true })).toHaveCount(0)
	expect(downloads).toEqual([])
})
