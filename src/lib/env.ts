import { z } from 'zod'

// Single source of truth for every environment variable the app reads.
// Fails fast at boot with a clear message instead of a runtime `undefined`
// surfacing three layers deep. Keep this in sync with .env.example —
// `pnpm check:env` (scripts/check-env-vars.mjs) fails CI if a
// process.env reference exists in code without a matching entry here.
const envSchema = z.object({
	DATABASE_URL: z.string().url(),
	// Only read by the Prisma CLI (`migrate dev`/`migrate deploy`), never by
	// the running app — so it's required in CI/local dev (where migrations
	// run) but optional here, or every Vercel deployment would be forced to
	// configure a variable the deployed app never actually uses.
	DIRECT_URL: z.string().url().optional(),

	// Optional so a landing-page clone (no accounts, see docs/rules/auth.md)
	// boots without them — proxy.ts and the Supabase clients themselves
	// no-op or fail open when these aren't set, never crash the app.
	NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().or(z.literal('')),
	SUPABASE_SECRET_KEY: z.string().optional(),

	// Minimum severity the server logger emits (docs/rules/logging.md).
	// Validated here so a typo fails the boot loudly, but the logger reads
	// `process.env.LOG_LEVEL` directly (not `env.LOG_LEVEL`) so it can report a
	// bad boot before this schema has run. Defaults to `info`, or `silent`
	// under NODE_ENV=test.
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),

	NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
	SENTRY_ORG: z.string().optional(),
	SENTRY_PROJECT: z.string().optional(),

	NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().or(z.literal('')),
	NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default('https://us.i.posthog.com'),
	POSTHOG_PERSONAL_API_KEY: z.string().optional(),

	// Optional — captureError() no-ops on Slack alerting entirely without
	// this. See docs/rules/error-handling.md.
	SLACK_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),

	NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('en'),

	// Required by cron routes only; an unset secret must not break unrelated pages.
	CRON_SECRET: z.string().optional(),

	NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

	// Attached as the app_version property on every analytics event — optional,
	// events just omit it when unset. See docs/rules/analytics.md.
	NEXT_PUBLIC_APP_VERSION: z.string().optional().or(z.literal(''))
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
	const parsed = envSchema.safeParse(process.env)
	if (!parsed.success) {
		console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
		throw new Error('Invalid environment variables — see console output above')
	}
	return parsed.data
}

export const env = loadEnv()
