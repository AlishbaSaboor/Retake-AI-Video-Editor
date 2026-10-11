import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import type { HighlightPick } from '../src/app/[locale]/editor/assistant/highlights'
import { editCommand, mockActions, openEditorWithVideo, openTool, w } from './editor-helpers'
import { readExportFrames } from './export-frames'

// Find highlights: the best moments, picked from the transcript, shown in a
// pop-up to watch and download. The transcript and Gemini's picks are both
// canned (mockActions), so no paid call is made; what's tested is what the
// app does with them — sentence-edge times, playback, the downloaded files,
// and that the edit is never touched.

// Five sentences over a 6 s take with sound throughout.
const WORDS = [
	w('Hello.', 0.2, 0.8),
	w('This', 1, 1.3),
	w('is', 1.3, 1.5),
	w('the', 1.5, 1.7),
	w('best', 1.7, 2),
	w('part.', 2, 2.4),
	w('Really.', 2.6, 3),
	w('Another', 3.4, 3.8),
	w('good', 3.8, 4.1),
	w('bit.', 4.1, 4.6),
	w('Bye.', 5, 5.6)
]
const TONE: Array<[number, boolean]> = [[6, true]]

const pick = (firstSentence: number, lastSentence: number, title: string): HighlightPick => ({
	firstSentence,
	lastSentence,
	title,
	description: `Why ${title} is worth watching.`
})
// Best first, as Gemini lists them; the last overlaps the second and is dropped.
const PICKS = [
	pick(4, 4, 'Good bit'),
	pick(2, 3, 'Best part'),
	pick(1, 1, 'Opening'),
	pick(3, 4, 'Overlapping')
]
// Each pick's sentences, padded up to 0.15 s into the pauses either side.
const BEST_PART = { start: 0.85, end: 3.15 }
const GOOD_BIT = { start: 3.25, end: 4.75 }

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Highlights' })
const card = (page: Page, title: string) =>
	dialog(page).getByRole('listitem').filter({ hasText: title })

/** What the timeline plays: its length and pieces, to show the edit didn't change. */
async function timeline(page: Page) {
	const scrubber = page.getByRole('slider', { name: 'Playhead position' })
	return {
		length: await scrubber.getAttribute('aria-valuemax'),
		pieces: await scrubber.getAttribute('data-segments')
	}
}

async function openHighlights(page: Page) {
	await openTool(page, 'Find highlights')
	await page.getByRole('button', { name: 'Find highlights', exact: true }).click()
	await expect(dialog(page)).toBeVisible()
}

/** Downloads one card's moment and returns the file's name and bytes. */
async function download(page: Page, title: string) {
	const downloading = page.waitForEvent('download')
	await card(page, title)
		.getByRole('button', { name: `Download the highlight ${title}` })
		.click()
	const file = await downloading
	const bytes = await readFile(await file.path())
	// Back to its Download button once the file is out.
	await expect(card(page, title).getByRole('button', { name: /^Download/ })).toBeVisible()
	return { name: file.suggestedFilename(), bytes }
}

/** The orange square's left edge in a frame of the test video (it moves 80 px a second). */
function squareLeft({
	context,
	width,
	height
}: {
	context: CanvasRenderingContext2D
	width: number
	height: number
}) {
	const row = context.getImageData(0, Math.round(height / 2), width, 1).data
	for (let x = 0; x < width; x++) {
		const [r, g, b] = [row[x * 4] ?? 0, row[x * 4 + 1] ?? 0, row[x * 4 + 2] ?? 0]
		if (r > 180 && g > 70 && g < 140 && b < 100) return { left: x }
	}
	return { left: -1 }
}

