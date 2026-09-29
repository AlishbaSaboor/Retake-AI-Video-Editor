import * as Sentry from '@sentry/nextjs'

// Sentry's remit vs. the logger's: docs/rules/logging.md.
Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
	tracesSampleRate: 0.1,
	enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
})
