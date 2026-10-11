import { test, expect, type Page } from '@playwright/test'
import { recordTestVideo, w } from './editor-helpers'
import { makeReply, mockMakeActions } from './make-helpers'

// Make it's quick questions: fixed choices between Make it and the plan,
// only what the request leaves open, no AI call. The transcript and
// Gemini's replies are canned (no paid call is made); what's tested is
// which questions show, that planning waits for them, and that the plan
// follows what was clicked and labels the rest as chosen.

const TONE: Array<[number, boolean]> = [
	[1, true],
	[0.6, false],
	[2, true],
	[1.4, false],
	[1, true]
]
const WORDS = [
	w('Hello.', 0.1, 0.9),
	w('This', 1.7, 2.1),
	w('is', 2.1, 2.4),
	w('the', 2.4, 2.7),
	w('key', 2.7, 3.1),
	w('point.', 3.1, 3.5),
	w('Bye.', 5.1, 5.9)
]
const BRIEF = { audience: null, tone: null, length: null, show: null, callToAction: null }

async function pickVideo(page: Page, request: string) {
	await page.goto('/make')
	const video = await recordTestVideo(page, TONE)
	await page
		.getByLabel('Video to make into something')
		.setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: video })
	await page.getByRole('textbox', { name: 'What should it become?' }).fill(request)
}

const makeIt = (page: Page) => page.getByRole('button', { name: 'Make it', exact: true })
const questions = (page: Page) => page.getByRole('form', { name: 'A few quick questions' })
const plan = (page: Page) => page.getByRole('status', { name: 'The plan' })
const group = (page: Page, name: string) => questions(page).getByRole('group', { name })

test('a one-line reel request asks only its length, tone and call to action; a typed tone beats Gemini’s, a skipped one is chosen', async ({
	page
}) => {
	// Gemini fills a tone and a call to action in whether or not anyone gave them.
	const seen = await mockMakeActions(page, WORDS, [
		makeReply({ brief: { ...BRIEF, tone: 'calm', callToAction: 'Bye' } })
	])
	await pickVideo(page, 'make this an Instagram reel')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	// It's a reel: what it is, and an ad's shape, aren't asked.
	await expect(group(page, 'What is it?')).toHaveCount(0)
	await expect(group(page, 'What shape should the ad be?')).toHaveCount(0)
	// It states no length: that's asked.
	await expect(group(page, 'How long, at most?')).toBeVisible()
	await questions(page).getByLabel('Tone').fill('energetic')
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()

	await expect(plan(page)).toContainText('From your brief: energetic tone', { timeout: 60_000 })
	await expect(plan(page)).toContainText('Chosen for you: ends with “Bye”')
	await expect(plan(page)).not.toContainText('calm tone')
	// The answers went with the request, the call to action left to Retake.
	expect(seen.plans[0]).toContain('"tone":"energetic"')
	expect(seen.plans[0]).toContain('"callToAction":null')
})

test('a one-line ad request asks its shape; the shape and call to action clicked beat Gemini’s', async ({
	page
}) => {
	// Gemini plans it horizontal, with no call to action.
	const seen = await mockMakeActions(page, WORDS, [
		makeReply({ style: 'ad', format: 'other', shape: 'horizontal', fit: 'bars' })
	])
	await pickVideo(page, 'make an ad')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await expect(group(page, 'What is it?')).toHaveCount(0)
	await group(page, 'What shape should the ad be?').getByLabel('Vertical').check()
	await questions(page).getByLabel('Call to action').fill('Follow for more')
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()

	await expect(plan(page)).toContainText('Vertical 9:16', { timeout: 60_000 })
	await expect(plan(page)).toContainText(
		'From your brief: ends with “Follow for more” · vertical 9:16'
	)
	await expect(plan(page)).not.toContainText('Horizontal 16:9')
	expect(seen.plans[0]).toContain('"adShape":"vertical"')
})

test('a long brief that answers every question asks none, and its parts read as the user’s', async ({
	page
}) => {
	const request =
		'A 45 second Instagram reel for small business owners, upbeat hip hop, energetic tone, end with "Bye"'
	const seen = await mockMakeActions(page, WORDS, [
		makeReply({
			maxSeconds: 45,
			brief: {
				audience: 'small business owners',
				tone: 'energetic',
				length: '45 second',
				show: null,
				callToAction: 'Bye'
			}
		})
	])
	await pickVideo(page, request)
	await makeIt(page).click()
	await expect(plan(page)).toContainText(
		'From your brief: for small business owners · energetic tone · ends with “Bye”',
		{ timeout: 60_000 }
	)
	// The length the brief states: its own line, as the user's.
	await expect(plan(page)).toContainText('As you asked: at most 45 s')
	await expect(questions(page)).toHaveCount(0)
	await expect(plan(page)).not.toContainText('Chosen for')
	expect(seen.plans[0]).not.toContain('"choices"')
})

test('"You decide" is picked until something else is; Skip all plans at once, everything chosen for the user', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [
		makeReply({ style: 'professional', format: 'other', shape: 'original' })
	])
	await pickVideo(page, 'tidy it up')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await expect(group(page, 'What is it?').getByLabel('You decide')).toBeChecked()
	await expect(questions(page).getByLabel('Tone')).toHaveValue('')
	await questions(page).getByRole('button', { name: 'Skip all' }).click()
	await expect(plan(page)).toContainText('Chosen for you: a professional edit', {
		timeout: 60_000
	})
	await expect(plan(page)).not.toContainText('From your brief')
})

