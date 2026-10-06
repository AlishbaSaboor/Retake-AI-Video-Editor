import { test, expect } from '@playwright/test'

// The public site, as a visitor who isn't signed in sees it.
test.use({ storageState: { cookies: [], origins: [] } })

test('the landing page holds how it works, features, contact and questions; the header only the pages and Sign in', async ({
	page
}) => {
	await page.goto('/')
	await expect(
		page.getByRole('heading', { level: 1, name: 'Fix the take. Keep the recording.' })
	).toBeVisible()
	for (const heading of [
		'From recording to finished video',
		'What Retake does',
		'Talk to us',
		'Frequently asked questions'
	])
		await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
	// A question opens its answer below it, and closes it again.
	const question = page.getByText('Is my video uploaded?')
	const answer = page.getByText(/^No\. Editing, previews and export run in your browser/)
	await expect(answer).toBeHidden()
	await question.click()
	await expect(answer).toBeVisible()
	await question.click()
	await expect(answer).toBeHidden()

	// The header: the pages and Sign in, nothing else.
	const header = page.getByRole('banner')
	const nav = header.getByRole('navigation', { name: 'Main' }).first()
	await expect(nav.getByRole('link')).toHaveText(['How it works', 'Features', 'Contact us'])
	await expect(header.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
	await expect(header.getByRole('switch', { name: 'Light mode' })).toHaveCount(0)
	await expect(header.getByRole('link', { name: 'Projects' })).toHaveCount(0)
	for (const [link, heading] of [
		['How it works', 'From recording to finished video'],
		['Features', 'What Retake does'],
		['Contact us', 'Talk to us']
	] as const) {
		await nav.getByRole('link', { name: link }).click()
		// Each page compiles on its first visit to a cold dev server.
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
			timeout: 30_000
		})
	}
})

test.describe('signed in', () => {
	test.use({ storageState: 'e2e/.auth/user.json' })

	test('the header has only New project, Projects, the theme switch and Sign out', async ({
		page
	}) => {
		await page.goto('/projects')
		const header = page.getByRole('banner')
		const nav = header.getByRole('navigation', { name: 'Main' }).first()
		await expect(nav.getByRole('link')).toHaveText(['New project', 'Projects'])
		await expect(header.getByRole('switch', { name: 'Light mode' })).toBeVisible()
		await expect(header.getByRole('button', { name: /Sign out/ }).first()).toBeVisible()
		await expect(header.getByRole('link', { name: 'How it works' })).toHaveCount(0)
	})

	test('dark is the default; the switch turns light on every page, and it is remembered', async ({
		page
	}) => {
		const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')
		await page.goto('/home')
		expect(await theme()).toBe('dark')
		const toggle = page.getByRole('switch', { name: 'Light mode' })
		await expect(toggle).toHaveAttribute('aria-checked', 'false')
		await toggle.click()
		expect(await theme()).toBe('light')
		await expect(toggle).toHaveAttribute('aria-checked', 'true')
		// The page really is light: the background, not just the attribute.
		const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
		expect(background).toBe('rgb(246, 246, 243)')

		await page.goto('/projects')
		expect(await theme()).toBe('light')
		await page.reload()
		expect(await theme()).toBe('light')
		await expect(page.getByRole('switch', { name: 'Light mode' })).toHaveAttribute(
			'aria-checked',
			'true'
		)
		await page.getByRole('switch', { name: 'Light mode' }).click()
		await page.goto('/home')
		expect(await theme()).toBe('dark')
	})
})

test('a contact message is checked, sent, and thanked', async ({ page }) => {
	// The form's action, answered as if saved: CI has no database. The request
	// still reaches the real server, with its input emptied (refused before
	// any write), so only the result inside Next's reply is swapped.
	await page.route(
		(url) => url.pathname.endsWith('/contact'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			const response = await route.fetch({ postData: '[{}]' })
			await route.fulfill({
				response,
				body: (await response.text()).replace(/\{"ok":false[^\n]*\}/, '{"ok":true,"data":null}')
			})
		}
	)
	await page.goto('/contact')
	await page.getByLabel('Email').fill('not-an-email')
	await page.getByLabel('Message').fill('Hello')
	await page.getByRole('button', { name: 'Send message' }).click()
	// The browser's own check stops a malformed email before anything is sent.
	expect(
		await page.getByLabel('Email').evaluate((input: HTMLInputElement) => input.validity.valid)
	).toBe(false)
	await page.getByLabel('Email').fill('sam@example.com')
	await page.getByRole('button', { name: 'Send message' }).click()
	await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible()
})

test('the app pages ask a signed-out visitor to log in, when accounts are on', async ({ page }) => {
	await page.goto('/projects')
	const url = new URL(page.url())
	test.skip(url.pathname !== '/login', 'accounts are off here (no Supabase): nothing to sign in to')
	expect(url.searchParams.get('next')).toBe('/projects')
	await expect(page.getByRole('heading', { name: 'Log in to Retake' })).toBeVisible()
	await page.getByRole('tab', { name: 'Sign up' }).click()
	await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
})

test('on a phone, the menu closes once a page from it opens', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	const menu = page.locator('details:has(summary[aria-label="Menu"])')
	await page.locator('summary[aria-label="Menu"]').click()
	await expect(menu).toHaveAttribute('open', '')
	await menu.getByRole('link', { name: 'Features' }).click()
	await expect(page.getByRole('heading', { level: 1, name: 'What Retake does' })).toBeVisible({
		timeout: 30_000
	})
	await expect(menu).not.toHaveAttribute('open')
})
