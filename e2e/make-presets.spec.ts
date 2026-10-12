import { test, expect, type Page } from '@playwright/test'
import type { MakeReply } from '../src/app/[locale]/(app)/make/make-plan'
import { presetLook } from '../src/app/[locale]/(app)/make/make-presets'
import { recordTestVideo, w } from './editor-helpers'
import { exportVideo, readExportFrames } from './export-frames'
import { makeReply, mockMakeActions } from './make-helpers'

// Make it's looks (Clean, Bold, Cinematic, Playful): the style question, the
// plan card's honest label, a follow-up that switches the look, and what a
// look draws in the export. The transcript and Gemini's replies are canned
// (no paid call is made).

const TONE: Array<[number, boolean]> = [
	[1, true],
	[0.6, false],
	[2, true],
	[1.4, false],
	[1, true]
]
// Said without a long pause anywhere: one clip, no joins, so every look's
// caption is on screen at the same moment.
const WORDS = [
	w('Hello.', 0.1, 0.9),
	w('This', 1, 1.3),
	w('is', 1.3, 1.6),
	w('the', 1.6, 1.9),
	w('key', 1.9, 2.4),
	w('point.', 2.4, 3.4),
	w('Bye.', 3.5, 4.2)
]
/**
 * A screen recording whose picture matters: fitted whole into 9:16 with
 * black bars, so the captions sit on black, large enough to measure.
 */
const SCREEN: Partial<MakeReply> = {
	subject: 'screen',
	pictureMatters: true,
	faces: [],
	zoomSentences: [],
	keyLines: [],
	removeSentences: [],
	title: null
}

async function pickVideo(page: Page, request: string, solid: string | null = null) {
	await page.goto('/make')
	const video = await recordTestVideo(page, TONE, 0, { width: 320, height: 180 }, solid)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: video })
	await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
	await page.getByRole('button', { name: 'Make it', exact: true }).click()
}

const questions = (page: Page) => page.getByRole('form', { name: 'A few quick questions' })
const lookGroup = (page: Page) => questions(page).getByRole('group', { name: 'Which look?' })
const plan = (page: Page) => page.getByRole('status', { name: 'The plan' })

async function skipQuestions(page: Page) {
	await questions(page).getByRole('button', { name: 'Skip all' }).click({ timeout: 30_000 })
}

/** Applies the plan and opens the full editor, then exports it. */
async function applyAndExport(page: Page) {
	await plan(page).getByRole('button', { name: 'Apply' }).click()
	await page
		.getByRole('group', { name: 'Editor mode' })
		.getByRole('button', { name: 'Edit manually' })
		.click({ timeout: 30_000 })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	return exportVideo(page)
}

test('the look question: asked when no look is named, clicked reads as asked, skipped is chosen for you', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [makeReply({ ...SCREEN, style: 'reel' })])
	// Nothing named: the look is asked, with every preset and "You decide".
	await pickVideo(page, 'make this an Instagram reel')
	await expect(lookGroup(page)).toBeVisible({ timeout: 30_000 })
	for (const name of ['Clean', 'Bold', 'Cinematic', 'Playful', 'You decide']) {
		await expect(lookGroup(page).getByLabel(name, { exact: true })).toBeVisible()
	}
	await expect(lookGroup(page).getByLabel('You decide', { exact: true })).toBeChecked()
	await lookGroup(page).getByLabel('Cinematic', { exact: true }).check()
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()
	await expect(plan(page)).toContainText('As you asked: a Cinematic look', { timeout: 60_000 })

	// Skipped: the reel's own look, labelled as chosen.
	await pickVideo(page, 'make this an Instagram reel')
	await skipQuestions(page)
	await expect(plan(page)).toContainText('Chosen for you: a Bold look, as suits a reel', {
		timeout: 60_000
	})

	// A look named in the request: never asked, and it's the user's.
	await pickVideo(page, 'make this a playful Instagram reel')
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await expect(lookGroup(page)).toHaveCount(0)
	await skipQuestions(page)
	await expect(plan(page)).toContainText('As you asked: a Playful look', { timeout: 60_000 })
})

test('a follow-up switches the look: "Look: Bold to Cinematic", applied; one that changes nothing says so', async ({
	page
}) => {
	const first = makeReply({ ...SCREEN, style: 'reel', captions: 'bold_words' })
	await mockMakeActions(page, WORDS, [first], [], undefined, [first, first])
	await pickVideo(page, 'make this an Instagram reel')
	await skipQuestions(page)
	await expect(plan(page)).toContainText('Chosen for you: a Bold look', { timeout: 60_000 })
	await plan(page).getByRole('button', { name: 'Apply' }).click()
	const chat = page.getByRole('region', { name: 'Chat' })
	await expect(chat).toBeVisible({ timeout: 30_000 })
	const box = chat.getByRole('textbox', { name: 'Edit command' })

	// Gemini's answer is the same plan: only the user's words switch the look.
	await box.fill('make it more cinematic')
	await box.press('Enter')
	const answer = chat.getByRole('status', { name: 'The changed plan' })
	await expect(answer).toContainText('What would change:', { timeout: 60_000 })
	await expect(answer.getByRole('listitem').first()).toHaveText('Look: Bold to Cinematic')
	await answer.getByRole('button', { name: 'Apply changes' }).click()
	await expect(chat).toContainText('Applied. Undo, at the top, goes back to the plan before.')

	// Asked again for the look it already has: nothing would change.
	await box.fill('keep it cinematic')
	await box.press('Enter')
	const again = chat.getByRole('status', { name: 'The changed plan' }).last()
	await expect(again).toContainText('Nothing in the plan would change.', { timeout: 60_000 })
	await expect(again.getByRole('button', { name: 'Apply changes' })).toHaveCount(0)
})

