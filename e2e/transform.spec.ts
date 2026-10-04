import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, openEditorWithVideo, seekTo } from './editor-helpers'

// The test video is 320×180: a dark background (#112233) and an orange
// square, 60×60 at y 60–120, crossing at 80 px a second from x = 20. Where
// the square (and a red box pinned to the picture) lands in an exported
// frame shows each flip, turn and crop was applied, and applied as previewed.

// One test at a time: each makes real-time recordings and exports, and
// running four of them beside the rest of the suite added to the load under
// which older export-length checks missed (PROGRESS_NOTES.md section 4c).
test.describe.configure({ mode: 'default' })

const picturePanel = (page: Page) => page.getByRole('region', { name: 'Picture' })
const degreesField = (page: Page) => picturePanel(page).getByLabel('Rotation (°)')

type Probe = { x: number; y: number }
type Reading = {
	width: number
	height: number
	colors: Array<[number, number, number]>
	orange: Probe | null
	/** The time of the frame shown: under load the export drops frames, so not always the one asked for. */
	shown: number
	/** White pixels in the middle tenth of the rows: the title's text. */
	middleWhite: number
}

/**
 * Reads frames of an exported file, at its own size: the colour at each
 * probe point, and the centre of the orange square as fractions of the frame.
 */
async function exportFrames(page: Page, times: number[], probes: Probe[]): Promise<Reading[]> {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	// A previous export's toast may still be up: the newest is this one's.
	await expect(page.getByText('Export finished', { exact: true }).last()).toBeVisible()
	return page.evaluate(
		async ({ bytes, times, probes }) => {
			const video = Object.assign(document.createElement('video'), {
				src: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' })),
				muted: true
			})
			const next = (type: string) =>
				new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
			await next('loadedmetadata')
			if (!Number.isFinite(video.duration)) {
				video.currentTime = 1e9
				while (!Number.isFinite(video.duration)) await next('durationchange')
			}
			const { videoWidth: width, videoHeight: height } = video
			const canvas = Object.assign(document.createElement('canvas'), { width, height })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const readings = []
			for (const at of times) {
				const presented = new Promise<number>((resolve) => {
					video.requestVideoFrameCallback((_, frame) => resolve(frame.mediaTime))
					setTimeout(() => resolve(at), 3000)
				})
				video.currentTime = at
				await next('seeked')
				const shown = await presented
				context.drawImage(video, 0, 0, width, height)
				const data = context.getImageData(0, 0, width, height).data
				const colors = probes.map(({ x, y }) => {
					const i = (y * width + x) * 4
					return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0] as [number, number, number]
				})
				let sx = 0
				let sy = 0
				let n = 0
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const i = (y * width + x) * 4
						if (
							(data[i] ?? 0) > 200 &&
							(data[i + 1] ?? 0) > 70 &&
							(data[i + 1] ?? 0) < 140 &&
							(data[i + 2] ?? 0) < 90
						) {
							sx += x
							sy += y
							n++
						}
					}
				}
				let middleWhite = 0
				for (let y = Math.floor(height * 0.45); y < Math.ceil(height * 0.55); y++) {
					for (let x = 0; x < width; x++) {
						const i = (y * width + x) * 4
						const white =
							(data[i] ?? 0) > 200 && (data[i + 1] ?? 0) > 200 && (data[i + 2] ?? 0) > 200
						if (white) middleWhite++
					}
				}
				readings.push({
					width,
					height,
					colors,
					orange: n ? { x: sx / n / width, y: sy / n / height } : null,
					shown,
					middleWhite
				})
			}
			return readings
		},
		{ bytes: [...bytes], times, probes }
	)
}

/** The orange square's centre in the preview, as fractions of the output frame on screen. */
async function previewOrange(page: Page) {
	const png = (await page.getByTestId('output-frame').screenshot()).toString('base64')
	return page.evaluate(async (png) => {
		const image = await createImageBitmap(
			await (await fetch(`data:image/png;base64,${png}`)).blob()
		)
		const canvas = Object.assign(document.createElement('canvas'), {
			width: image.width,
			height: image.height
		})
		const context = canvas.getContext('2d', { willReadFrequently: true })
		if (!context) throw new Error('no 2d context')
		context.drawImage(image, 0, 0)
		const data = context.getImageData(0, 0, image.width, image.height).data
		let sx = 0
		let sy = 0
		let n = 0
		for (let y = 0; y < image.height; y++) {
			for (let x = 0; x < image.width; x++) {
				const i = (y * image.width + x) * 4
				if (
					(data[i] ?? 0) > 200 &&
					(data[i + 1] ?? 0) > 70 &&
					(data[i + 1] ?? 0) < 140 &&
					(data[i + 2] ?? 0) < 90
				) {
					sx += x
					sy += y
					n++
				}
			}
		}
		return n ? { x: sx / n / image.width, y: sy / n / image.height } : null
	}, png)
}

