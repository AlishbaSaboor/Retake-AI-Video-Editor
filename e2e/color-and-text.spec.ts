import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, seekTo, w, type TimedWord } from './editor-helpers'

// Color adjustments, text styling and the pencil, on real exports of a
// video made for it: 320×180, the left half mid-grey (#808080), the right
// half blue (#3060e0), 4 s with a tone, split at 2 s into two clips. The
// halves' colors show what a grade did; text and strokes are counted by
// their own color against them.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const SECONDS = 4
const GREY_HALF = { x: 60, y: 70, width: 40, height: 40 }
const BLUE_HALF = { x: 220, y: 70, width: 40, height: 40 }
/** A video color drifts a little through the encoder: this much either way per channel. */
const CODEC_TOLERANCE = 8
/** The preview and the export may differ by this much: two decoders and a screenshot. */
const MATCH_TOLERANCE = 14

async function openHalves(page: Page, words: TimedWord[] = []) {
	await mockActions(page, { words })
	await page.goto('/editor')
	const bytes = await page.evaluate(async (seconds) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		const stream = canvas.captureStream(30)
		const audio = new AudioContext()
		await audio.resume()
		const destination = audio.createMediaStreamDestination()
		const oscillator = audio.createOscillator()
		const gain = audio.createGain()
		gain.gain.value = 0.3
		oscillator.connect(gain).connect(destination)
		oscillator.start()
		for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		const stopped = new Promise((resolve) => (recorder.onstop = resolve))
		const draw = setInterval(() => {
			context.fillStyle = '#808080'
			context.fillRect(0, 0, 160, 180)
			context.fillStyle = '#3060e0'
			context.fillRect(160, 0, 160, 180)
		}, 1000 / 30)
		recorder.start(100)
		await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
		recorder.stop()
		await stopped
		clearInterval(draw)
		oscillator.stop()
		return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
	}, SECONDS)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'halves.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await seekTo(page, 2)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(page.getByRole('region', { name: 'Clips' }).getByRole('option')).toHaveCount(2)
}

type Area = { x: number; y: number; width: number; height: number }
/** What's counted in a frame: the mean color of some areas, and pixels matching some colors. */
type FrameQuery = { areas: Area[]; counts: { name: string; area: Area; color: string }[] }
type FrameResult = { means: number[][]; counts: Record<string, { pixels: number; meanX: number }> }

/**
 * Reads a 320×180 frame from `source` (drawable) in the page. `color` is a
 * matcher: r, g, b each '+' (over 170), '-' (under 100) or '?' (anything).
 */
const READ_FRAME = `(context, query) => {
	const means = query.areas.map((a) => {
		const d = context.getImageData(a.x, a.y, a.width, a.height).data
		const sum = [0, 0, 0]
		for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c]
		return sum.map((v) => Math.round(v / (d.length / 4)))
	})
	const counts = {}
	for (const { name, area, color } of query.counts) {
		const d = context.getImageData(area.x, area.y, area.width, area.height).data
		let pixels = 0
		let sumX = 0
		for (let i = 0; i < d.length; i += 4) {
			const ok = [0, 1, 2].every((c) => color[c] === '?' || (color[c] === '+' ? d[i + c] > 170 : d[i + c] < 100))
			if (ok) {
				pixels++
				sumX += area.x + ((i / 4) % area.width)
			}
		}
		counts[name] = { pixels, meanX: pixels ? sumX / pixels : -1 }
	}
	return { means, counts }
}`

/** Exports, then reads the file's frames at `times` with `query`. */
async function exportFrames(page: Page, times: number[], query: FrameQuery) {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	const frames: FrameResult[] = await page.evaluate(
		async ({ bytes, times, query, read }) => {
			const readFrame = new Function(`return ${read}`)()
			const video = Object.assign(document.createElement('video'), {
				src: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' })),
				muted: true
			})
			const next = (type: string) =>
				new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
			await next('loadeddata')
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const out = []
			for (const at of times) {
				video.currentTime = at
				await next('seeked')
				context.drawImage(video, 0, 0, 320, 180)
				out.push(readFrame(context, query))
			}
			return out
		},
		{ bytes: [...bytes], times, query, read: READ_FRAME }
	)
	console.log('EXPORT', JSON.stringify(frames))
	// Its toast goes after 5 s; until then it can cover what the test clicks next.
	await expect(page.getByText('Export finished')).toHaveCount(0, { timeout: 10_000 })
	return frames
}

