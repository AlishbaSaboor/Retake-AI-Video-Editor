import { z } from 'zod'
import { AppError } from './app-error'

const GENERIC_USER_MESSAGE =
	"Something went wrong on our end. We've been notified — please try again in a moment."

export type NormalizedError = {
	// Always safe to show a user as-is — never the raw error.
	userMessage: string
	status: number
	// AppError and bad input are normal application flow, not bugs — see
	// captureError()/captureClientError(), which only report !isExpected
	// errors to Sentry.
	isExpected: boolean
}

// Pure classification, no Sentry/PostHog side effects — kept separate so
// both the server (capture-error.ts) and client (capture-client-error.ts)
// reporting helpers can share the exact same rules without either one
// importing the other's vendor SDK.
export function normalizeError(error: unknown): NormalizedError {
	if (error instanceof AppError) {
		return { userMessage: error.userMessage, status: error.status, isExpected: true }
	}
	if (error instanceof z.ZodError) {
		return {
			userMessage: 'Invalid request — check what you submitted and try again.',
			status: 400,
			isExpected: true
		}
	}
	return { userMessage: GENERIC_USER_MESSAGE, status: 500, isExpected: false }
}

// A short, non-PII category for an error — used as the error_type property on
// the analytics error_shown event (docs/rules/analytics.md). An AppError's
// code when it has one, otherwise the error's class name; never the message,
// which is free text and possibly PII (rule 5).
export function errorType(error: unknown): string {
	if (error instanceof AppError) return error.code ?? error.name
	if (error instanceof z.ZodError) return 'validation_error'
	if (error instanceof Error) return error.name
	return 'unknown'
}
