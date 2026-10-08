import { test, expect } from '@playwright/test'
import { recordTestVideo, openTool } from './editor-helpers'

test('editing manually opens the editor on the tools and the transcript, the assistant a tab away', async ({
	page
}) => {
	await page.goto('/home')
	// Two ways in, nothing else.
	await expect(page.getByRole('region', { name: 'Make it with AI' })).toBeVisible()
	const byHand = page.getByRole('region', { name: 'Edit manually' })
	await expect(byHand.getByRole('button', { name: 'Upload and edit' })).toBeVisible()
	await expect(page.getByRole('region', { name: 'Edit with AI' })).toHaveCount(0)
	await expect(page.getByRole('textbox', { name: 'Command' })).toHaveCount(0)
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
		.getByLabel('Video to edit by hand')
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

test('signed in, Open Retake on the public pages goes straight to a new project', async ({
	page
}) => {
	await page.goto('/features')
	await page.getByRole('banner').getByRole('link', { name: 'Open Retake' }).first().click()
	await expect(page).toHaveURL(/\/home$/, { timeout: 30_000 })
	await expect(
		page.getByRole('heading', { level: 1, name: 'What are we making today?' })
	).toBeVisible()
})