/** Screenshots the preview's picture, scaled to 320×180, and reads it with `query`. */
async function previewFrame(page: Page, query: FrameQuery): Promise<FrameResult> {
	const png = await page.getByTestId('picture').screenshot()
	const frame: FrameResult = await page.evaluate(
		async ({ png, query, read }) => {
			const readFrame = new Function(`return ${read}`)()
			const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }))
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			context.drawImage(bitmap, 0, 0, 320, 180)
			return readFrame(context, query)
		},
		{ png: [...png], query, read: READ_FRAME }
	)
	console.log('PREVIEW', JSON.stringify(frame))
	return frame
}

const colorPanel = (page: Page) => page.getByRole('region', { name: 'Color' })

async function setLevel(
	page: Page,
	name: 'Brightness' | 'Contrast' | 'Saturation',
	percent: number
) {
	const slider = colorPanel(page).getByRole('slider', { name: new RegExp(`^${name}`) })
	await slider.fill(String(percent))
	await slider.blur()
	await expect(colorPanel(page)).toContainText(`${name} ${percent}%`)
}

function expectColor(
	actual: number[] | undefined,
	wanted: number[],
	within: number,
	label: string
) {
	for (const [c, value] of wanted.entries()) {
		expect(
			Math.abs((actual?.[c] ?? NaN) - value),
			`${label}: ${JSON.stringify(actual)} for ${JSON.stringify(wanted)}`
		).toBeLessThanOrEqual(within)
	}
}

const HALVES: FrameQuery = { areas: [GREY_HALF, BLUE_HALF], counts: [] }