const isOrange = ([r, g, b]: [number, number, number]) => r > 200 && g > 70 && g < 140 && b < 90
const isRed = ([r, g, b]: [number, number, number]) => r > 200 && g < 70 && b < 70
const isBackground = ([r, g, b]: [number, number, number]) => r < 50 && g < 70 && b > 30 && b < 90
const isBlack = ([r, g, b]: [number, number, number]) => r < 12 && g < 12 && b < 12

/**
 * The square's centre down a flipped, quarter-turned frame, moved to where it
 * was at 1.5 s. There it rises 80 px a second, so an export frame shown early
 * (under load: 1.38 s for 1.5 s, measured at 4× CPU throttling) has it lower.
 */
const orangeYAt1_5 = (reading: Reading) =>
	(reading.orange?.y ?? 1) - ((1.5 - reading.shown) * 80) / reading.height

/** Drags across the picture between two points given as fractions of the output frame. */
async function dragOnFrame(page: Page, from: [number, number], to: [number, number]) {
	const frame = page.getByTestId('output-frame')
	await frame.scrollIntoViewIfNeeded()
	const box = await frame.boundingBox()
	if (!box) throw new Error('no output frame')
	await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height)
	await page.mouse.down()
	await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 })
	await page.mouse.up()
}

test('flip, a quarter turn and a crop move the picture, its pinned box and nothing else, as previewed', async ({
	page
}) => {
	test.setTimeout(180_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)

	// A red box pinned to the picture's top-left (source x 16–96, y 9–50).
	await seekTo(page, 0.2)
	const annotations = page.getByRole('region', { name: 'Annotations' })
	await annotations.getByLabel('Box color').fill('#ff0000')
	const boxTool = annotations.getByRole('group', { name: 'Annotation tool' }).getByRole('button', {
		name: 'Box',
		exact: true
	})
	await boxTool.click()
	await dragOnFrame(page, [0.05, 0.05], [0.3, 0.28])
	await boxTool.click()

	// A quarter turn right: the frame becomes 180×320. Source (x, y) lands at (180 − y, x).
	await picturePanel(page).getByRole('button', { name: 'Rotate right 90°' }).click()
	await expect(degreesField(page)).toHaveValue('90')
	// Then mirrored left-right first: source x becomes 320 − x before the turn.
	await picturePanel(page).getByRole('button', { name: 'Flip horizontally' }).click()

	// At 1.5 s the square spans source x 140–200, y 60–120. Flipped: x 120–180;
	// turned: output x 60–120, y 120–180. Unflipped it would be at y 140–200.
	// The red box (source x 16–96, y 9–50): flipped x 224–304, turned: output
	// x 130–171, y 224–304. Pixels are read at the square's centre, which holds
	// for 0.375 s either way, since under load the export's frame for 1.5 s can
	// be ~0.2 s early (CI run 61); its position is compared moved back to 1.5 s.
	await seekTo(page, 1.5)
	const preview = await previewOrange(page)
	const [quarter] = await exportFrames(
		page,
		[1.5],
		[
			{ x: 90, y: 150 },
			{ x: 150, y: 264 },
			{ x: 40, y: 264 }
		]
	)
	if (!quarter) throw new Error('no frame')
	expect([quarter.width, quarter.height]).toEqual([180, 320])
	const [square, red, besideRed] = quarter.colors
	expect(isOrange(square ?? [0, 0, 0]), `square, flipped and turned ${square}`).toBe(true)
	// Measured 145–151 at 1× and 4× CPU throttling: under 10 px is half way to 170.
	const squareY = orangeYAt1_5(quarter) * 320
	expect(Math.abs(squareY - 150), `centred at y ${squareY}, not 170 as unflipped`).toBeLessThan(10)
	expect(isRed(red ?? [0, 0, 0]), `the pinned box turned with the picture ${red}`).toBe(true)
	expect(isBackground(besideRed ?? [0, 0, 0]), `beside the box ${besideRed}`).toBe(true)
	// The preview shows the square in the same place in the frame.
	expect(preview).not.toBeNull()
	expect(Math.abs((preview?.x ?? 0) - (quarter.orange?.x ?? 1))).toBeLessThan(0.04)
	expect(Math.abs((preview?.y ?? 0) - orangeYAt1_5(quarter))).toBeLessThan(0.04)

	// A 1:1 crop of the 180×320 frame: 180×180 from y 70. The square (y
	// 120–180) is now at y 50–110.
	await picturePanel(page)
		.getByRole('group', { name: 'Crop shape' })
		.getByRole('button', { name: '1:1' })
		.click()
	await picturePanel(page).getByRole('button', { name: 'Adjust crop' }).click()
	await seekTo(page, 1.5)
	const croppedPreview = await previewOrange(page)
	const [square1] = await exportFrames(
		page,
		[1.5],
		[
			{ x: 90, y: 80 },
			{ x: 90, y: 160 }
		]
	)
	if (!square1) throw new Error('no frame')
	expect([square1.width, square1.height]).toEqual([180, 180])
	expect(isOrange(square1.colors[0] ?? [0, 0, 0]), `square in the crop ${square1.colors[0]}`).toBe(
		true
	)
	expect(Math.abs((croppedPreview?.x ?? 0) - (square1.orange?.x ?? 1))).toBeLessThan(0.04)
	expect(Math.abs((croppedPreview?.y ?? 0) - orangeYAt1_5(square1))).toBeLessThan(0.04)

	// The title belongs to the frame: in the turned, cropped output its text
	// runs across the middle, sized to that frame. (Added only now: its band
	// would darken the square under it.)
	const graphics = page.getByRole('region', { name: 'Graphics' })
	await graphics.getByLabel('Title text').fill('Hi')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	const [titled] = await exportFrames(page, [0.5], [])
	expect(titled?.middleWhite, 'title text across the middle of the cropped frame').toBeGreaterThan(
		10
	)
	await page.getByRole('button', { name: 'Undo last change' }).click()

	// Each was one undo step; reset takes them all off.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(picturePanel(page).getByRole('button', { name: 'No crop' })).toHaveCount(0)
	await undo.click()
	await expect(
		picturePanel(page).getByRole('button', { name: 'Flip horizontally' })
	).toHaveAttribute('aria-pressed', 'false')
	await undo.click()
	await expect(degreesField(page)).toHaveValue('0')
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect(degreesField(page)).toHaveValue('90')
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(degreesField(page)).toHaveValue('0')
})

