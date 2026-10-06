import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, recordTestVideo, openTool } from './editor-helpers'

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
	await expect(
		page.getByRole('region', { name: 'Clips' }).getByText('home-take.webm').first()
	).toBeVisible()
	// The command was asked against the video, and waits for Apply.
	await expect(reply(page)).toContainText('Turn captions on')
	await expect(reply(page).getByRole('button', { name: 'Apply' })).toBeVisible()
	// Asked once, and the chat is free again: development mounts the editor
	// twice, which once left a second "Reading" bubble stuck, the box locked.
	await expect(page.getByText('Reading your command…')).toHaveCount(0)
	await expect(page.getByRole('textbox', { name: 'Edit command' })).toBeEnabled()
	await reply(page).getByRole('button', { name: 'Apply' }).click()
	await expect(reply(page)).toHaveCount(0)
})

test('editing by hand opens the editor on the tools and the transcript, the assistant a tab away', async ({
	page
}) => {
	await page.goto('/home')
	const byHand = page.getByRole('region', { name: 'Edit by hand' })
	await expect(page.getByRole('region', { name: 'Edit with AI' })).toBeVisible()
	await expect(byHand.getByRole('button', { name: 'Upload & edit' })).toBeVisible()
	const video = await recordTestVideo(page)
	await page
		.getByLabel('Video to edit by hand')
		.setInputFiles({ name: 'by-hand.webm', mimeType: 'video/webm', buffer: video })
	await expect(page).toHaveURL(/\/editor$/, { timeout: 30_000 })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(page.getByRole('region', { name: 'Chat' })).toBeHidden()
	await expect(page.getByRole('tab', { name: /^Transcript/ })).toHaveAttribute(
		'aria-selected',
		'true'
	)
	await expect(page.getByRole('tab', { name: 'Text & logo' })).toBeVisible()
	// The assistant is one click away.
	await page.getByRole('tab', { name: 'Assistant' }).click()
	await expect(page.getByRole('region', { name: 'Chat' })).toBeVisible()
})

test('the editor opened directly starts empty', async ({ page }) => {
	await page.goto('/editor')
	await expect(page.getByText('Drop a video here, or click to choose one')).toBeVisible()
	// No tools or timeline until there's a video to use them on.
	await expect(page.getByRole('tab', { name: 'Text & logo' })).toHaveCount(0)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toHaveCount(0)
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
	await openTool(page, 'Project')
	const project = page.getByRole('region', { name: 'Project', exact: true })
	await page.getByLabel('Project name').fill('Listed project')
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await openTool(page, 'Project')
	await expect(project.getByRole('status')).toContainText('Saved at')

	// Back to Home, then its Projects link.
	await page.getByRole('link', { name: 'Back to Home' }).click()
	await page.getByRole('link', { name: 'Projects' }).first().click()
	await expect(page.getByRole('heading', { level: 1, name: 'Saved projects' })).toBeVisible({
		timeout: 30_000
	})
	const card = page
		.getByRole('list', { name: 'Saved projects' })
		.getByRole('article', { name: 'Listed project' })
	await expect(card).toContainText(/Edited \w+/)
	// The picture is drawn from the saved video, not a placeholder.
	await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/, { timeout: 15_000 })

	// Renamed in place: Escape keeps the old name, Enter the new one.
	await card.getByRole('button', { name: 'Rename Listed project' }).click()
	await page.getByRole('textbox', { name: 'Project name' }).fill('Not this')
	await page.getByRole('textbox', { name: 'Project name' }).press('Escape')
	await expect(card).toContainText('Listed project')
	await card.getByRole('button', { name: 'Rename Listed project' }).click()
	await page.getByRole('textbox', { name: 'Project name' }).fill('Renamed project')
	await page.getByRole('textbox', { name: 'Project name' }).press('Enter')
	const renamed = page.getByRole('article', { name: 'Renamed project' })
	await expect(renamed).toBeVisible()

	// Its video downloads, as saved.
	const downloading = page.waitForEvent('download')
	await renamed.getByRole('button', { name: 'Download the video of Renamed project' }).click()
	expect((await downloading).suggestedFilename()).toBe('listed.webm')

	await renamed.getByRole('link', { name: 'Renamed project', exact: true }).click()
	await expect(page).toHaveURL(/\/editor\?project=/)
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	await expect(page.getByLabel('Project name')).toHaveValue('Renamed project')

	// Deleted only once confirmed.
	// Back to Home, then its Projects link.
	await page.getByRole('link', { name: 'Back to Home' }).click()
	await page.getByRole('link', { name: 'Projects' }).first().click()
	const doomed = page.getByRole('article', { name: 'Renamed project' })
	await doomed.getByRole('button', { name: 'Delete Renamed project' }).click()
	const confirm = page.getByRole('dialog', { name: 'Delete “Renamed project”?' })
	await confirm.getByRole('button', { name: 'Keep it' }).click()
	await expect(doomed).toBeVisible()
	await doomed.getByRole('button', { name: 'Delete Renamed project' }).click()
	await confirm.getByRole('button', { name: 'Delete project' }).click()
	await expect(doomed).toHaveCount(0)
	await expect(page.getByText('No saved projects yet')).toBeVisible()
})

test('signed in, the footer offers a new project, not logging in again', async ({ page }) => {
	await page.goto('/features')
	const signedIn = await page.getByRole('button', { name: 'Sign out' }).isVisible()
	test.skip(!signedIn, 'accounts are off here (no Supabase): nobody is signed in')
	const footer = page.getByRole('navigation', { name: 'Footer' })
	await expect(footer.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
	await footer.getByRole('link', { name: 'New project' }).click()
	await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 })
})
