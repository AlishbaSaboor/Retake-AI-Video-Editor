import { test, expect } from '@playwright/test'

// The quickest end-to-end check: the App Router, i18n and Tailwind wiring
// work on a fresh clone.
test('root serves the default locale unprefixed and renders', async ({ page }) => {
	const response = await page.goto('/')
	expect(new URL(response?.url() ?? '').pathname).toBe('/')
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

	await page.goto('/en')
	expect(new URL(page.url()).pathname).toBe('/')
})
