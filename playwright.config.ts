import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	// A cold run compiles routes on demand per worker, which can take longer
	// than Playwright's 30s default before anything is warm — an expiry there
	// reads as a spurious failure rather than a real one.
	timeout: 60_000,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Boots the app itself for local runs; CI (and any review skill running
	// against an already-live URL via E2E_BASE_URL) should skip this by
	// setting E2E_BASE_URL and leaving webServer unused — see
	// .claude/skills/e2e-review/SKILL.md.
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: 'pnpm dev',
				url: 'http://localhost:3000',
				reuseExistingServer: !process.env.CI,
				timeout: 60_000
			}
})
