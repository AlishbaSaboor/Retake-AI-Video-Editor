import { test, expect, type Locator, type Page } from '@playwright/test'
import { editCommand, mockActions, openEditorWithVideo, seekTo, openTool } from './editor-helpers'
import { exportVideo, readExportFrames, surelyAfter, surelyBefore } from './export-frames'

// The test video is 320×180: a dark background (#112233) with an orange
// square (60×60, y 60–120) crossing it at 80 px a second from x = 20. A box
// drawn in the top-left sits where the square never goes; a blur across the
// middle covers the square's whole path, so its sharp edges are what a blur
// has to soften.
const BLUR_ROW = 90

const panel = (page: Page) => page.getByRole('region', { name: 'Annotations' })
const layer = (page: Page) => page.getByTestId('annotation-layer')
const shownItems = (page: Page, kind?: string) =>
	page.locator(kind ? `[data-annotation-kind="${kind}"]` : '[data-annotation-id]')

async function pickTool(page: Page, name: string) {
	await openTool(page, 'Annotations')
	await panel(page)
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name, exact: true })
		.click()
}

/** Drags across the picture between two points given as fractions of it. */
async function dragOnPicture(page: Page, from: [number, number], to: [number, number]) {
	await layer(page).scrollIntoViewIfNeeded()
	const box = await layer(page).boundingBox()
	if (!box) throw new Error('annotation layer has no layout box')
	const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const
	await page.mouse.move(...at(from))
	await page.mouse.down()
	await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]))
	await page.mouse.move(...at(to))
	await page.mouse.up()
}

/** An item's place on the picture, as fractions, from its preview element. */
async function rectOf(item: Locator) {
	return item.evaluate((element: HTMLElement) => {
		const percent = (value: string) => Number.parseFloat(value) / 100
		return {
			x: percent(element.style.left),
			y: percent(element.style.top),
			width: percent(element.style.width),
			height: percent(element.style.height)
		}
	})
}

const lanePosition = async (page: Page, name: string) => ({
	start: Number(
		await page.getByRole('slider', { name: `${name} start` }).getAttribute('aria-valuenow')
	),
	end: Number(await page.getByRole('slider', { name: `${name} end` }).getAttribute('aria-valuenow'))
})

/** Drags an item's end handle in the lane to `seconds` of the edited video. */
async function dragEndTo(page: Page, name: string, seconds: number, editedSeconds: number) {
	const handle = page.getByRole('slider', { name: `${name} end` })
	await handle.scrollIntoViewIfNeeded()
	const track = await handle.locator('..').boundingBox()
	const grip = await handle.boundingBox()
	if (!track || !grip) throw new Error('lane has no layout box')
	await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
	await page.mouse.down()
	await page.mouse.move(track.x + (seconds / editedSeconds) * track.width, grip.y + 2, { steps: 5 })
	await page.mouse.up()
}

/**
 * Reads a 320×180 image drawn on `context`: the pixel at the box's centre,
 * the largest brightness step between neighbouring pixels along the blur row
 * (its sharpest edge), and brightest minus darkest along it (what still shows
 * through a blur). Runs in the page, sent as source.
 */