test('any angle frames the whole turned picture with black corners; the handle and the field set it', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	await degreesField(page).fill('15')
	await degreesField(page).press('Enter')
	// 320×180 turned 15°: a 355.7×256.7 frame, rounded to even pixels.
	const [tilted] = await exportFrames(
		page,
		[0.5],
		[
			{ x: 3, y: 3 },
			{ x: 178, y: 40 }
		]
	)
	if (!tilted) throw new Error('no frame')
	expect([tilted.width, tilted.height]).toEqual([356, 256])
	expect(isBlack(tilted.colors[0] ?? [255, 255, 255]), `corner ${tilted.colors[0]}`).toBe(true)
	expect(isBackground(tilted.colors[1] ?? [0, 0, 0]), `picture ${tilted.colors[1]}`).toBe(true)

	// The rotation handle: dragged a quarter of the way round, it turns ~90°
	// more, in one undoable change.
	await picturePanel(page).getByRole('button', { name: 'Rotate by dragging' }).click()
	const handle = page.getByRole('slider', { name: 'Rotation' })
	await handle.scrollIntoViewIfNeeded()
	const grip = await handle.boundingBox()
	const picture = await page.getByTestId('picture').boundingBox()
	if (!grip || !picture) throw new Error('no layout box')
	const centre = { x: picture.x + picture.width / 2, y: picture.y + picture.height / 2 }
	await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
	await page.mouse.down()
	// Released at once after the last move: the angle committed is the last
	// one, not one React had rendered before it (it committed 75° here).
	await page.mouse.move(centre.x + 150, centre.y - 40, { steps: 6 })
	await page.mouse.move(centre.x + 150, centre.y, { steps: 6 })
	await page.mouse.up()
	// The release commits the last angle (it once committed the 75° passed on
	// the way), which shows once React has rendered it.
	await expect
		.poll(async () => Math.abs(Number(await degreesField(page).inputValue()) - 90))
		.toBeLessThan(3)
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(degreesField(page)).toHaveValue('15')
	// Arrow keys on the handle: a degree each.
	await handle.focus()
	await page.keyboard.press('ArrowRight')
	await expect(degreesField(page)).toHaveValue('16')
})

