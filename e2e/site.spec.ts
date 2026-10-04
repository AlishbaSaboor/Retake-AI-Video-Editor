import { test, expect } from '@playwright/test'

// The public site, as a visitor who isn't signed in sees it.
test.use({ storageState: { cookies: [], origins: [] } })

test('the landing page leads to how it works, features and contact', async ({ page }) => {
	await page.goto('/')
	await expect(
		page.getByRole('heading', { level: 1, name: 'Fix the take. Keep the moment.' })
	).toBeVisible()
	const nav = page.getByRole('navigation', { name: 'Main' }).first()
	for (const [link, heading] of [
		['How it works', 'From rough take to finished video in four steps'],
		['Features', 'Everything you need to fix a recording'],
		['Contact us', 'Talk to us']
	] as const) {
		await nav.getByRole('link', { name: link }).click()
		// Each page compiles on its first visit to a cold dev server.
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
			timeout: 30_000
		})
	}
	await expect(page.getByRole('link', { name: 'Log in / Sign up' }).first()).toBeVisible()
})

test('dark is the default; the switch turns light on every page, and it is remembered', async ({
	page
}) => {
	const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')
	await page.goto('/')
	expect(await theme()).toBe('dark')
	const toggle = page.getByRole('switch', { name: 'Light mode' })
	await expect(toggle).toHaveAttribute('aria-checked', 'false')
	await toggle.click()
	expect(await theme()).toBe('light')
	await expect(toggle).toHaveAttribute('aria-checked', 'true')
	// The page really is light: the background, not just the attribute.
	const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
	expect(background).toBe('rgb(246, 246, 243)')

	await page.goto('/features')
	expect(await theme()).toBe('light')
	await page.reload()
	expect(await theme()).toBe('light')
	await expect(page.getByRole('switch', { name: 'Light mode' })).toHaveAttribute(
		'aria-checked',
		'true'
	)
	await page.getByRole('switch', { name: 'Light mode' }).click()
	await page.goto('/contact')
	expect(await theme()).toBe('dark')
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
	await page.getByLabel('Name').fill('Sam')
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
