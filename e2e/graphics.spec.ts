import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import type { EditCommand } from '../src/app/[locale]/editor/edit-command'
import {
	editCommand,
	mockActions,
	openEditorWithVideo,
	seekTo,
	w,
	openTool
} from './editor-helpers'

// The test video is 320×180: a dark background with an orange square
// crossing y 60–120. The title's band is drawn across the middle (y ~76–104)
// in white text; the logo is a solid green 2:1 PNG, 48×24 px at this size,
// whose corners (y < 34 and y > 146) the square never reaches.
const BAND_ROWS = { from: 80, to: 100 }
// Captions sit at the bottom, below the square (one line: y ~155–168).
const CAPTION_ROWS = { from: 145, to: 175 }
const CORNER_CENTRES = { 'top-left': [34, 22], 'bottom-right': [286, 158] } as const

const NONE = editCommand({ action: 'unsupported' })

/** A solid green PNG, 64×32, made in the page. */
async function greenLogo(page: Page): Promise<Buffer> {
	const dataUrl = await page.evaluate(() => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 32 })
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d context')
		context.fillStyle = '#00ff00'
		context.fillRect(0, 0, 64, 32)
		return canvas.toDataURL('image/png')
	})
	return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
}

/** Clicks `trigger`, which should open the logo picker, and picks `logo`. */
async function chooseLogo(page: Page, trigger: () => Promise<void>, logo: Buffer) {
	const choosing = page.waitForEvent('filechooser')
	await trigger()
	await (await choosing).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo })
}

type Frame = {
	at: number
	white: number
	captionWhite: number
	topLeftGreen: boolean
	bottomRightGreen: boolean
}

/**
 * Exports the edit, then reads frames of the file at `times`: how many
 * white (title text) pixels cross the middle band and the caption rows,
 * and whether each corner shows the green logo.
 */
async function exportFrames(page: Page, times: number[]) {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	return page.evaluate(
		async ({ bytes, times, band, captionRows, corners }) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const video = Object.assign(document.createElement('video'), {
				src: URL.createObjectURL(blob),
				muted: true
			})
			const next = (type: string) =>
				new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
			await next('loadedmetadata')
			// A recorded WebM has no duration header; seeking past the end finds it.
			if (!Number.isFinite(video.duration)) {
				video.currentTime = 1e9
				while (!Number.isFinite(video.duration)) await next('durationchange')
			}
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const isGreen = ([x, y]: readonly [number, number]) => {
				const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data
				return g > 180 && r < 100 && b < 100
			}
			const whiteIn = (rows: { from: number; to: number }) => {
				const data = context.getImageData(0, rows.from, 320, rows.to - rows.from).data
				let white = 0
				for (let i = 0; i < data.length; i += 4) {
					if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 0) > 200 && (data[i + 2] ?? 0) > 200) white++
				}
				return white
			}
			const frames: Frame[] = []
			for (const at of times) {
				video.currentTime = at
				await next('seeked')
				context.drawImage(video, 0, 0, 320, 180)
				frames.push({
					at,
					white: whiteIn(band),
					captionWhite: whiteIn(captionRows),
					topLeftGreen: isGreen(corners['top-left']),
					bottomRightGreen: isGreen(corners['bottom-right'])
				})
			}
			return { seconds: video.duration, frames }
		},
		{
			bytes: [...bytes],
			times,
			band: BAND_ROWS,
			captionRows: CAPTION_ROWS,
			corners: CORNER_CENTRES
		}
	)
}

const player = (page: Page) => page.getByTestId('player')
const titleOver = (page: Page, text: string) => player(page).getByText(text, { exact: true })
const watermarkOver = (page: Page) => player(page).getByRole('img', { name: 'Watermark' })

/** Which half of the player the watermark preview is in. */
async function watermarkCorner(page: Page) {
	const logo = await watermarkOver(page).boundingBox()
	const frame = await page.locator('video').boundingBox()
	if (!logo || !frame) throw new Error('no layout box')
	const vertical = logo.y + logo.height / 2 < frame.y + frame.height / 2 ? 'top' : 'bottom'
	const horizontal = logo.x + logo.width / 2 < frame.x + frame.width / 2 ? 'left' : 'right'
	return `${vertical}-${horizontal}`
}