test('pixelate hides what is under it in hard blocks, only in its time, unlike blur', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	await seekTo(page, 1)
	const tool = page
		.getByRole('region', { name: 'Annotations' })
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Pixelate', exact: true })
	await tool.click()
	await dragOnFrame(page, [0.02, 0.25], [0.98, 0.75])
	await tool.click()
	const lane = await page
		.getByRole('slider', { name: 'Pixelate 1 start' })
		.getAttribute('aria-valuenow')
	const start = Number(lane)

	const readRow = async (times: number[]) => {
		const downloading = page.waitForEvent('download')
		await page.getByRole('button', { name: 'Export video' }).click()
		const bytes = await readFile(await (await downloading).path())
		// A previous export's toast may still be up: the newest is this one's.
		await expect(page.getByText('Export finished', { exact: true }).last()).toBeVisible()
		return page.evaluate(
			async ({ bytes, times }) => {
				const video = Object.assign(document.createElement('video'), {
					src: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' })),
					muted: true
				})
				const next = (type: string) =>
					new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
				await next('loadedmetadata')
				if (!Number.isFinite(video.duration)) {
					video.currentTime = 1e9
					while (!Number.isFinite(video.duration)) await next('durationchange')
				}
				const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
				const context = canvas.getContext('2d', { willReadFrequently: true })
				if (!context) throw new Error('no 2d context')
				const out = []
				for (const at of times) {
					video.currentTime = at
					await next('seeked')
					context.drawImage(video, 0, 0, 320, 180)
					const row = context.getImageData(0, 90, 320, 1).data
					const light: number[] = []
					for (let i = 0; i < row.length; i += 4)
						light.push(((row[i] ?? 0) + (row[i + 1] ?? 0) + (row[i + 2] ?? 0)) / 3)
					// A pixelate's mark: a run of one blended level, about a block
					// wide, between the background (~34) and the square (~130),
					// where the square's edge falls inside a block. A sharp edge
					// has no such run; a blur's gradient changes every pixel.
					const runs: Array<{ level: number; length: number }> = []
					for (const level of light) {
						const last = runs.at(-1)
						if (last && Math.abs(level - last.level) < 3) last.length++
						else runs.push({ level, length: 1 })
					}
					const blended = runs.filter((r) => r.level > 45 && r.level < 115 && r.length >= 6).length
					out.push({ at, blended })
				}
				return out
			},
			{ bytes: [...bytes], times }
		)
	}
	const [inside, before] = await readRow([start + 0.5, Math.max(0.1, start - 0.6)])
	if (!inside || !before) throw new Error('no frames')
	expect(before.blended, 'sharp edges before: no blended blocks').toBe(0)
	expect(inside.blended, "blended blocks at the square's edges").toBeGreaterThanOrEqual(1)
})

test('typed commands rotate, flip, crop and pixelate, each confirmed first and one undo step', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await run(
		'rotate the video 15 degrees',
		{ action: 'rotate', degrees: 15 },
		"I'll turn the video 15° clockwise, to 15°."
	)
	await expect(degreesField(page)).toHaveValue('15')
	await run(
		'flip it horizontally',
		{ action: 'flip', axis: 'horizontal' },
		"I'll flip the video horizontally"
	)
	await expect(
		picturePanel(page).getByRole('button', { name: 'Flip horizontally' })
	).toHaveAttribute('aria-pressed', 'true')
	await run(
		'crop to 9:16',
		{ action: 'crop', aspect: '9:16' },
		"I'll crop the video to 9:16, centred."
	)
	await expect(
		picturePanel(page)
			.getByRole('group', { name: 'Crop shape' })
			.getByRole('button', { name: '9:16' })
	).toHaveAttribute('aria-pressed', 'true')
	await run(
		'pixelate the top-left corner from 2 to 5 seconds',
		{ action: 'pixelate', region: 'top-left', startSeconds: 0.5, endSeconds: 2 },
		"I'll pixelate the top-left corner from 0:00 to 0:02."
	)
	await expect(page.getByRole('button', { name: /^Pixelate 1, / })).toBeVisible()
	// Four commands, four undo steps.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	for (let i = 0; i < 4; i++) await undo.click()
	await expect(degreesField(page)).toHaveValue('0')
	await expect(undo).toHaveCount(0)
})