test('picking Ad shows its shape question and a reel hides it; what was clicked reads as the user’s', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [
		makeReply({ style: 'reel', format: 'other', shape: 'square' })
	])
	await pickVideo(page, 'tidy it up')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await expect(group(page, 'What shape should the ad be?')).toHaveCount(0)
	await group(page, 'What is it?').getByLabel('Ad', { exact: true }).check()
	await expect(group(page, 'What shape should the ad be?')).toBeVisible()
	await group(page, 'What is it?').getByLabel('TikTok').check()
	await expect(group(page, 'What shape should the ad be?')).toHaveCount(0)
	await group(page, 'What is it?').getByLabel('Ad', { exact: true }).check()
	await group(page, 'What shape should the ad be?').getByLabel('Keep the video’s shape').check()
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()
	await expect(plan(page)).toContainText('From your brief: an ad · its own shape', {
		timeout: 60_000
	})
	await expect(plan(page)).toContainText('An ad, about')
})

test('the questions never start planning: it waits for the answers, however long, then goes', async ({
	page
}) => {
	const seen = await mockMakeActions(page, WORDS, [makeReply()])
	await pickVideo(page, 'make this an Instagram reel')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	// Long enough for the transcript and the pictures to be ready.
	await page.waitForTimeout(6_000)
	expect(seen.plans).toHaveLength(0)
	await questions(page).getByRole('button', { name: 'Skip all' }).click()
	await expect(plan(page)).toBeVisible({ timeout: 60_000 })
	expect(seen.plans).toHaveLength(1)
})

test('the request box takes 1,000 characters, counts what is left, and holds a longer one back with a plain message', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [makeReply()])
	await pickVideo(page, 'x'.repeat(1000))
	const box = page.getByRole('textbox', { name: 'What should it become?' })
	await expect(page.getByText('0 characters left')).toBeVisible()
	await expect(makeIt(page)).toBeEnabled()
	await box.fill('x'.repeat(1001))
	// Kept as typed, never cut short.
	await expect(box).toHaveValue('x'.repeat(1001))
	await expect(page.locator('#make-request-count')).toHaveRole('alert')
	await expect(page.locator('#make-request-count')).toHaveText(
		"That's 1 character too long: a request can be up to 1,000 characters. Shorten it to make a plan."
	)
	await expect(makeIt(page)).toBeDisabled()
	await box.press('Enter')
	await expect(questions(page)).toHaveCount(0)
	await box.fill('x'.repeat(990))
	await expect(page.getByText('10 characters left')).toBeVisible()
	await expect(makeIt(page)).toBeEnabled()
})

test('a one-line ad asks how long; 30 s is the plan’s most, as asked, and Gemini’s own 59 s never counts', async ({
	page
}) => {
	// Gemini fills in a 59 s limit nobody asked for, as it did on a real run.
	const seen = await mockMakeActions(page, WORDS, [
		makeReply({ style: 'ad', format: 'other', shape: 'original', maxSeconds: 59 })
	])
	await pickVideo(page, 'make an ad')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await group(page, 'How long, at most?').getByLabel('30 s').check()
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()
	await expect(plan(page)).toContainText('As you asked: at most 30 s', { timeout: 60_000 })
	await expect(plan(page)).not.toContainText('59 s')
	expect(seen.plans[0]).toContain('"length":"30"')
})

test('left to "You decide", an ad runs at most 30 s, chosen for the user', async ({ page }) => {
	await mockMakeActions(page, WORDS, [
		makeReply({ style: 'ad', format: 'other', shape: 'original', maxSeconds: 59 })
	])
	await pickVideo(page, 'make an ad')
	await makeIt(page).click()
	await expect(group(page, 'How long, at most?').getByLabel('You decide')).toBeChecked({
		timeout: 30_000
	})
	await questions(page).getByRole('button', { name: 'Skip all' }).click()
	await expect(plan(page)).toContainText('Chosen for you: at most 30 s', { timeout: 60_000 })
	await expect(plan(page)).not.toContainText('59 s')
})

test('a request that states a length asks no length question, and the length reads as the user’s', async ({
	page
}) => {
	await mockMakeActions(page, WORDS, [
		makeReply({ style: 'ad', format: 'other', shape: 'original', maxSeconds: 30 })
	])
	await pickVideo(page, 'make a 30 second ad')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await expect(group(page, 'What shape should the ad be?')).toBeVisible()
	await expect(group(page, 'How long, at most?')).toHaveCount(0)
	await questions(page).getByRole('button', { name: 'Skip all' }).click()
	await expect(plan(page)).toContainText('As you asked: at most 30 s', { timeout: 60_000 })
})

test('a reel asked for 60 s says it’s capped at 59 s, and why', async ({ page }) => {
	await mockMakeActions(page, WORDS, [makeReply()])
	await pickVideo(page, 'make this an Instagram reel')
	await makeIt(page).click()
	await expect(questions(page)).toBeVisible({ timeout: 30_000 })
	await group(page, 'How long, at most?').getByLabel('60 s').check()
	await questions(page).getByRole('button', { name: 'Make the plan' }).click()
	await expect(plan(page)).toContainText('As you asked: at most 60 s', { timeout: 60_000 })
	await expect(plan(page)).toContainText(
		'Capped at 59 s: reels, TikToks and Shorts run under a minute'
	)
})