test('a title and a watermark set by hand show in the preview and the export, at the edited times, and undo, redo and reset', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	const duration = await openEditorWithVideo(page)
	const logo = await greenLogo(page)
	await openTool(page, 'Graphics')
	const graphics = page.getByRole('region', { name: 'Graphics' })
	const undo = page.getByRole('button', { name: 'Undo last change' })
	const redo = page.getByRole('button', { name: 'Redo' })

	// Trim the first second away: the edited video starts at source 1 s.
	await page.getByRole('slider', { name: 'Trim start' }).press('Shift+ArrowRight')
	// A title for the edited video's first second; the logo bottom-right.
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Title text').fill('Hello')
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Starts at (s)').fill('0')
	await openTool(page, 'Graphics')
	await graphics.getByLabel('Duration (s)').fill('1')
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Add title' }).click()
	await openTool(page, 'Graphics')
	await chooseLogo(
		page,
		() => graphics.getByRole('button', { name: 'Add logo (PNG or JPG)' }).click(),
		logo
	)

	// The preview: the title only in the edited video's first second (source 1–2 s).
	await seekTo(page, 1.5)
	await expect(titleOver(page, 'Hello')).toBeVisible()
	await expect(watermarkOver(page)).toBeVisible()
	expect(await watermarkCorner(page)).toBe('bottom-right')
	await seekTo(page, 2.5)
	await expect(titleOver(page, 'Hello')).toHaveCount(0)
	await expect(watermarkOver(page)).toBeVisible()
	// The original view shows neither.
	await page.getByRole('button', { name: 'Original', exact: true }).click()
	await expect(watermarkOver(page)).toHaveCount(0)
	await seekTo(page, 1.5)
	await expect(titleOver(page, 'Hello')).toHaveCount(0)
	await page.getByRole('button', { name: 'Edited', exact: true }).click()
	await expect(titleOver(page, 'Hello')).toBeVisible()

	// The export: the title in its first second only, the logo bottom-right throughout.
	const first = await exportFrames(page, [0.5, 1.5])
	expect(Math.abs(first.seconds - (duration - 1))).toBeLessThan(0.25)
	const [titled, after] = first.frames
	expect(titled?.white, 'title text at 0.5 s').toBeGreaterThan(15)
	expect(after?.white, 'no title at 1.5 s').toBe(0)
	for (const frame of first.frames) {
		expect(frame.bottomRightGreen, `logo bottom-right at ${frame.at} s`).toBe(true)
		expect(frame.topLeftGreen, `nothing top-left at ${frame.at} s`).toBe(false)
	}

	// Move the logo top-left and remove the title: one step each.
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Top left' }).click()
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Remove title' }).click()
	await seekTo(page, 1.5)
	await expect(titleOver(page, 'Hello')).toHaveCount(0)
	expect(await watermarkCorner(page)).toBe('top-left')
	await undo.click()
	await expect(titleOver(page, 'Hello')).toBeVisible()
	expect(await watermarkCorner(page)).toBe('top-left')
	await undo.click()
	expect(await watermarkCorner(page)).toBe('bottom-right')
	await redo.click()
	await redo.click()
	await seekTo(page, 1.5)
	await expect(titleOver(page, 'Hello')).toHaveCount(0)
	expect(await watermarkCorner(page)).toBe('top-left')

	const second = await exportFrames(page, [0.5, 1.5])
	for (const frame of second.frames) {
		expect(frame.white, `no title at ${frame.at} s`).toBe(0)
		expect(frame.topLeftGreen, `logo top-left at ${frame.at} s`).toBe(true)
		expect(frame.bottomRightGreen, `nothing bottom-right at ${frame.at} s`).toBe(false)
	}

	// Reset removes the graphics with everything else; one Undo brings them back.
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(watermarkOver(page)).toHaveCount(0)
	await undo.click()
	await expect(watermarkOver(page)).toBeVisible()

	// Only a PNG or a JPG becomes a watermark.
	const choosing = page.waitForEvent('filechooser')
	await openTool(page, 'Graphics')
	await graphics.getByRole('button', { name: 'Replace logo' }).click()
	await (
		await choosing
	).setFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('not a png') })
	await expect(page.getByText("That isn't a PNG or JPG", { exact: true })).toBeVisible()
	expect(await watermarkCorner(page)).toBe('top-left')
})

test('typed commands add a title and a watermark after confirming, and the export shows them', async ({
	page
}) => {
	test.setTimeout(120_000)
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const run = async (canned: EditCommand, text: string) => {
		await mockActions(page, { words: [], command: canned })
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
	}
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await mockActions(page, { words: [] })
	await openEditorWithVideo(page)
	const logo = await greenLogo(page)

	// A title: shown as a plan first; Cancel changes nothing.
	const title: EditCommand = {
		...NONE,
		action: 'title',
		text: 'Welcome',
		startSeconds: 0,
		endSeconds: 1
	}
	await run(title, 'add the title Welcome for the first second')
	await expect(reply).toContainText(
		"I'll show the title “Welcome” from 0:00 to 0:01 of the edited video."
	)
	await reply.getByRole('button', { name: 'Cancel' }).click()
	await seekTo(page, 0.5)
	await expect(titleOver(page, 'Welcome')).toHaveCount(0)
	await run(title, 'add the title Welcome for the first second')
	await reply.getByRole('button', { name: 'Apply' }).click()
	await seekTo(page, 0.5)
	await expect(titleOver(page, 'Welcome')).toBeVisible()

	// A watermark with no logo yet: Apply asks for the PNG.
	await run({ ...NONE, action: 'watermark', corner: 'top-left' }, 'put my logo top left')
	await expect(reply).toContainText("I'll put your logo in the top-left corner")
	await chooseLogo(page, () => reply.getByRole('button', { name: 'Apply' }).click(), logo)
	await expect(watermarkOver(page)).toBeVisible()
	expect(await watermarkCorner(page)).toBe('top-left')
	// With one there, the command moves it: no picker, one undoable step.
	await run({ ...NONE, action: 'watermark', corner: 'bottom-right' }, 'move the logo bottom right')
	await expect(reply).toContainText("I'll move the watermark to the bottom-right corner.")
	await reply.getByRole('button', { name: 'Apply' }).click()
	expect(await watermarkCorner(page)).toBe('bottom-right')
	await page.getByRole('button', { name: 'Undo last change' }).click()
	expect(await watermarkCorner(page)).toBe('top-left')
	await page.getByRole('button', { name: 'Redo' }).click()
	expect(await watermarkCorner(page)).toBe('bottom-right')

	const exported = await exportFrames(page, [0.5, 2])
	const [titled, after] = exported.frames
	expect(titled?.white, 'title text at 0.5 s').toBeGreaterThan(15)
	expect(after?.white, 'no title at 2 s').toBe(0)
	for (const frame of exported.frames) {
		expect(frame.bottomRightGreen, `logo bottom-right at ${frame.at} s`).toBe(true)
		expect(frame.topLeftGreen, `nothing top-left at ${frame.at} s`).toBe(false)
	}
})

