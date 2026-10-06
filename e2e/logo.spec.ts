import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, openEditorWithVideo, openTool } from './editor-helpers'
import { exportVideo, readExportFrames } from './export-frames'

// The logo placed and sized by hand. The video is 320×180; the logo a solid
// green 2:1 JPG, so where it lands in the export is the green box's bounds.

type Box = { x: number; y: number; width: number; height: number }

const graphics = (page: Page) => page.getByRole('region', { name: 'Graphics' })
const logoBox = (page: Page) => page.getByTestId('logo-box')
const logoImage = (page: Page) => page.getByTestId('player').getByRole('img', { name: 'Watermark' })

async function greenJpg(page: Page) {
	const dataUrl = await page.evaluate(() => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 32 })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		context.fillStyle = '#00ff00'
		context.fillRect(0, 0, 64, 32)
		return canvas.toDataURL('image/jpeg', 0.95)
	})
	return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
}

/** The logo's place in the preview, as fractions of the output frame. */
async function previewBox(page: Page): Promise<Box> {
	const logo = await logoImage(page).boundingBox()
	const frame = await page.getByTestId('output-frame').boundingBox()
	if (!logo || !frame) throw new Error('no layout box')
	return {
		x: (logo.x - frame.x) / frame.width,
		y: (logo.y - frame.y) / frame.height,
		width: logo.width / frame.width,
		height: logo.height / frame.height
	}
}

/** Drags from one point to another, both as fractions of the output frame. */
async function dragInFrame(page: Page, from: [number, number], to: [number, number]) {
	await page.getByTestId('output-frame').scrollIntoViewIfNeeded()
	const frame = await page.getByTestId('output-frame').boundingBox()
	if (!frame) throw new Error('no layout box')
	const at = ([x, y]: [number, number]) =>
		[frame.x + x * frame.width, frame.y + y * frame.height] as const
	await page.mouse.move(...at(from))
	await page.mouse.down()
	await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]))
	await page.mouse.move(...at(to))
	await page.mouse.up()
}

/** Exports, and finds the green logo's bounds in the frame at 1 s, in pixels. */
async function exportedLogo(page: Page) {
	const bytes = await exportVideo(page)
	const {
		videoWidth: width,
		videoHeight: height,
		frames
	} = await readExportFrames(page, bytes, [1], ({ context, width, height }) => {
		const data = context.getImageData(0, 0, width, height).data
		let left = width
		let top = height
		let right = -1
		let bottom = -1
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				if ((data[i + 1] ?? 0) > 180 && (data[i] ?? 0) < 90 && (data[i + 2] ?? 0) < 90) {
					left = Math.min(left, x)
					right = Math.max(right, x)
					top = Math.min(top, y)
					bottom = Math.max(bottom, y)
				}
			}
		}
		return { logo: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } }
	})
	const [frame] = frames
	if (!frame) throw new Error('no frame read')
	return { width, height, logo: frame.logo }
}

test('a JPG logo is dragged anywhere and resized by hand, in the preview and the export, one undo step each', async ({
	page
}) => {
	test.setTimeout(150_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	const jpg = await greenJpg(page)
	const choosing = page.waitForEvent('filechooser')
	await openTool(page, 'Graphics')
	await graphics(page).getByRole('button', { name: 'Add logo (PNG or JPG)' }).click()
	const chooser = await choosing
	expect(await chooser.element().getAttribute('accept')).toBe('image/png,image/jpeg')
	await chooser.setFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: jpg })
	await expect(logoImage(page)).toBeVisible()
	// In its corner first: 15% wide, 3% in from the bottom-right.
	const cornered = await previewBox(page)
	expect(cornered.width).toBeCloseTo(0.15, 2)
	expect(cornered.x + cornered.width).toBeCloseTo(0.97, 2)

	// Dragged by its middle: the same distance as the pointer.
	const middle: [number, number] = [
		cornered.x + cornered.width / 2,
		cornered.y + cornered.height / 2
	]
	await dragInFrame(page, middle, [middle[0] - 0.5, middle[1] - 0.4])
	const moved = await previewBox(page)
	expect(moved.x).toBeCloseTo(cornered.x - 0.5, 2)
	expect(moved.y).toBeCloseTo(cornered.y - 0.4, 2)
	await openTool(page, 'Graphics')
	await expect(graphics(page).getByRole('button', { name: 'Bottom right' })).toHaveAttribute(
		'aria-pressed',
		'false'
	)

	// Resized by its corner: twice as wide, same top-left, same shape.
	await dragInFrame(
		page,
		[moved.x + moved.width, moved.y + moved.height],
		[moved.x + 0.3, moved.y + 0.1]
	)
	const resized = await previewBox(page)
	expect(resized.width).toBeCloseTo(0.3, 2)
	expect(resized.x).toBeCloseTo(moved.x, 2)
	expect((resized.width * 320) / (resized.height * 180)).toBeCloseTo(2, 1)
	await openTool(page, 'Graphics')
	await expect(graphics(page).getByLabel('Logo size (%)')).toHaveValue('30')

	await openTool(page, 'Graphics')
	// The export puts it at the same place and size.
	const exported = await exportedLogo(page)
	expect(
		Math.abs(exported.logo.x - resized.x * exported.width),
		JSON.stringify(exported)
	).toBeLessThan(3)
	expect(Math.abs(exported.logo.y - resized.y * exported.height)).toBeLessThan(3)
	expect(Math.abs(exported.logo.width - 0.3 * exported.width)).toBeLessThan(3)
	expect(Math.abs(exported.logo.height - 0.15 * exported.width)).toBeLessThan(3)

	// From the keyboard: an arrow moves it 1% of the frame; - makes it smaller.
	await logoBox(page).focus()
	await page.keyboard.press('ArrowRight')
	expect((await previewBox(page)).x).toBeCloseTo(resized.x + 0.01, 2)
	await page.keyboard.press('-')
	await openTool(page, 'Graphics')
	await expect(graphics(page).getByLabel('Logo size (%)')).toHaveValue('29')

	// Typed size; then each step undoes on its own.
	await openTool(page, 'Graphics')
	const size = graphics(page).getByLabel('Logo size (%)')
	await openTool(page, 'Graphics')
	await size.fill('20')
	await openTool(page, 'Graphics')
	await size.press('Enter')
	expect((await previewBox(page)).width).toBeCloseTo(0.2, 2)
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(size).toHaveValue('29')
	await undo.click()
	await undo.click()
	await expect(size).toHaveValue('30')
	await undo.click()
	await expect(size).toHaveValue('15')
	expect((await previewBox(page)).x).toBeCloseTo(moved.x, 2)
	await undo.click()
	expect((await previewBox(page)).x).toBeCloseTo(cornered.x, 2)

	await openTool(page, 'Graphics')
	// A corner puts a placed logo back in it, at its size.
	await dragInFrame(page, middle, [0.5, 0.5])
	await openTool(page, 'Graphics')
	await graphics(page).getByRole('button', { name: 'Top left' }).click()
	const top = await previewBox(page)
	expect(top.x).toBeCloseTo(0.03, 2)
	expect(top.width).toBeCloseTo(0.15, 2)

	// A logo command with no corner: bottom-right.
	await mockActions(page, { words: [], command: editCommand({ action: 'watermark' }) })
	await page.getByRole('textbox', { name: 'Edit command' }).fill('put my logo on')
	await page.getByRole('button', { name: 'Run' }).click()
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await expect(reply).toContainText("I'll move the watermark to the bottom-right corner.")
	await reply.getByRole('button', { name: 'Apply' }).click()
	const back = await previewBox(page)
	expect(back.x + back.width).toBeCloseTo(0.97, 2)
})

