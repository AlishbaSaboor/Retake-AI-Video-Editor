import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test as setup, expect } from '@playwright/test'

// The signed-in session every test starts from. With accounts switched on
// (a local Supabase), the editor and the home page ask for a sign-in, so a
// test user signs in once here (signing up the first time) and the session
// is saved for the rest. With accounts off (CI has no Supabase), nothing
// asks, and the saved session is empty.

const SIGNED_IN = 'e2e/.auth/user.json'
const EMAIL = 'e2e@retake.local'
const PASSWORD = 'retake-e2e-password'

setup('sign in', async ({ page }) => {
	await mkdir(dirname(SIGNED_IN), { recursive: true })
	await page.goto('/home')
	if (!new URL(page.url()).pathname.endsWith('/login')) {
		await writeFile(SIGNED_IN, JSON.stringify({ cookies: [], origins: [] }))
		return
	}
	await page.getByLabel('Email').fill(EMAIL)
	await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	// Not any alert: Next's route announcer is one too.
	const refused = page.getByRole('alert').filter({ hasText: 'don’t match an account' })
	await expect(
		page.getByRole('heading', { name: 'What are we making today?' }).or(refused)
	).toBeVisible({
		timeout: 30_000
	})
	if (await refused.isVisible()) {
		await page.getByRole('button', { name: 'Create an account' }).click()
		await page.getByRole('button', { name: 'Create account' }).click()
		await expect(page.getByRole('heading', { name: 'What are we making today?' })).toBeVisible({
			timeout: 30_000
		})
	}
	await page.context().storageState({ path: SIGNED_IN })
})
