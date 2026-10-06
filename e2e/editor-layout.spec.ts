import { test, expect, type Page } from '@playwright/test'
import {
	editCommand,
	mockActions,
	openEditorWithVideo,
	seekTo,
	w,
	openTool
} from './editor-helpers'

// The editor's layout: the tool rail on the left with a search, the
// assistant and transcript on the right, both hidden for a larger picture,
// undo and redo the only keys, and the saved sign.

const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })
const reply = (page: Page) => page.getByRole('status').filter({ hasText: 'You asked' })
const clips = (page: Page) => page.getByRole('region', { name: 'Clips' }).getByRole('option')

test('the chat keeps a record: an answer applied or cancelled stays, and only the latest can be applied', async ({
	page
}) => {
	await mockActions(page, { words: [], command: editCommand({ action: 'captions_on' }) })
	await openEditorWithVideo(page)
	const input = chat(page).getByRole('textbox', { name: 'Edit command' })
	await openTool(page, 'Assistant')
	await input.fill('turn captions on')
	// Enter sends.
	await input.press('Enter')
	await expect(reply(page)).toContainText('I’ll turn captions on'.replace('’', "'"))
	await reply(page).getByRole('button', { name: 'Cancel' }).click()
	await expect(reply(page)).toHaveCount(0)
	await expect(chat(page).getByText('Cancelled — nothing changed')).toBeVisible()
	await openTool(page, 'Captions')
	const captions = page
		.getByRole('region', { name: 'Captions' })
		.getByRole('button', { name: 'Captions' })
	await expect(captions).toHaveAttribute('aria-pressed', 'false')

	await openTool(page, 'Assistant')
	await input.fill('captions on please')
	await page.getByRole('button', { name: 'Run' }).click()
	await reply(page).getByRole('button', { name: 'Apply changes' }).click()
	await expect(chat(page).getByText('Applied', { exact: true })).toBeVisible()
	await openTool(page, 'Captions')
	await expect(captions).toHaveAttribute('aria-pressed', 'true')
	// Both questions are still there, in order.
	await openTool(page, 'Assistant')
	await expect(chat(page).getByText('turn captions on', { exact: true })).toBeVisible()
	await expect(chat(page).getByText('captions on please', { exact: true })).toBeVisible()
})

test('the tools sit in one panel, the assistant and transcript among them; a search finds them; one icon hides it', async ({
	page
}) => {
	await openEditorWithVideo(page)
	const tool = (name: string) => page.getByRole('tab', { name, exact: true })
	for (const name of [
		'Assistant',
		'Transcript',
		'Clean up',
		'Captions',
		'Text & logo',
		'Annotate',
		'Audio',
		'Frame',
		'Colour'
	])
		await expect(tool(name)).toBeVisible()
	// The assistant is open to begin with; a tool opens in its place, with its
	// heading and a line of help, and clicked again it stays open.
	await expect(tool('Assistant')).toHaveAttribute('aria-selected', 'true')
	await tool('Colour').click()
	const panel = page.getByRole('tabpanel', { name: 'Colour' })
	await expect(panel.getByRole('heading', { name: 'Colour' })).toBeVisible()
	await expect(panel.getByText('Brightness, contrast and colour.')).toBeVisible()
	await expect(chat(page)).toBeHidden()
	await tool('Colour').click()
	await expect(panel).toBeVisible()
	// The search finds a tool by what it does, and opens it.
	await tool('Frame').click()
	const search = page.getByRole('searchbox', { name: 'Find a tool' })
	await search.fill('brightness')
	await expect(page.getByText('1 tool found')).toBeVisible()
	await page
		.getByRole('region', { name: 'Search results' })
		.getByRole('button', { name: /Colour/ })
		.click()
	await expect(tool('Colour')).toHaveAttribute('aria-selected', 'true')
	await search.fill('nothing like this')
	await expect(page.getByText('No tool matches “nothing like this”.')).toBeVisible()
	await search.press('Escape')

	// One icon on the left edge hides the panel, and the middle (the picture
	// and the timeline) gets its room; remembered.
	await expect(page.getByRole('button', { name: 'Hide panels' })).toHaveCount(0)
	const timeline = page.getByRole('region', { name: 'Timeline' })
	const width = async () => (await timeline.boundingBox())?.width ?? 0
	const withPanel = await width()
	await page.getByRole('button', { name: 'Hide the tool panel' }).click()
	await expect(tool('Colour')).toBeHidden()
	expect(await width(), 'the middle grows').toBeGreaterThan(withPanel)
	await page.reload()
	await openEditorWithVideo(page)
	await expect(tool('Colour')).toBeHidden()
	await page.getByRole('button', { name: 'Show the tool panel' }).click()
	await expect(tool('Colour')).toBeVisible()
	await tool('Assistant').click()
	await expect(chat(page)).toBeVisible()
})