test('colors for the whole video and one clip, the same in the preview and the export, undo and reset', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openHalves(page)
	// The whole video black and white; clip 2 also at 150% brightness.
	await colorPanel(page).getByRole('button', { name: 'Black and white' }).click()
	await colorPanel(page)
		.getByRole('group', { name: 'Apply to' })
		.getByRole('button', { name: 'Clip 2' })
		.click()
	await setLevel(page, 'Brightness', 150)

	// The preview shows each clip as the export does. (Read first: the
	// export's toast would cover the timeline the seeks click.)
	await seekTo(page, 1)
	await expect(page.locator('video')).toHaveCSS('filter', /url/)
	const previewFirst = await previewFrame(page, HALVES)
	await seekTo(page, 3)
	await expect
		.poll(async () => (await previewFrame(page, HALVES)).means[0]?.[0] ?? 0)
		.toBeGreaterThan(170)
	const previewSecond = await previewFrame(page, HALVES)
	const [first, second] = await exportFrames(page, [1, 3], HALVES)
	// Grey stays grey; blue becomes its luma (~95); clip 2 half as bright again.
	expectColor(first?.means[0], [128, 128, 128], CODEC_TOLERANCE, 'clip 1 grey')
	expectColor(first?.means[1], [95, 95, 95], CODEC_TOLERANCE, 'clip 1 blue, as grey')
	expectColor(second?.means[0], [192, 192, 192], CODEC_TOLERANCE + 2, 'clip 2 grey, brighter')
	expectColor(second?.means[1], [143, 143, 143], CODEC_TOLERANCE + 2, 'clip 2 blue, brighter')
	for (const [index, mean] of (first?.means ?? []).entries()) {
		expectColor(previewFirst.means[index], mean, MATCH_TOLERANCE, `preview clip 1, area ${index}`)
	}
	for (const [index, mean] of (second?.means ?? []).entries()) {
		expectColor(previewSecond.means[index], mean, MATCH_TOLERANCE, `preview clip 2, area ${index}`)
	}
	// The Original side has no grade.
	await page
		.getByRole('group', { name: 'Compare with the original' })
		.getByRole('button', { name: 'Original' })
		.click()
	await expect(page.locator('video')).toHaveCSS('filter', 'none')
	await page
		.getByRole('group', { name: 'Compare with the original' })
		.getByRole('button', { name: 'Edited' })
		.click()

	// One undo step each; Reset colors is one too; reset takes everything off.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(colorPanel(page)).toContainText('Brightness 100%')
	await page.getByRole('button', { name: 'Redo' }).click()
	await colorPanel(page).getByRole('button', { name: 'Reset colors' }).click()
	await expect(colorPanel(page)).toContainText('Brightness 100%')
	await colorPanel(page).getByRole('button', { name: 'Whole video' }).click()
	await expect(colorPanel(page).getByRole('button', { name: 'Black and white' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(colorPanel(page).getByRole('button', { name: 'None' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
})

test('warm and cool shift the grey either way in the export', async ({ page }) => {
	test.setTimeout(150_000)
	await openHalves(page)
	await colorPanel(page).getByRole('button', { name: 'Warm' }).click()
	await colorPanel(page)
		.getByRole('group', { name: 'Apply to' })
		.getByRole('button', { name: 'Clip 2' })
		.click()
	// Clip 2: cool on top of the video's warm.
	await colorPanel(page).getByRole('button', { name: 'Cool' }).click()
	const [warm, cool] = await exportFrames(page, [1, 3], HALVES)
	const [wr = 0, , wb = 0] = warm?.means[0] ?? []
	expect(wr - wb, `warm grey ${JSON.stringify(warm?.means[0])}`).toBeGreaterThan(30)
	const [cr = 0, , cb = 0] = cool?.means[0] ?? []
	// Warm then cool nearly cancel: within a few levels of grey either way.
	expect(Math.abs(cr - cb), `warm then cool grey ${JSON.stringify(cool?.means[0])}`).toBeLessThan(
		wr - wb
	)
})

test('title, captions and on-video text take their font, size, color and background, in the export', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openHalves(page, [w('Hello', 0.2, 0.6), w('there.', 0.6, 1.1)])
	await expect(page.getByRole('button', { name: /Hello there\./ })).toBeVisible({ timeout: 30_000 })
	const graphics = page.getByRole('region', { name: 'Graphics' })
	await graphics.getByLabel('Title text').fill('HELLO')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	const titleStyle = graphics.getByRole('group', { name: 'Title style' })
	await titleStyle.getByLabel('Font').selectOption('serif')
	await titleStyle.getByLabel('Color').fill('#ff0000')
	await titleStyle.getByLabel('Color').blur()
	await graphics
		.getByRole('group', { name: 'Title style' })
		.getByRole('button', { name: 'No background' })
		.click()
	await graphics.getByRole('button', { name: 'Captions' }).click()
	const captionStyle = graphics.getByRole('group', { name: 'Caption style' })
	await captionStyle.getByLabel('Color').fill('#ffff00')
	await captionStyle.getByLabel('Color').blur()
	const size = captionStyle.getByLabel('Size (%)')
	await size.fill('150')
	await size.press('Enter')

	// On-video text in cyan, drawn top-left from 0:00.
	const annotations = page.getByRole('region', { name: 'Annotations' })
	await annotations.getByLabel('Text to add').fill('HI')
	const newText = annotations.getByRole('group', { name: 'New text style' })
	await newText.getByLabel('Color').fill('#00ffff')
	await newText.getByLabel('Color').blur()
	await seekTo(page, 0.05)
	await annotations
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Text', exact: true })
		.click()
	const layer = page.getByTestId('annotation-layer')
	await layer.scrollIntoViewIfNeeded()
	const box = await layer.boundingBox()
	if (!box) throw new Error('no layer')
	await page.mouse.move(box.x + 0.03 * box.width, box.y + 0.05 * box.height)
	await page.mouse.down()
	await page.mouse.move(box.x + 0.35 * box.width, box.y + 0.3 * box.height, { steps: 4 })
	await page.mouse.up()
	await expect(page.locator('[data-annotation-kind="text"]')).toHaveCount(1)

	// The preview's title: red, serif, no band.
	const title = page.getByTestId('player').getByText('HELLO', { exact: true })
	await expect(title).toHaveCSS('color', 'rgb(255, 0, 0)')
	await expect(title).toHaveCSS('font-family', 'serif')
	await expect(title).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

	const query: FrameQuery = {
		areas: [{ x: 2, y: 82, width: 6, height: 16 }],
		counts: [
			{ name: 'red title', area: { x: 0, y: 70, width: 320, height: 40 }, color: '+--' },
			{ name: 'yellow captions', area: { x: 0, y: 130, width: 320, height: 50 }, color: '++-' },
			{ name: 'cyan text', area: { x: 0, y: 0, width: 130, height: 60 }, color: '-++' }
		]
	}
	const [frame] = await exportFrames(page, [0.7], query)
	expect(frame?.counts['red title']?.pixels, 'red title letters').toBeGreaterThan(80)
	// No band: the title's row at the left edge is the video's grey, not darkened.
	expectColor(frame?.means[0], [128, 128, 128], CODEC_TOLERANCE + 4, 'no band behind the title')
	expect(frame?.counts['yellow captions']?.pixels, 'yellow caption letters').toBeGreaterThan(80)
	expect(frame?.counts['cyan text']?.pixels, 'cyan on-video text').toBeGreaterThan(20)

	// The bigger captions really are bigger: back to 100%, fewer yellow pixels.
	await size.fill('100')
	await size.press('Enter')
	const [smaller] = await exportFrames(page, [0.7], query)
	expect(
		smaller?.counts['yellow captions']?.pixels ?? Infinity,
		'captions at 100% have fewer letter pixels'
	).toBeLessThan((frame?.counts['yellow captions']?.pixels ?? 0) * 0.8)
})

test('the pencil draws a stroke pinned to the picture, in the export; the eraser takes it off', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openHalves(page)
	const annotations = page.getByRole('region', { name: 'Annotations' })
	await annotations.getByLabel('Box color').fill('#00ff00')
	await annotations.getByLabel('Box color').blur()
	await seekTo(page, 0.05)
	const tool = (name: string) =>
		annotations
			.getByRole('group', { name: 'Annotation tool' })
			.getByRole('button', { name, exact: true })
	await tool('Pencil').click()
	const layer = page.getByTestId('annotation-layer')
	await layer.scrollIntoViewIfNeeded()
	const box = await layer.boundingBox()
	if (!box) throw new Error('no layer')
	const at = (x: number, y: number) => [box.x + x * box.width, box.y + y * box.height] as const
	await page.mouse.move(...at(0.1, 0.2))
	await page.mouse.down()
	await page.mouse.move(...at(0.25, 0.5), { steps: 8 })
	await page.mouse.move(...at(0.4, 0.8), { steps: 8 })
	await page.mouse.up()
	const strokes = page.locator('[data-annotation-kind="pencil"]')
	await expect(strokes).toHaveCount(1)

	const query: FrameQuery = {
		areas: [],
		counts: [{ name: 'green', area: { x: 0, y: 0, width: 320, height: 180 }, color: '-+-' }]
	}
	const [drawn] = await exportFrames(page, [1], query)
	const green = drawn?.counts.green
	expect(green?.pixels, 'green stroke pixels').toBeGreaterThan(60)
	// Drawn over x 32–128 of 320: its middle about 80.
	expect(Math.abs((green?.meanX ?? 0) - 80), `stroke centred at ${green?.meanX}`).toBeLessThan(15)
	// The preview draws it too, about there.
	const preview = await previewFrame(page, query)
	expect(preview.counts.green?.pixels, 'green in the preview').toBeGreaterThan(60)
	expect(Math.abs((preview.counts.green?.meanX ?? 0) - 80)).toBeLessThan(15)

	// Pinned to the picture: flipped, the stroke is mirrored with it.
	await page.getByRole('button', { name: 'Flip horizontally' }).click()
	const [flipped] = await exportFrames(page, [1], query)
	expect(
		Math.abs((flipped?.counts.green?.meanX ?? 0) - (320 - 80)),
		`flipped stroke centred at ${flipped?.counts.green?.meanX}`
	).toBeLessThan(15)

	// The eraser takes it off; undo puts it back.
	await page.getByRole('button', { name: 'Undo last change' }).click()
	// Undo goes back to the trim's start, before the stroke shows: back into it.
	await seekTo(page, 1)
	await tool('Eraser').click()
	await page.getByTestId('annotation-layer').scrollIntoViewIfNeeded()
	const stroke = await strokes.boundingBox()
	if (!stroke) throw new Error('no stroke box')
	await page.mouse.click(stroke.x + stroke.width / 2, stroke.y + stroke.height / 2)
	await expect(strokes).toHaveCount(0)
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await seekTo(page, 1)
	await expect(strokes).toHaveCount(1)
})

test('colors and text style work as typed commands, each confirmed and one undo step', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await openHalves(page)
	const graphics = page.getByRole('region', { name: 'Graphics' })
	await graphics.getByLabel('Title text').fill('HELLO')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await run(
		'make it black and white',
		{ action: 'color', property: 'black_and_white' },
		"I'll make the whole video black and white."
	)
	await expect(colorPanel(page).getByRole('button', { name: 'Black and white' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await run(
		'increase the brightness',
		{ action: 'color', property: 'brightness', percent: 20 },
		"I'll set the brightness of the whole video to 120%."
	)
	await expect(colorPanel(page)).toContainText('Brightness 120%')
	await run(
		'make the title red',
		{ action: 'text_style', target: 'title', color: '#ff0000' },
		"I'll change the title: color #ff0000."
	)
	await expect(page.getByTestId('player').getByText('HELLO', { exact: true })).toHaveCSS(
		'color',
		'rgb(255, 0, 0)'
	)
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(page.getByTestId('player').getByText('HELLO', { exact: true })).toHaveCSS(
		'color',
		'rgb(255, 255, 255)'
	)
	await undo.click()
	await expect(colorPanel(page)).toContainText('Brightness 100%')
	await undo.click()
	await expect(colorPanel(page).getByRole('button', { name: 'None' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
})