test('captions follow the edited video in the preview and the export, and switch off, undo and reset', async ({
	page
}) => {
	test.setTimeout(150_000)
	// Two sentences of tone, 0.2–1.1 s and 2.3–3.1 s, with silence between.
	await mockActions(page, {
		words: [
			w('Hello', 0.2, 0.6),
			w('there.', 0.6, 1.1),
			w('Second', 2.3, 2.7),
			w('line.', 2.7, 3.1)
		]
	})
	await openEditorWithVideo(page, [
		[1.2, true],
		[1, false],
		[1.2, true],
		[0.6, false]
	])
	await openTool(page, 'Transcript')
	await expect(page.getByRole('button', { name: /Hello there\./ })).toBeVisible({ timeout: 30_000 })
	await openTool(page, 'Graphics')
	const toggle = page
		.getByRole('region', { name: 'Graphics' })
		.getByRole('button', { name: 'Captions' })
	const caption = (text: string) => titleOver(page, text)
	const expectCaptions = (frames: Frame[], shown: boolean[]) => {
		for (const [index, frame] of frames.entries()) {
			const label = `caption at ${frame.at} s: ${frame.captionWhite} white px`
			if (shown[index]) expect(frame.captionWhite, label).toBeGreaterThan(15)
			else expect(frame.captionWhite, label).toBe(0)
		}
	}

	// Off by default: nothing in the preview or the export.
	await seekTo(page, 0.7)
	await expect(caption('Hello there.')).toHaveCount(0)
	await expect(toggle).toHaveAttribute('aria-pressed', 'false')
	await toggle.click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'true')

	// On: each sentence while it's spoken, nothing in the pause between.
	await seekTo(page, 0.7)
	await expect(caption('Hello there.')).toBeVisible()
	await seekTo(page, 1.7)
	await expect(caption('Hello there.')).toHaveCount(0)
	await expect(caption('Second line.')).toHaveCount(0)
	await seekTo(page, 2.7)
	await expect(caption('Second line.')).toBeVisible()
	// Not over the original.
	await page.getByRole('button', { name: 'Original', exact: true }).click()
	await expect(caption('Second line.')).toHaveCount(0)
	await page.getByRole('button', { name: 'Edited', exact: true }).click()
	await expect(caption('Second line.')).toBeVisible()
	expectCaptions((await exportFrames(page, [0.7, 1.7, 2.7])).frames, [true, false, true])

	// Trim the first second away: its words go, the second sentence moves up 1 s.
	await page.getByRole('slider', { name: 'Trim start' }).press('Shift+ArrowRight')
	expectCaptions((await exportFrames(page, [0.5, 1.7])).frames, [false, true])
	await page.getByRole('button', { name: 'Undo last change' }).click()

	// Off is one step: the export has no captions; Undo turns them back on.
	await toggle.click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'false')
	expectCaptions((await exportFrames(page, [0.7, 2.7])).frames, [false, false])
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'true')
	await page.getByRole('button', { name: 'Redo' }).click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'false')
	await page.getByRole('button', { name: 'Undo last change' }).click()

	// Reset turns them off with everything else.
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'false')
	await seekTo(page, 0.7)
	await expect(caption('Hello there.')).toHaveCount(0)

	// "turn captions on", confirmed, turns them on.
	await mockActions(page, { words: [], command: { ...NONE, action: 'captions_on' } })
	await page.getByRole('textbox', { name: 'Edit command' }).fill('turn captions on')
	await page.getByRole('button', { name: 'Run' }).click()
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await expect(reply).toContainText("I'll turn captions on, from the transcript.")
	await reply.getByRole('button', { name: 'Apply' }).click()
	await expect(toggle).toHaveAttribute('aria-pressed', 'true')
	await seekTo(page, 0.7)
	await expect(caption('Hello there.')).toBeVisible()
})