test('only undo and redo have keys; no single-key shortcuts', async ({ page }) => {
	await openEditorWithVideo(page)
	await seekTo(page, 1)
	// S, Delete and Space do nothing on their own.
	await page.locator('body').press('s')
	await expect(clips(page)).toHaveCount(1)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(clips(page)).toHaveCount(2)
	await page.locator('body').press('Delete')
	await expect(clips(page)).toHaveCount(2)
	await page.locator('body').press(' ')
	await expect
		.poll(() =>
			page
				.locator('video')
				.first()
				.evaluate((v: HTMLVideoElement) => v.paused)
		)
		.toBe(true)
	// Ctrl+Z undoes, Ctrl+Shift+Z redoes; no shortcuts list.
	await page.locator('body').press('Control+z')
	await expect(clips(page)).toHaveCount(1)
	await page.locator('body').press('Control+Shift+z')
	await expect(clips(page)).toHaveCount(2)
	await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveCount(0)
})

test('the project is named and saved at the top of the editor', async ({ page }) => {
	await openEditorWithVideo(page)
	// Named at the top of the editor; until it's saved, Save sits beside the name.
	const badge = page.getByTestId('save-badge')
	await expect(badge).toHaveCount(0)
	await page.getByLabel('Project name').fill('Badge')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(badge).toHaveText('Saved')
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
	// A saved project renamed there is saved under the new name.
	await page.getByLabel('Project name').fill('Badge renamed')
	await page.getByLabel('Project name').press('Enter')
	await openTool(page, 'Project')
	await expect(
		page
			.getByRole('region', { name: 'Project', exact: true })
			.getByRole('listitem', { name: 'Badge renamed' })
	).toBeVisible()
})

test('a transcript line moves the playhead to where it starts', async ({ page }) => {
	await mockActions(page, {
		words: [w('First.', 0.2, 0.6), w('Second', 1.6, 2.0), w('line.', 2.0, 2.4)]
	})
	// With sound, so there's a transcript (mocked) to click.
	await openEditorWithVideo(page, [[3, true]])
	await openTool(page, 'Transcript')
	const line = page.getByRole('button', { name: /Second line\./ }).first()
	await expect(line).toBeVisible({ timeout: 30_000 })
	await line.click()
	await expect
		.poll(() =>
			page
				.locator('video')
				.first()
				.evaluate((v: HTMLVideoElement) => v.currentTime)
		)
		.toBeCloseTo(1.6, 1)
})

test('leaving with unsaved changes asks first; once saved, it does not', async ({ page }) => {
	await openEditorWithVideo(page)
	const leave = page.getByRole('dialog', { name: 'Leave without saving?' })
	const back = page.getByRole('link', { name: 'Back to Home' })
	const split = page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })

	// Nothing changed yet: leaving just leaves.
	await back.click()
	await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 })
	await openEditorWithVideo(page)

	// A change, not saved: the link asks; Stay keeps the edit.
	await seekTo(page, 1)
	await split.click()
	await expect(clips(page)).toHaveCount(2)
	await back.click()
	await expect(leave).toBeVisible()
	await leave.getByRole('button', { name: 'Stay' }).click()
	await expect(leave).toBeHidden()
	await expect(page).toHaveURL(/\/editor$/)
	await expect(clips(page)).toHaveCount(2)

	// Closing or reloading the tab gets the browser's own prompt.
	const prompt = page.waitForEvent('dialog')
	void page.reload()
	const dialog = await prompt
	expect(dialog.type()).toBe('beforeunload')
	await dialog.dismiss()
	await expect(clips(page)).toHaveCount(2)

	// Saved: no question, in the app or from the browser.
	await page.getByLabel('Project name').fill('Guarded')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByTestId('save-badge')).toHaveText('Saved')
	await back.click()
	await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 })
	await expect(leave).toHaveCount(0)

	// Leave without saving goes on.
	await openEditorWithVideo(page)
	await seekTo(page, 1)
	await split.click()
	await back.click()
	await leave.getByRole('button', { name: 'Leave without saving' }).click()
	await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 })
})