test('a logo attached in the chat turns by typing, by keys and by its handle, and the export turns it the same', async ({
	page
}) => {
	test.setTimeout(150_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	// Attached in the chat: an image becomes the logo, and the chat says so.
	await page
		.getByLabel('Attach a file')
		.setInputFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: await greenJpg(page) })
	await expect(page.getByText('Using logo.jpg as the logo.')).toBeVisible()
	await expect(logoImage(page)).toBeVisible()
	await openTool(page, 'Graphics')
	const size = graphics(page).getByLabel('Logo size (%)')
	await openTool(page, 'Graphics')
	await size.fill('30')
	await openTool(page, 'Graphics')
	await size.press('Enter')
	// In the middle, so the turned logo stays inside the frame (past its edges, it's cut off).
	const placed = await previewBox(page)
	await dragInFrame(page, [placed.x + placed.width / 2, placed.y + placed.height / 2], [0.5, 0.5])

	// A quarter turn, typed: the 2:1 logo now stands tall, about the same centre.
	const upright = await previewBox(page)
	await openTool(page, 'Graphics')
	const rotation = graphics(page).getByLabel('Logo rotation (°)')
	await openTool(page, 'Graphics')
	await rotation.fill('90')
	await openTool(page, 'Graphics')
	await rotation.press('Enter')
	const turned = await previewBox(page)
	// In pixels: 96×48 upright, 48×96 turned (the frame is 320×180).
	expect(turned.width * 320).toBeCloseTo(upright.height * 180, 0)
	expect(turned.height * 180).toBeCloseTo(upright.width * 320, 0)
	expect(turned.x + turned.width / 2).toBeCloseTo(upright.x + upright.width / 2, 2)

	const exported = await exportedLogo(page)
	expect(Math.abs(exported.logo.width - 48), JSON.stringify(exported)).toBeLessThan(3)
	expect(Math.abs(exported.logo.height - 96)).toBeLessThan(3)
	expect(
		Math.abs(exported.logo.x + exported.logo.width / 2 - (turned.x + turned.width / 2) * 320)
	).toBeLessThan(3)

	// Keys: ] turns it a degree further, Shift+[ 15 back.
	await logoBox(page).focus()
	await page.keyboard.press(']')
	await expect(rotation).toHaveValue('91')
	await page.keyboard.press('Shift+[')
	await expect(rotation).toHaveValue('76')

	// The handle: dragged to straight left of the logo's centre, it turns to −90°.
	const handle = await logoBox(page).locator('[data-logo-rotate]').boundingBox()
	const box = await logoBox(page).boundingBox()
	if (!handle || !box) throw new Error('no layout box')
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
	await page.mouse.down()
	await page.mouse.move(centre.x - 40, centre.y - 20)
	await page.mouse.move(centre.x - 80, centre.y)
	await page.mouse.up()
	await expect(rotation).toHaveValue('-90')

	// Each turn was one step.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(rotation).toHaveValue('76')
	await undo.click()
	await undo.click()
	await expect(rotation).toHaveValue('90')
	await undo.click()
	await expect(rotation).toHaveValue('0')
})
