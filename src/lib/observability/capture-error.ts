import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { getPostHogServerClient } from '@/lib/posthog/server'
import { errorType, normalizeError, type NormalizedError } from '@/lib/errors/normalize-error'
import { notifyUnexpectedError } from '@/lib/notifications/slack'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

// The one place server-side code reports an error — route handlers, server
// actions, cron jobs. Never call Sentry.captureException or console.error
// directly (see docs/rules/error-handling.md and docs/rules/code-quality.md's
// Logging section). Returns a normalized result so the caller has a safe
// userMessage/status to respond with in the same call.
export function captureError(error: unknown, context?: Record<string, unknown>): NormalizedError {
	const normalized = normalizeError(error)

	// Expected errors (AppError, bad input) are normal control flow, not
	// bugs — Sentry (and Slack) stay reserved for what an engineer actually
	// needs to fix, not for every guard rail doing its job.
	if (!normalized.isExpected) {
		Sentry.captureException(error, { extra: context })
		// Production-only so local/preview noise doesn't page anyone; no-ops
		// on its own until SLACK_ALERT_WEBHOOK_URL is set.
		if (process.env.NODE_ENV === 'production') {
			notifyUnexpectedError(error, context)
		}
	}

	try {
		getPostHogServerClient()?.captureException(error, undefined, context)
		// error_shown needs a distinctId to attach to a person. Server errors
		// often have none (a cron job, an unauthenticated request), so it's only
		// emitted when the caller passes a distinctId/userId in context — pass
		// one to link the error to the user who saw it. error_type is a category,
		// never the raw message (rule 5).
		const distinctId =
			typeof context?.distinctId === 'string'
				? context.distinctId
				: typeof context?.userId === 'string'
					? context.userId
					: undefined
		if (distinctId != null) {
			getPostHogServerClient()?.capture({
				distinctId,
				event: ANALYTICS_EVENTS.ERROR_SHOWN,
				properties: {
					error_type: errorType(error),
					status: normalized.status,
					is_expected: normalized.isExpected,
					timestamp_utc: new Date().toISOString()
				}
			})
		}
	} catch {
		// Analytics can never break the response it's reporting from.
	}

	return normalized
}
