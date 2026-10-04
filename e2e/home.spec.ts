import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, recordTestVideo } from './editor-helpers'

const reply = (page: Page) => page.getByRole('status').filter({ hasText: 'You asked' })

test('a project starts on the home page: a command and a video open the editor, which asks first', async ({
	page
}) => {
	await mockActions(page, { words: [], command: editCommand({ action: 'captions_on' }) })
	await page.goto('/home')
	await expect(page.getByRole('heading', { name: 'What are we fixing today?' })).toBeVisible()
	// An example fills the box; nothing is sent yet.
	await page.getByRole('button', { name: 'Turn captions on' }).click()
	await expect(page.getByRole('textbox', { name: 'Command' })).toHaveValue('Turn captions on')

	const video = await recordTestVideo(page)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'home-take.webm', mimeType: 'video/webm', buffer: video })
	// A cold editor compiles on first visit: the same 30 s allowance as the video waits.
	await expect(page).toHaveURL(/\/editor$/, { timeout: 30_000 })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(page.getByText('home-take.webm').first()).toBeVisible()
	// The command was asked against the video, and waits for Apply.
	await expect(reply(page)).toContainText('Turn captions on')
	await expect(reply(page).getByRole('button', { name: 'Apply' })).toBeVisible()
	await reply(page).getByRole('button', { name: 'Apply' }).click()
	await expect(reply(page)).toHaveCount(0)
})

test('the editor opened directly starts empty', async ({ page }) => {
	await page.goto('/editor')
	await expect(page.getByText('Drop a video here, or click to choose one')).toBeVisible()
	await expect(page.getByText('Your timeline appears here once a video loads.')).toBeVisible()
})

test('saved projects are listed with a picture, a name and a date, and open in the editor', async ({
	page
}) => {
	await page.goto('/home')
	const video = await recordTestVideo(page)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'listed.webm', mimeType: 'video/webm', buffer: video })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	const project = page.getByRole('region', { name: 'Project', exact: true })
	await project.getByLabel('Project name').fill('Listed project')
	await project.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(project.getByRole('status')).toContainText('Saved at')

	await page.getByRole('link', { name: 'Projects' }).first().click()
	await expect(page.getByRole('heading', { level: 1, name: 'Saved projects' })).toBeVisible()
	const card = page
		.getByRole('list', { name: 'Saved projects' })
		.getByRole('link')
		.filter({ hasText: 'Listed project' })
	await expect(card).toContainText(/Edited \w+/)
	// The picture is drawn from the saved video, not a placeholder.
	await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/, { timeout: 15_000 })
	await card.click()
	await expect(page).toHaveURL(/\/editor\?project=/)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(project.getByLabel('Project name')).toHaveValue('Listed project')
})
