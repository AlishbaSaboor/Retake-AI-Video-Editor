import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	// Editor tests record real-time video in the browser. With one browser per
	// core, the canvas recorders starve each other and produce clips with no
	// frames; four in parallel keeps recordings intact. CI runs one at a time
	// instead, the suite split across four runners (.github/workflows/ci.yml):
	// its exports and playback checks are timed, and four at once on one
	// runner made a different one fail each run.
	workers: 4,
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
	// Every test starts signed in (e2e/auth.setup.ts); a test of the signed-out
	// site clears it with test.use({ storageState: { cookies: [], origins: [] } }).
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
			dependencies: ['setup']
		}
	],
	// Boots the app itself for local runs; CI (and any review skill running
	// against an already-live URL via E2E_BASE_URL) should skip this by
	// setting E2E_BASE_URL and leaving webServer unused — see
	// .claude/skills/e2e-review/SKILL.md.
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: 'pnpm dev',
				url: 'http://localhost:3000',
				// A reused dev server keeps the messages/*.json it started with — restart
				// it after editing them, or new strings render as their raw keys.
				reuseExistingServer: !process.env.CI,
				timeout: 60_000
			}
})
