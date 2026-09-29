import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'
import { errorType, normalizeError, type NormalizedError } from '@/lib/errors/normalize-error'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

// Client-side counterpart to capture-error.ts — same job, but posthog-js
// instead of posthog-node so this never pulls server-only code into the
// client bundle. Call this from error boundaries and client-side catch
// blocks; never call Sentry.captureException directly (see
// docs/rules/error-handling.md).
export function captureClientError(
	error: unknown,
	context?: Record<string, unknown>
): NormalizedError {
	const normalized = normalizeError(error)

	if (!normalized.isExpected) {
		Sentry.captureException(error, { extra: context })
	}

	try {
		posthog.captureException(error, context)
		// The taxonomy's user-facing signal: an error actually reached the UI.
		// error_type is a category, never the raw message (rule 5). This is the
		// only place error_shown is emitted client-side — don't fire it by hand.
		posthog.capture(ANALYTICS_EVENTS.ERROR_SHOWN, {
			error_type: errorType(error),
			status: normalized.status,
			is_expected: normalized.isExpected,
			timestamp_utc: new Date().toISOString()
		})
	} catch {
		// Analytics can never break the error UI it's reporting from.
	}

	return normalized
}
