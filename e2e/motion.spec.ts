import { test, expect, type Page } from '@playwright/test'
import { zoomedPoint, zoomViewAt } from '../src/app/[locale]/editor/motion'
import { editCommand, mockActions, seekTo, openTool } from './editor-helpers'
import { exportVideo, rangeOverLag, readExportFrames, surelyAfter } from './export-frames'

// Motion graphics on real exports. The video: 320×180, grey (#606060), a red
// 60×60 square in the middle, a 440 Hz tone, 6 s. The square's measured
// width shows the zoom; white pixels (the default text colour) show where
// the title, the lower third and on-video text are.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const SECONDS = 6
const SQUARE = 60

async function openSquare(page: Page) {
	await mockActions(page, { words: [] })
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
			context.fillStyle = '#606060'
			context.fillRect(0, 0, 320, 180)
			context.fillStyle = '#ff0000'
			context.fillRect(130, 60, 60, 60)
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
		.setInputFiles({ name: 'square.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
}

type Text = { pixels: number; meanX: number; span: number }

type Frame = {
	at: number
	shown: number
	/** The red square's width and centre along the frame's middle row; 0 when it isn't there. */
	squareWidth: number
	squareCentre: number
	/**
	 * White pixels and their mean x, in the title band, the lower-third area and the top-left
	 * quarter; and how wide the light (faded included) pixels there spread.
	 */
	title: Text
	lower: Text
	topLeft: Text
}

/** Exports and reads, at each time, the square's width and where the white text is. */
async function exportFrames(page: Page, times: number[]) {
	const bytes = await exportVideo(page)
	const read = readExportFrames(page, bytes, times, ({ context, width, height }) => {
		const white = (x0: number, y0: number, w: number, h: number) => {
			const d = context.getImageData(x0, y0, w, h).data
			let pixels = 0
			let sumX = 0
			let left = w
			let right = -1
			for (let i = 0; i < d.length; i += 4) {
				const x = (i / 4) % w
				const r = d[i] ?? 0
				const g = d[i + 1] ?? 0
				const b = d[i + 2] ?? 0
				if (r > 200 && g > 200 && b > 200) {
					pixels++
					sumX += x0 + x
				}
				// The grey picture is 96: anything clearly lighter is (faded) text.
				if (r > 125 && g > 125 && b > 125) {
					left = Math.min(left, x)
					right = Math.max(right, x)
				}
			}
			return {
				pixels,
				meanX: pixels ? Math.round(sumX / pixels) : -1,
				span: right < 0 ? 0 : right - left + 1
			}
		}
		const row = context.getImageData(0, Math.round(height / 2), width, 1).data
		let first = -1
		let last = -1
		for (let x = 0; x < width; x++) {
			const r = row[x * 4] ?? 0
			const g = row[x * 4 + 1] ?? 0
			if (r > 180 && g < 90) {
				if (first < 0) first = x
				last = x
			}
		}
		return {
			squareWidth: first < 0 ? 0 : last - first + 1,
			squareCentre: first < 0 ? -1 : (first + last) / 2,
			title: white(0, Math.round(height * 0.4), width, Math.round(height * 0.2)),
			lower: white(0, Math.round(height * 0.45), width, Math.round(height * 0.3)),
			topLeft: white(0, 0, Math.round(width / 2), Math.round(height / 2))
		}
	})
	const { seconds, videoWidth: width, videoHeight: height, frames } = await read
	const result: { seconds: number; width: number; height: number; frames: Frame[] } = {
		seconds,
		width,
		height,
		frames
	}
	console.log('EXPORT', JSON.stringify(result))
	await expect(page.getByText('Export finished')).toHaveCount(0, { timeout: 10_000 })
	return result
}

/** The zoom a frame shows: its square's width against the square's own. */
const zoomOf = (frame: Frame | undefined, scale = 1) => (frame?.squareWidth ?? 0) / (SQUARE * scale)

/** What a push-in from 1 to `amount` between `start` and `end` is at `t` (motion.ts's easing). */
function expectedZoom(t: number, start: number, end: number, amount: number) {
	if (t < start || t >= end) return 1
	const p = (t - start) / (end - start)
	return 1 + (amount - 1) * p * p * (3 - 2 * p)
}

/** How far short of its place a slide in from `start`, `seconds` long, is at `t` (motion.ts's ease-out). */
function slideOffset(t: number, start: number, seconds: number, width: number) {
	const p = Math.min(1, Math.max(0, (t - start) / seconds))
	return width * (1 - p) ** 3
}

async function setZoom(page: Page, from: number, to: number, percent: number) {
	await openTool(page, 'Zoom')
	const panel = page.getByRole('region', { name: 'Zoom', exact: true })
	await openTool(page, 'Zoom')
	await panel.getByLabel('From (s)').fill(String(from))
	await openTool(page, 'Zoom')
	await panel.getByLabel('To (s)').fill(String(to))
	await openTool(page, 'Zoom')
	await panel.getByLabel('Zoom (%)').fill(String(percent))
	await openTool(page, 'Zoom')
	await panel.getByRole('button', { name: 'Add zoom' }).click()
	await openTool(page, 'Zoom')
	await expect(panel.getByRole('button', { name: 'Update zoom' })).toBeVisible()
}

test('a push-in magnifies the picture about its centre between its times, in the preview and the export', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openSquare(page)
	await setZoom(page, 2, 4, 200)
	// The preview: scaled at 3 s (half way), not at 1 s.
	await seekTo(page, 3)
	const previewScale = await page
		.getByTestId('zoom')
		.evaluate((element: HTMLElement) => element.style.transform)
	expect(previewScale).toMatch(/^scale\(1\.[45]/)
	await seekTo(page, 1)
	await expect(page.getByTestId('zoom')).toHaveAttribute('style', /^$|^(?!.*scale)/)

	const result = await exportFrames(page, [1, 3, 3.8, 5])
	for (const frame of result.frames) {
		const { min, max } = rangeOverLag(frame.shown, (t) => expectedZoom(t, 2, 4, 2))
		const got = zoomOf(frame)
		const message = `zoom at ${frame.at} s (frame of ${frame.shown}): ${got} for ${min.toFixed(2)}–${max.toFixed(2)}`
		expect(got, message).toBeGreaterThan(min - 0.05)
		expect(got, message).toBeLessThan(max + 0.05)
		expect(Math.abs(frame.squareCentre - 160), `centred at ${frame.squareCentre}`).toBeLessThan(4)
	}
})

test('a zoom works on the cropped picture and on the edited timeline, past a sped-up clip', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openSquare(page)
	// Crop to 1:1 (180×180 frame), and the second half (3–6 s) at 2×: 3 + 1.5 s.
	await openTool(page, 'Picture')
	await page.getByRole('region', { name: 'Picture' }).getByRole('button', { name: '1:1' }).click()
	await seekTo(page, 3)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await openTool(page, 'Clip sound and speed')
	const speed = page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: 'Clip 2' })
		.getByLabel('Speed (×)')
	await speed.fill('2')
	await speed.press('Enter')
	// In edited time: 3.1–3.9 s is inside the sped clip.
	await setZoom(page, 3.1, 3.9, 150)
	const result = await exportFrames(page, [1, 3.5, 4.3])
	expect(result.width, 'the 1:1 crop').toBe(result.height)
	expect(Math.abs(result.seconds - 4.5), `length ${result.seconds}`).toBeLessThan(0.25)
	// A frame may show the zoom of any time over its lag window (export-frames.ts),
	// within 0.05 (a pixel of the square is 0.017).
	for (const frame of result.frames) {
		const { min, max } = rangeOverLag(frame.shown, (t) => expectedZoom(t, 3.1, 3.9, 1.5))
		const got = zoomOf(frame)
		const message = `zoom at ${frame.at} s (frame of ${frame.shown}): ${got} for ${min.toFixed(2)}–${max.toFixed(2)}`
		expect(got, message).toBeGreaterThan(min - 0.05)
		expect(got, message).toBeLessThan(max + 0.05)
		expect(
			Math.abs(frame.squareCentre - result.width / 2),
			`centred at ${frame.squareCentre}`
		).toBeLessThan(4)
	}
})

