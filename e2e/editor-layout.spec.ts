import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, openEditorWithVideo, seekTo } from './editor-helpers'

// The editor's layout: the chat on the left, the tools on the right with a
// search, either side hidden for a larger picture, the keyboard shortcuts,
// and the saved sign.

const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })
const reply = (page: Page) => page.getByRole('status').filter({ hasText: 'You asked' })
const clips = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')

test('the chat keeps a record: an answer applied or cancelled stays, and only the latest can be applied', async ({
	page
}) => {
	await mockActions(page, { words: [], command: editCommand({ action: 'captions_on' }) })
	await openEditorWithVideo(page)
	const input = chat(page).getByRole('textbox', { name: 'Edit command' })
	await input.fill('turn captions on')
	// Enter sends.
	await input.press('Enter')
	await expect(reply(page)).toContainText('I’ll turn captions on'.replace('’', "'"))
	await reply(page).getByRole('button', { name: 'Cancel' }).click()
	await expect(reply(page)).toHaveCount(0)
	await expect(chat(page).getByText('Cancelled — nothing changed')).toBeVisible()
	const captions = page
		.getByRole('region', { name: 'Graphics' })
		.getByRole('button', { name: 'Captions' })
	await expect(captions).toHaveAttribute('aria-pressed', 'false')

	await input.fill('captions on please')
	await page.getByRole('button', { name: 'Run' }).click()
	await reply(page).getByRole('button', { name: 'Apply changes' }).click()
	await expect(chat(page).getByText('Applied', { exact: true })).toBeVisible()
	await expect(captions).toHaveAttribute('aria-pressed', 'true')
	// Both questions are still there, in order.
	await expect(chat(page).getByText('turn captions on', { exact: true })).toBeVisible()
	await expect(chat(page).getByText('captions on please', { exact: true })).toBeVisible()
})

test('the tools are found by name or by what they do; the side columns hide for a larger picture', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const search = page.getByRole('searchbox', { name: 'Find a tool' })
	const picture = page.getByRole('region', { name: 'Picture' })
	const color = page.getByRole('region', { name: 'Color' })
	await search.fill('crop')
	await expect(picture).toBeVisible()
	await expect(color).toBeHidden()
	await expect(page.getByText('1 tool found')).toBeVisible()
	await search.fill('brightness')
	await expect(color).toBeVisible()
	await expect(picture).toBeHidden()
	await search.fill('nothing like this')
	await expect(page.getByText('No tool matches “nothing like this”.')).toBeVisible()
	await search.press('Escape')
	await expect(picture).toBeVisible()
	await expect(color).toBeVisible()

	const player = page.getByTestId('player')
	const width = async () => (await player.boundingBox())?.width ?? 0
	const withBoth = await width()
	await page.getByRole('button', { name: 'Hide the tools' }).click()
	await expect(color).toBeHidden()
	await page.getByRole('button', { name: 'Hide the chat' }).click()
	await expect(chat(page)).toBeHidden()
	expect(await width(), 'the picture grows').toBeGreaterThan(withBoth)
	// The keys bring them back: [ the chat, ] the tools; / finds a tool.
	await page.locator('body').press('[')
	await expect(chat(page)).toBeVisible()
	await page.locator('body').press('/')
	await expect(color).toBeVisible()
	await expect(search).toBeFocused()
	// Remembered in this browser.
	await page.locator('body').click({ position: { x: 5, y: 300 } })
	await page.keyboard.press('[')
	await expect(chat(page)).toBeHidden()
	await page.reload()
	await expect(page.getByText('Drop a video here, or click to choose one')).toBeVisible()
	await openEditorWithVideo(page)
	await expect(chat(page)).toBeHidden()
	await page.getByRole('button', { name: 'Show the chat' }).click()
	await expect(chat(page)).toBeVisible()
})

test('keyboard shortcuts play, split, delete and undo, and ? lists them', async ({ page }) => {
	await openEditorWithVideo(page)
	const video = page.locator('video').first()
	// Not while typing: S in a field is just a letter.
	await page.getByRole('textbox', { name: 'Edit command' }).fill('')
	await page.getByRole('textbox', { name: 'Edit command' }).press('s')
	await expect(clips(page)).toHaveCount(1)

	await seekTo(page, 1)
	await page.locator('body').press('s')
	await expect(clips(page)).toHaveCount(2)
	await page.locator('body').press('Delete')
	await expect(clips(page)).toHaveCount(1)
	await page.locator('body').press('Control+z')
	await expect(clips(page)).toHaveCount(2)

	await page.locator('body').press(' ')
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
	await page.locator('body').press(' ')
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

	await page.locator('body').press('?')
	const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
	await expect(help).toBeVisible()
	await expect(help).toContainText('Split at the playhead')
	await help.getByRole('button', { name: 'Close' }).click()
	await expect(help).toBeHidden()
})

test('the toolbar says whether the project is saved', async ({ page }) => {
	await openEditorWithVideo(page)
	const badge = page.getByTestId('save-badge')
	await expect(badge).toHaveText('Not saved')
	const project = page.getByRole('region', { name: 'Project', exact: true })
	await project.getByLabel('Project name').fill('Badge')
	await project.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(badge).toHaveText('Saved')
})