const readImage = (
	{ context }: { context: CanvasRenderingContext2D },
	{ boxCentre, row }: { boxCentre: [number, number]; row: number }
) => {
	const [r = 0, g = 0, b = 0] = context.getImageData(boxCentre[0], boxCentre[1], 1, 1).data
	const data = context.getImageData(0, row, 320, 1).data
	const light: number[] = []
	for (let i = 0; i < data.length; i += 4) {
		light.push(((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3)
	}
	let sharpestStep = 0
	for (let i = 1; i < light.length; i++) {
		sharpestStep = Math.max(sharpestStep, Math.abs((light[i] ?? 0) - (light[i - 1] ?? 0)))
	}
	const contrast = Math.max(...light) - Math.min(...light)
	return { boxPixel: [r, g, b] satisfies [number, number, number], sharpestStep, contrast }
}

/** Exports the edit and reads frames of the file at `times`. */
async function exportReadings(page: Page, times: number[], boxCentre: [number, number]) {
	const bytes = await exportVideo(page)
	const { frames } = await readExportFrames(page, bytes, times, readImage, {
		size: { width: 320, height: 180 },
		args: { boxCentre, row: BLUR_ROW }
	})
	return frames
}

/** Reads the preview, as the screen shows it, the same way as an exported frame. */
async function previewReading(page: Page, boxCentre: [number, number]) {
	const png = (await layer(page).screenshot()).toString('base64')
	return page.evaluate(
		async ({ png, readSource, args }) => {
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
			context.drawImage(await createImageBitmap(blob), 0, 0, 320, 180)
			const read = new Function(`return (${readSource})`)() as typeof readImage
			return read({ context }, args)
		},
		{ png, readSource: readImage.toString(), args: { boxCentre, row: BLUR_ROW } }
	)
}

const isRed = ([r, g, b]: [number, number, number]) => r > 200 && g < 70 && b < 70
const isBackground = ([r, g, b]: [number, number, number]) => r < 50 && g < 70 && b > 30 && b < 90

test('boxes and blurs drawn on the preview show only in their time, in the preview and the export', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	const duration = await openEditorWithVideo(page)

	// A red box in the top-left, drawn at 0.5 s.
	await seekTo(page, 0.5)
	await openTool(page, 'Annotations')
	await panel(page).getByLabel('Box color').fill('#ff0000')
	await pickTool(page, 'Box')
	await dragOnPicture(page, [0.05, 0.05], [0.3, 0.28])
	await expect(shownItems(page, 'box')).toHaveCount(1)
	await expect(page.getByRole('button', { name: /^Box 1, / })).toBeVisible()
	// It shows for 3 s from the playhead, cut short by the end of the video.
	const drawnAt = await lanePosition(page, 'Box 1')
	expect(drawnAt.start).toBeGreaterThan(0.3)
	expect(drawnAt.start).toBeLessThan(0.7)
	expect(drawnAt.end).toBeCloseTo(duration, 1)

	// Its lane bar's end dragged back to ~1.5 s.
	await dragEndTo(page, 'Box 1', 1.5, duration)
	const box = await lanePosition(page, 'Box 1')
	expect(box.start).toBe(drawnAt.start)
	expect(Math.abs(box.end - 1.5)).toBeLessThan(0.15)

	// Moved and resized with Select.
	await seekTo(page, (box.start + box.end) / 2)
	await pickTool(page, 'Select')
	const item = shownItems(page, 'box')
	const before = await rectOf(item)
	await dragOnPicture(page, [0.15, 0.15], [0.25, 0.2])
	const moved = await rectOf(item)
	expect(moved.x - before.x).toBeCloseTo(0.1, 1)
	expect(moved.y - before.y).toBeCloseTo(0.05, 1)
	expect(moved.width).toBeCloseTo(before.width, 5)
	const handle = item.locator('[data-resize]')
	await handle.scrollIntoViewIfNeeded()
	const grip = await handle.boundingBox()
	const picture = await layer(page).boundingBox()
	if (!grip || !picture) throw new Error('no layout box')
	await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
	await page.mouse.down()
	await page.mouse.move(grip.x + 0.05 * picture.width, grip.y + 0.05 * picture.height, { steps: 4 })
	await page.mouse.up()
	const resized = await rectOf(item)
	expect(resized.x).toBeCloseTo(moved.x, 5)
	expect(resized.width - moved.width).toBeCloseTo(0.05, 1)
	expect(resized.height - moved.height).toBeCloseTo(0.05, 1)
	const boxCentre: [number, number] = [
		Math.round((resized.x + resized.width / 2) * 320),
		Math.round((resized.y + resized.height / 2) * 180)
	]

	// A blur across the middle, drawn at ~1.9 s: it runs to the end.
	await seekTo(page, 1.9)
	await pickTool(page, 'Blur')
	await dragOnPicture(page, [0.01, 0.25], [0.99, 0.75])
	await expect(shownItems(page, 'blur')).toHaveCount(1)
	await expect(shownItems(page, 'box')).toHaveCount(0)
	const blur = await lanePosition(page, 'Blur 2')
	expect(blur.start).toBeGreaterThan(box.end)
	await pickTool(page, 'Blur')

	// The Original view shows none of it.
	await page.getByRole('button', { name: 'Original', exact: true }).click()
	await expect(shownItems(page)).toHaveCount(0)
	await page.getByRole('button', { name: 'Edited', exact: true }).click()
	await expect(shownItems(page, 'blur')).toHaveCount(1)

	// The preview really blurs: no sharp square edge on the row under it, but
	// the square still shows through. Before the blur, the edge is sharp.
	const previewBlurred = await previewReading(page, boxCentre)
	await seekTo(page, blur.start - 0.4)
	await expect(shownItems(page, 'blur')).toHaveCount(0)
	const previewSharp = await previewReading(page, boxCentre)
	// The screenshot is scaled down to 320 wide, which softens every edge by
	// how much it shrinks the player, so the blur is judged against the same
	// edge unblurred: measured 56 sharp, 10 blurred (a 768 px player); 68–72
	// and 20.7 (the editor's three columns, ~575 px).
	expect(previewSharp.sharpestStep, 'sharp edge before the blur, preview').toBeGreaterThan(35)
	expect(
		previewBlurred.sharpestStep,
		'softened under the blur, preview: under half as sharp'
	).toBeLessThan(previewSharp.sharpestStep / 2)
	expect(previewBlurred.contrast, 'the square shows through, preview').toBeGreaterThan(25)

	// Each draw, retime, move and resize was one undo step; reset removes them all.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	const redo = page.getByRole('button', { name: 'Redo' })
	for (let step = 0; step < 5; step++) await undo.click()
	await openTool(page, 'Annotations')
	await expect(panel(page).getByText('Nothing drawn yet.')).toBeVisible()
	for (let step = 0; step < 5; step++) await redo.click()
	expect(await lanePosition(page, 'Box 1')).toEqual(box)
	expect(await lanePosition(page, 'Blur 2')).toEqual(blur)
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await openTool(page, 'Annotations')
	await expect(panel(page).getByText('Nothing drawn yet.')).toBeVisible()
	await undo.click()
	expect(await lanePosition(page, 'Box 1')).toEqual(box)
	await seekTo(page, (box.start + box.end) / 2)
	expect(await rectOf(shownItems(page, 'box'))).toEqual(resized)

	// The export: the box's pixels are red only in its time, and the blur
	// softens the square's edges only in its own.
	// Each frame is judged by the time the export had for it (export-frames.ts),
	// on each side of each edge it surely falls.
	const times = [
		box.start - 0.3,
		(box.start + box.end) / 2,
		box.end + 0.3,
		box.end + 0.5,
		blur.start + 0.4,
		blur.start + 0.6
	]
	const frames = await exportReadings(page, times, boxCentre)
	const shown = JSON.stringify(frames.map((frame) => frame.shown))
	const beforeBox = frames.filter((frame) => surelyBefore(frame.shown, box.start))
	const inBox = frames.filter(
		(frame) => surelyAfter(frame.shown, box.start) && surelyBefore(frame.shown, box.end)
	)
	const afterBox = frames.filter((frame) => surelyAfter(frame.shown, box.end))
	const sharp = frames.filter((frame) => surelyBefore(frame.shown, blur.start))
	const inBlur = frames.filter(
		(frame) => surelyAfter(frame.shown, blur.start) && surelyBefore(frame.shown, blur.end)
	)
	for (const [name, judged] of Object.entries({ beforeBox, inBox, afterBox, inBlur })) {
		expect(judged.length, `a frame ${name}: ${shown}`).toBeGreaterThan(0)
	}
	for (const frame of [...beforeBox, ...afterBox]) {
		expect(isBackground(frame.boxPixel), `background at ${frame.shown} s: ${frame.boxPixel}`).toBe(
			true
		)
	}
	for (const frame of inBox) {
		expect(isRed(frame.boxPixel), `red at ${frame.shown} s: ${frame.boxPixel}`).toBe(true)
	}
	for (const frame of sharp) {
		expect(frame.sharpestStep, `sharp edge at ${frame.shown} s`).toBeGreaterThan(50)
	}
	// Measured: 79–91 sharp, 10 under the blur.
	for (const frame of inBlur) {
		expect(frame.sharpestStep, `softened under the blur at ${frame.shown} s`).toBeLessThan(30)
		expect(frame.contrast, 'the square shows through the blur').toBeGreaterThan(25)
	}
})

test('the eraser, the Delete key and a typed command add and remove items, one undo step each', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)

	// "Blur the top-right corner from 1 to 2 seconds": confirmed first, with
	// the stays-in-place warning; Cancel adds nothing.
	const blurCommand = editCommand({
		action: 'blur',
		region: 'top-right',
		startSeconds: 1,
		endSeconds: 2
	})
	const run = async () => {
		await mockActions(page, { words: [], command: blurCommand })
		await command.fill('blur the top-right corner from 1 to 2 seconds')
		await page.getByRole('button', { name: 'Run' }).click()
	}
	await run()
	await expect(reply).toContainText(
		"I'll blur the top-right corner from 0:01 to 0:02. It stays in place: it won't follow anything that moves."
	)
	await reply.getByRole('button', { name: 'Cancel' }).click()
	await openTool(page, 'Annotations')
	await expect(panel(page).getByText('Nothing drawn yet.')).toBeVisible()
	await run()
	await reply.getByRole('button', { name: 'Apply' }).click()
	expect(await lanePosition(page, 'Blur 1')).toEqual({ start: 1, end: 2 })
	await seekTo(page, 1.5)
	const third = 1 / 3
	const commanded = await rectOf(shownItems(page, 'blur'))
	expect(commanded.x).toBeCloseTo(1 - third, 3)
	expect(commanded.width).toBeCloseTo(third, 3)
	await seekTo(page, 2.5)
	await expect(shownItems(page)).toHaveCount(0)

	// Text needs words before it can be drawn.
	await openTool(page, 'Annotations')
	const textTool = panel(page).getByRole('group', { name: 'Annotation tool' }).getByRole('button', {
		name: 'Text',
		exact: true
	})
	await expect(textTool).toBeDisabled()
	await openTool(page, 'Annotations')
	await panel(page).getByLabel('Text to add').fill('Hello')
	await seekTo(page, 1.2)
	await openTool(page, 'Annotations')
	await textTool.click()
	await dragOnPicture(page, [0.1, 0.6], [0.6, 0.8])
	await expect(shownItems(page, 'text')).toHaveText('Hello')

	// The eraser removes what it's clicked on, on the picture or in the lane.
	await pickTool(page, 'Eraser')
	await shownItems(page, 'text').click()
	await expect(page.getByRole('button', { name: /^Text 2, / })).toHaveCount(0)
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(page.getByRole('button', { name: /^Text 2, / })).toBeVisible()
	await page.getByRole('button', { name: /^Blur 1, / }).click()
	await expect(page.getByRole('button', { name: /^Blur 1, / })).toHaveCount(0)
	await page.getByRole('button', { name: 'Undo last change' }).click()

	// From the keyboard: arrows move a bar in time, Delete removes it.
	const bar = page.getByRole('button', { name: /^Blur 1, / })
	await bar.focus()
	await page.keyboard.press('ArrowRight')
	expect(await lanePosition(page, 'Blur 1')).toEqual({ start: 1.1, end: 2.1 })
	await page.keyboard.press('Delete')
	await expect(page.getByRole('button', { name: /^Blur 1, / })).toHaveCount(0)
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await page.getByRole('button', { name: 'Undo last change' }).click()
	expect(await lanePosition(page, 'Blur 1')).toEqual({ start: 1, end: 2 })
})