/** The caption band's white text, as a mask over the bottom of the frame, and its count. */
const readCaption = ({
	context,
	width,
	height
}: {
	context: CanvasRenderingContext2D
	width: number
	height: number
}) => {
	const top = Math.round(height * 0.6)
	const data = context.getImageData(0, top, width, height - top).data
	let mask = ''
	let white = 0
	for (let i = 0; i < data.length; i += 4) {
		const on = (data[i] ?? 0) > 200 && (data[i + 1] ?? 0) > 200 && (data[i + 2] ?? 0) > 200
		mask += on ? '1' : '0'
		if (on) white++
	}
	return { mask, white }
}

test('Cinematic captions are drawn in a real serif in the export, not a silent fallback to sans', async ({
	page
}) => {
	test.setTimeout(300_000)
	// Large captions asked for in words (kept, at one size), so the only difference is the font.
	const reply = makeReply({ ...SCREEN, style: 'reel', captions: 'large' })
	await mockMakeActions(page, WORDS, [reply])

	// This browser (the one that exports) has a serif that isn't its sans.
	await page.goto('/make')
	const widths = await page.evaluate(() => {
		const context = document.createElement('canvas').getContext('2d')
		if (!context) throw new Error('no 2d context')
		const measure = (family: string) => {
			context.font = `bold 40px ${family}`
			return context.measureText('This is the key point.').width
		}
		return { serif: measure('serif'), sans: measure('sans-serif') }
	})
	expect(Math.abs(widths.serif - widths.sans) / widths.sans).toBeGreaterThan(0.02)

	const captionAt = async (look: string) => {
		await pickVideo(page, `make this a ${look} Instagram reel with large captions`)
		await skipQuestions(page)
		await expect(plan(page)).toContainText('Large captions at the bottom', { timeout: 60_000 })
		const bytes = await applyAndExport(page)
		const { frames } = await readExportFrames(page, bytes, [2.5], readCaption)
		return frames[0]
	}
	const cinematic = await captionAt('cinematic')
	const clean = await captionAt('clean')
	expect(cinematic?.white, 'Cinematic’s caption').toBeGreaterThan(40)
	expect(clean?.white, 'Clean’s caption').toBeGreaterThan(40)
	// The same words, at the same size, in the same place: drawn in one font, the masks
	// would all but match. In serif and sans, a good part of them differs.
	const a = cinematic?.mask ?? ''
	const b = clean?.mask ?? ''
	let differ = 0
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) differ++
	const most = Math.max(cinematic?.white ?? 0, clean?.white ?? 0)
	expect(differ / most, 'the share of caption pixels that differ').toBeGreaterThan(0.25)
})

test('Playful captions highlight the word being said in its own accent colour', async ({
	page
}) => {
	test.setTimeout(300_000)
	await mockMakeActions(page, WORDS, [makeReply({ ...SCREEN, style: 'reel' })])
	// A grey video has no colour of its own: Playful's own palette, so its colour is known.
	const highlight = presetLook('playful', null).captions.picture.highlight ?? ''
	await pickVideo(page, 'make this a playful Instagram reel', '#808080')
	await skipQuestions(page)
	await expect(plan(page)).toContainText('Captions with the word being said highlighted', {
		timeout: 60_000
	})
	const bytes = await applyAndExport(page)
	// At 2.5 s "point." is being said: highlighted at the bottom (near, as the encoder blurs it).
	const { frames } = await readExportFrames(
		page,
		bytes,
		[2.5],
		({ context, width, height }, colour: string) => {
			const want = [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16))
			const top = Math.round(height * 0.6)
			const data = context.getImageData(0, top, width, height - top).data
			let near = 0
			for (let i = 0; i < data.length; i += 4) {
				const distance = Math.hypot(
					(data[i] ?? 0) - (want[0] ?? 0),
					(data[i + 1] ?? 0) - (want[1] ?? 0),
					(data[i + 2] ?? 0) - (want[2] ?? 0)
				)
				if (distance < 60) near++
			}
			return { near }
		},
		{ args: highlight }
	)
	expect(frames[0]?.near, `the word being said, in ${highlight}`).toBeGreaterThan(5)
})