test('the title slides in and fades out; a lower third slides in at its time; text pops in', async ({
	page
}) => {
	test.setTimeout(240_000)
	await openSquare(page)
	await openTool(page, 'Graphics')
	const graphics = page.getByRole('region', { name: 'Graphics' })
	// The title, 0–3 s: in from the left over 1 s, out with a 1 s fade.
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Title text').fill('HELLO')
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	await openTool(page, 'Graphics')
	const titleMotion = graphics.getByRole('group', { name: 'Title motion' })
	await titleMotion.getByLabel('Comes in').selectOption('slide')
	await titleMotion.getByLabel('From').selectOption('left')
	const inSeconds = titleMotion.getByLabel('In (s)')
	await inSeconds.fill('1')
	await inSeconds.press('Enter')
	await titleMotion.getByLabel('Goes out').selectOption('fade')
	const outSeconds = titleMotion.getByLabel('Out (s)')
	await outSeconds.fill('1')
	await outSeconds.press('Enter')
	// The lower third, 3.5–5.5 s; no title band then.
	await openTool(page, 'Graphics')
	const lower = graphics.getByRole('group', { name: 'Lower third' })
	await lower.getByLabel('Lower third name').fill('JANE')
	await lower.getByLabel('Subtitle').fill('CEO')
	await lower.getByLabel('Lower third start (s)').fill('3.5')
	await lower.getByLabel('Lower third length (s)').fill('2')
	await lower.getByRole('button', { name: 'Add lower third' }).click()
	await expect(lower.getByRole('button', { name: 'Update lower third' })).toBeVisible()

	// Text on the video at 3.3 s for 3 s, in the top-left quarter, popping in (capped at half its
	// time on screen: 1.5 s).
	await openTool(page, 'Annotations')
	const annotations = page.getByRole('region', { name: 'Annotations' })
	await openTool(page, 'Annotations')
	await annotations.getByLabel('Text to add').fill('POP')
	await seekTo(page, 3.3)
	await annotations
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Text', exact: true })
		.click()
	const layer = page.getByTestId('annotation-layer')
	await layer.scrollIntoViewIfNeeded()
	const box = await layer.boundingBox()
	if (!box) throw new Error('annotation layer has no layout box')
	await page.mouse.move(box.x + 0.05 * box.width, box.y + 0.05 * box.height)
	await page.mouse.down()
	await page.mouse.move(box.x + 0.25 * box.width, box.y + 0.2 * box.height)
	await page.mouse.move(box.x + 0.45 * box.width, box.y + 0.35 * box.height)
	await page.mouse.up()
	// Picked with Select, its motion is set.
	await annotations
		.getByRole('group', { name: 'Annotation tool' })
		.getByRole('button', { name: 'Select', exact: true })
		.click()
	await page.locator('[data-annotation-kind="text"]').click()
	await openTool(page, 'Annotations')
	const textMotion = annotations.getByRole('group', { name: 'Selected text motion' })
	await textMotion.getByLabel('Comes in').selectOption('pop')
	const popSeconds = textMotion.getByLabel('In (s)')
	await popSeconds.fill('3')
	await popSeconds.press('Enter')
	await openTool(page, 'Annotations')
	await expect(
		annotations.getByRole('group', { name: 'Selected text motion' }).getByLabel('Comes in')
	).toHaveValue('pop')

	// The preview: the title slid left at 0.2 s.
	await seekTo(page, 0.2)
	const titleTransform = await page
		.getByTestId('player')
		.getByText('HELLO', { exact: true })
		.evaluate((element: HTMLElement) => element.style.transform)
	expect(titleTransform).toMatch(/^translate\(-[1-9]/)

	// Several frames through each slide and around each end: a starved export
	// drops frames and shows older pictures than its timestamps
	// (export-frames.ts), so each check uses the time of the frame it got.
	// Asked for every 50–100 ms: under load several asks land on one frame.
	const every = (from: number, to: number, step: number) =>
		Array.from(
			{ length: Math.round((to - from) / step) + 1 },
			(_, i) => +(from + i * step).toFixed(2)
		)
	const pops = every(3.5, 4.3, 0.1)
	const slides = every(0.3, 0.9, 0.05)
	const lowerSlides = every(3.6, 4.3, 0.05)
	const result = await exportFrames(page, [
		1.5,
		2.8,
		3.29,
		4.5,
		5.9,
		...pops,
		...slides,
		...lowerSlides
	])
	const [still, fading, gone, lowerStill, lowerGone, ...rest] = result.frames
	const popFrames = rest.slice(0, pops.length)
	const slidingFrames = rest.slice(pops.length, pops.length + slides.length)
	const lowerFrames = rest.slice(pops.length + slides.length)
	// Sliding in over its first second: left of its place by the eased offset
	// at some moment over the frame's lag window, within 8 px.
	const titleChecked = slidingFrames.filter(
		(frame) => surelyAfter(frame.shown, 0) && frame.shown < 0.9
	)
	expect(
		titleChecked.length,
		`a frame mid-slide: ${JSON.stringify(slidingFrames.map((f) => f.shown))}`
	).toBeGreaterThan(0)
	for (const frame of titleChecked) {
		const { min, max } = rangeOverLag(frame.shown, (t) => slideOffset(t, 0, 1, result.width))
		const short = (still?.title.meanX ?? 0) - frame.title.meanX
		expect(
			short,
			`title at ${frame.shown} s ${short} px short of its place, for ${Math.round(min)}–${Math.round(max)}`
		).toBeGreaterThan(min - 8)
		expect(short).toBeLessThan(max + 8)
	}
	expect(
		Math.abs((still?.title.meanX ?? 0) - 160),
		`title centred at ${still?.title.meanX}`
	).toBeLessThan(15)
	expect(still?.title.pixels ?? 0, 'the title there').toBeGreaterThan(100)
	// Fading out over 2–3 s: well into it (from 2.3 s), fewer full-white pixels.
	if (fading && surelyAfter(fading.shown, 2.3)) {
		expect(
			fading.title.pixels,
			`fading at ${fading.shown} s: fewer full-white pixels`
		).toBeLessThan((still?.title.pixels ?? 0) * 0.8)
	}
	// Gone after 3 s, and no lower third before 3.5 s: judged when even the
	// oldest picture that frame could hold is past 3 s.
	if (gone && surelyAfter(gone.shown, 3)) {
		expect(gone.title.pixels, `title gone at ${gone.shown} s`).toBe(0)
	}
	expect(gone?.lower.pixels, 'no lower third before 3.5 s').toBe(0)
	// The lower third, 3.5 s, slides in over 0.5 s. The band starts 16 px in, so
	// up to ~24 px short its text is still whole; further, part is off the left
	// edge and its mean x only shows it well left of its place.
	let lowerChecked = 0
	for (const frame of lowerFrames) {
		const { min, max } = rangeOverLag(frame.shown, (t) => slideOffset(t, 3.5, 0.5, result.width))
		const short = (lowerStill?.lower.meanX ?? 0) - frame.lower.meanX
		const label = `lower third at ${frame.shown} s ${short} px short, for ${Math.round(min)}–${Math.round(max)}`
		if (max < 24) {
			expect(short, label).toBeGreaterThan(min - 5)
			expect(short, label).toBeLessThan(max + 5)
			lowerChecked++
		} else if (min >= 24) {
			expect(short, label).toBeGreaterThan(15)
			lowerChecked++
		}
	}
	expect(
		lowerChecked,
		`a lower-third frame to judge: ${JSON.stringify(lowerFrames.map((f) => f.shown))}`
	).toBeGreaterThan(0)
	expect(lowerStill?.lower.pixels ?? 0, 'the lower third there').toBeGreaterThan(80)
	// At the lower left: its text left of the middle.
	expect(lowerStill?.lower.meanX ?? 999, `lower third at ${lowerStill?.lower.meanX}`).toBeLessThan(
		110
	)
	if (lowerGone && surelyAfter(lowerGone.shown, 5.5)) {
		expect(lowerGone.lower.pixels, `gone at ${lowerGone.shown} s, after 5.5 s`).toBe(0)
	}
	// The text: not there before 3.3 s; early in its pop, on screen but faint and narrower than
	// it ends up; near the end, whole. Several frames, so where the export's frames land doesn't
	// matter.
	expect(gone?.topLeft.span, 'no text before 3.3 s').toBe(0)
	const whole = lowerGone?.topLeft ?? { pixels: 0, span: 0 }
	expect(whole.pixels, 'the text there').toBeGreaterThan(40)
	const popping = popFrames.filter(
		(frame) =>
			frame.topLeft.span > whole.span * 0.5 &&
			frame.topLeft.span < whole.span * 0.92 &&
			frame.topLeft.pixels < whole.pixels * 0.5
	)
	expect(
		popping.length,
		`a frame popping in: ${JSON.stringify(popFrames.map((f) => [f.shown, f.topLeft.span, f.topLeft.pixels]))} for ${whole.span} px, ${whole.pixels} white`
	).toBeGreaterThan(0)
})

test('motion as typed commands, confirmed first; undo; saved with the project', async ({
	page
}) => {
	test.setTimeout(180_000)
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await openSquare(page)
	await openTool(page, 'Graphics')
	const graphics = page.getByRole('region', { name: 'Graphics' })
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Title text').fill('HELLO')
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await openTool(page, 'Assistant')
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await run(
		'add a lower third saying Jane, CEO from 1 to 4 seconds',
		{ action: 'lower_third', text: 'Jane, CEO', startSeconds: 1, endSeconds: 4 },
		"I'll show a lower third saying “Jane, CEO” from 0:01 to 0:04, sliding in and out."
	)
	await openTool(page, 'Graphics')
	await expect(graphics.getByLabel('Lower third name')).toHaveValue('Jane')
	await run(
		'slide the title in from the left',
		{ action: 'animate_in', target: 'title', effect: 'slide', region: 'left' },
		"I'll make the title come in with a slide from the left over 0.5 s."
	)
	await openTool(page, 'Graphics')
	await expect(
		graphics.getByRole('group', { name: 'Title motion' }).getByLabel('Comes in')
	).toHaveValue('slide')
	await run(
		'zoom in slowly from 2 to 5 seconds',
		{ action: 'zoom_in', startSeconds: 2, endSeconds: 5 },
		"I'll push in to 130% from 0:02 to 0:05, on the whole picture."
	)
	await openTool(page, 'Zoom')
	const zoomPanel = page.getByRole('region', { name: 'Zoom', exact: true })
	await openTool(page, 'Zoom')
	await expect(zoomPanel.getByLabel('From (s)')).toHaveValue('2')

	// Saved with the project: back after a reload.
	await openTool(page, 'Project')
	const project = page.getByRole('region', { name: 'Project', exact: true })
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await openTool(page, 'Project')
	await expect(project.getByRole('status')).toContainText('Saved at')
	await page.reload()
	await page
		.getByRole('list', { name: 'My projects' })
		.getByRole('listitem', { name: 'square' })
		.getByRole('button', { name: 'Open' })
		.click()
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await openTool(page, 'Graphics')
	await expect(
		page.getByRole('region', { name: 'Graphics' }).getByLabel('Lower third name')
	).toHaveValue('Jane')
	await openTool(page, 'Zoom')
	await expect(
		page.getByRole('region', { name: 'Zoom', exact: true }).getByLabel('To (s)')
	).toHaveValue('5')
	await openTool(page, 'Graphics')
	await expect(
		page
			.getByRole('region', { name: 'Graphics' })
			.getByRole('group', { name: 'Title motion' })
			.getByLabel('Comes in')
	).toHaveValue('slide')

	// Undo steps back through them (a reopened project starts its history afresh: one change).
	await openTool(page, 'Zoom')
	await page
		.getByRole('region', { name: 'Zoom', exact: true })
		.getByRole('button', { name: 'Remove zoom' })
		.click()
	await openTool(page, 'Zoom')
	await expect(
		page
			.getByRole('region', { name: 'Zoom', exact: true })
			.getByRole('button', { name: 'Add zoom' })
	).toBeVisible()
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await openTool(page, 'Zoom')
	await expect(
		page
			.getByRole('region', { name: 'Zoom', exact: true })
			.getByRole('button', { name: 'Update zoom' })
	).toBeVisible()
})

test('a zoom aimed on the video goes to that area, closer for a smaller one, in the preview and the export', async ({
	page
}) => {
	test.setTimeout(180_000)
	await openSquare(page)
	await setZoom(page, 2, 4, 200)
	await openTool(page, 'Zoom')
	const panel = page.getByRole('region', { name: 'Zoom', exact: true })
	await openTool(page, 'Zoom')
	await panel.getByRole('button', { name: 'Set area on video' }).click()
	// The whole picture shows, with the zoom's area on it: half the frame, centred.
	const area = page.getByRole('img', { name: /^Zoom area/ })
	await expect(area).toHaveAccessibleName('Zoom area, 200%')
	const frame = await page.getByTestId('output-frame').boundingBox()
	const before = await area.boundingBox()
	if (!frame || !before) throw new Error('no layout box')
	expect(before.width / frame.width).toBeCloseTo(0.5, 2)

	// Dragged a fifth of the frame right and a tenth up: aimed there.
	const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
	await page.mouse.move(middle.x, middle.y)
	await page.mouse.down()
	await page.mouse.move(middle.x + frame.width * 0.1, middle.y - frame.height * 0.05)
	await page.mouse.move(middle.x + frame.width * 0.2, middle.y - frame.height * 0.1)
	await page.mouse.up()
	const moved = await area.boundingBox()
	if (!moved) throw new Error('no layout box')
	expect((moved.x + moved.width / 2 - frame.x) / frame.width).toBeCloseTo(0.7, 2)
	expect((moved.y + moved.height / 2 - frame.y) / frame.height).toBeCloseTo(0.4, 2)

	// Its corner dragged in to a 0.4-wide area: 250%, the same top-left.
	const corner = area.locator('[data-zoom-resize]')
	const grip = await corner.boundingBox()
	if (!grip) throw new Error('no layout box')
	await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
	await page.mouse.down()
	await page.mouse.move(moved.x + frame.width * 0.45, moved.y + frame.height * 0.45)
	await page.mouse.move(moved.x + frame.width * 0.4, moved.y + frame.height * 0.4)
	await page.mouse.up()
	await openTool(page, 'Zoom')
	await expect(panel.getByLabel('Zoom (%)')).toHaveValue('250')
	await expect(area).toHaveAccessibleName('Zoom area, 250%')
	const sized = await area.boundingBox()
	if (!sized) throw new Error('no layout box')
	const focus = {
		x: (sized.x + sized.width / 2 - frame.x) / frame.width,
		y: (sized.y + sized.height / 2 - frame.y) / frame.height
	}
	// From the top-left it kept (0.7 − 0.25 = 0.45), 0.4 wide: centred at 0.65.
	expect(focus.x).toBeCloseTo(0.65, 2)
	await openTool(page, 'Zoom')
	await panel.getByRole('button', { name: 'Set area on video' }).click()
	await expect(area).toHaveCount(0)

	// The preview at 3 s: the square (frame centre) moved left of the middle, magnified.
	await seekTo(page, 3)
	const zoom = { startSeconds: 2, endSeconds: 4, direction: 'in' as const, amount: 2.5, focus }
	const shownAt3 = zoomedPoint(zoomViewAt(zoom, 3), { x: 0.5, y: 0.5 })
	expect(shownAt3.x).toBeLessThan(0.45)

	// The export: at each frame, the square's centre where that zoom puts it,
	// allowing the frame's picture to be up to 0.25 s older than its time (as
	// the sped-clip zoom test measured).
	const result = await exportFrames(page, [1, 3, 3.8, 5])
	for (const frameRead of result.frames) {
		const { min, max } = rangeOverLag(
			frameRead.shown,
			(t) => zoomedPoint(zoomViewAt(zoom, t), { x: 0.5, y: 0.5 }).x * result.width
		)
		const message = `square at ${frameRead.squareCentre} for ${min.toFixed(1)}–${max.toFixed(1)} (frame of ${frameRead.shown})`
		expect(frameRead.squareCentre, message).toBeGreaterThan(min - 4)
		expect(frameRead.squareCentre, message).toBeLessThan(max + 4)
	}
})
