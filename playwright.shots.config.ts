import { defineConfig, devices } from '@playwright/test'

// The site's screenshots and before/after videos (e2e/site-shots.ts), taken
// from a running app: `SHOTS_CLIP=<footage> E2E_BASE_URL=<app> pnpm shots`.
// Not a test run: one worker (it records video in real time), no retries.
export default defineConfig({
	testDir: './e2e',
	workers: 1,
	retries: 0,
	timeout: 600_000,
	reporter: 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
		launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
	},
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'shots',
			testMatch: /site-shots\.ts/,
			use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
			dependencies: ['setup']
		}
	]
})
