import { test, expect } from '@playwright/test'

// Delete this once the project has real flows — it exists only to prove
// the App Router + i18n + Tailwind wiring actually works, and to give
// .claude/skills/e2e-review something real to run against a fresh clone.
test('root serves the default locale unprefixed and renders', async ({ page }) => {
	const response = await page.goto('/')
	expect(new URL(response?.url() ?? '').pathname).toBe('/')
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

	await page.goto('/en')
	expect(new URL(page.url()).pathname).toBe('/')
})