test('finds the best moments on sentence edges, plays and downloads them, and never changes the edit', async ({
	page
}) => {
	const actions = await mockActions(page, { words: WORDS, highlights: PICKS })
	await openEditorWithVideo(page, TONE)
	await openTool(page, 'Transcript')
	await expect(page.getByText('Another good bit.')).toBeVisible({ timeout: 30_000 })
	const before = await timeline(page)

	await openHighlights(page)
	// Three, in the order they play; the overlapping pick is gone.
	await expect(dialog(page).getByRole('listitem')).toHaveCount(3)
	await expect(dialog(page).getByRole('listitem').nth(0)).toContainText('Opening')
	await expect(dialog(page).getByRole('listitem').nth(1)).toContainText('Best part')
	await expect(dialog(page).getByRole('listitem').nth(2)).toContainText('Good bit')
	await expect(dialog(page)).not.toContainText('Overlapping')
	await expect(card(page, 'Best part')).toContainText('Why Best part is worth watching.')
	await expect(card(page, 'Best part')).toContainText('0:00 – 0:03')
	await expect(card(page, 'Best part').locator('[data-highlight-preview]')).toHaveCount(1)

	// Picking a card plays its moment, and stops at its end.
	await card(page, 'Best part')
		.getByRole('button', { name: /Best part/ })
		.first()
		.click()
	const player = dialog(page).locator('[data-highlight-player]')
	await expect(player).toBeVisible()
	await player.evaluate((video: HTMLVideoElement) => {
		video.muted = true
		if (video.paused) void video.play()
	})
	await expect
		.poll(() => player.evaluate((video: HTMLVideoElement) => video.currentTime), {
			timeout: 10_000
		})
		.toBeGreaterThan(BEST_PART.start + 0.3)
	await expect
		.poll(() => player.evaluate((video: HTMLVideoElement) => video.paused), { timeout: 10_000 })
		.toBe(true)
	const stoppedAt = await player.evaluate((video: HTMLVideoElement) => video.currentTime)
	expect(stoppedAt).toBeGreaterThan(BEST_PART.end - 0.2)
	expect(stoppedAt).toBeLessThan(BEST_PART.end + 0.3)

	// Its download is just that moment, of the original picture, full frame.
	const best = await download(page, 'Best part')
	expect(best.name).toBe('test-take-highlight-2.webm')
	const bestFile = await readExportFrames(page, best.bytes, [0.1], squareLeft)
	expect(bestFile.seconds).toBeGreaterThan(BEST_PART.end - BEST_PART.start - 0.3)
	expect(bestFile.seconds).toBeLessThan(BEST_PART.end - BEST_PART.start + 0.4)
	expect([bestFile.videoWidth, bestFile.videoHeight]).toEqual([320, 180])
	// The square is where it was ~0.95 s into the recording (20 px + 80 px/s), not at its start.
	const left = bestFile.frames[0]?.left ?? -1
	expect(left).toBeGreaterThan(20 + 0.95 * 80 - 30)
	expect(left).toBeLessThan(20 + 0.95 * 80 + 30)

	// Ticked, the next download is cropped to 9:16.
	await dialog(page).getByRole('checkbox', { name: 'Crop to vertical (9:16)' }).check()
	const good = await download(page, 'Good bit')
	expect(good.name).toBe('test-take-highlight-3.webm')
	const goodFile = await readExportFrames(page, good.bytes, [], () => ({}))
	expect(goodFile.seconds).toBeGreaterThan(GOOD_BIT.end - GOOD_BIT.start - 0.3)
	expect(goodFile.seconds).toBeLessThan(GOOD_BIT.end - GOOD_BIT.start + 0.4)
	expect(goodFile.videoHeight).toBe(180)
	expect(goodFile.videoWidth / goodFile.videoHeight).toBeCloseTo(9 / 16, 1)

	// Close: the pop-up goes, and the edit is exactly as it was.
	await dialog(page).getByRole('button', { name: 'Close' }).click()
	await expect(dialog(page)).toHaveCount(0)
	expect(await timeline(page)).toEqual(before)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled()

	// Opened again, the same moments come back without asking Gemini again.
	await openHighlights(page)
	await expect(dialog(page).getByRole('listitem')).toHaveCount(3)
	expect(actions.highlightRequests()).toBe(1)
	await page.keyboard.press('Escape')
	await expect(dialog(page)).toHaveCount(0)
})

test('the Assistant opens the highlights from "find the best moments"', async ({ page }) => {
	await mockActions(page, {
		words: WORDS,
		highlights: PICKS,
		command: editCommand({ action: 'find_highlights' })
	})
	await openEditorWithVideo(page, TONE)
	await openTool(page, 'Assistant')
	await page.getByRole('textbox', { name: 'Edit command' }).fill('find the best moments')
	await page.getByRole('button', { name: 'Run' }).click()
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await expect(reply).toContainText("I'll find the best moments")
	await reply.getByRole('button', { name: 'Apply' }).click()
	await expect(dialog(page).getByRole('listitem')).toHaveCount(3, { timeout: 30_000 })
})

test('says so, and asks nothing, when the video has no transcript', async ({ page }) => {
	const actions = await mockActions(page, { highlights: PICKS })
	// No sound at all: no transcript to pick from.
	await openEditorWithVideo(page)
	await openHighlights(page)
	await expect(dialog(page)).toContainText(
		'This video has no sound, so there is no transcript to find highlights in.',
		{ timeout: 30_000 }
	)
	await expect(dialog(page).getByRole('listitem')).toHaveCount(0)
	expect(actions.highlightRequests()).toBe(0)
})
