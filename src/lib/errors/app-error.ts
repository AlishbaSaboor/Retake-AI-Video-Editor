type AppErrorOptions = {
	// Technical detail for Sentry/logs, when it's worth more than the user
	// message alone (e.g. "Stripe declined: insufficient_funds" vs. the
	// user-facing "Your card was declined."). Defaults to userMessage.
	message?: string
	status?: number
	code?: string
	cause?: unknown
}

// Throw this for a failure the user did something to cause — a declined
// payment, a plan limit, a taken username — never for a bug. userMessage is
// written for the person seeing it, not for a log line; captureError()/
// captureClientError() read it straight through to the response/UI and
// skip Sentry entirely, since this is normal control flow, not something an
// engineer needs paged for. See docs/rules/error-handling.md.
export class AppError extends Error {
	readonly userMessage: string
	readonly status: number
	readonly code?: string

	constructor(userMessage: string, options: AppErrorOptions = {}) {
		super(options.message ?? userMessage, { cause: options.cause })
		this.name = 'AppError'
		this.userMessage = userMessage
		this.status = options.status ?? 400
		this.code = options.code
	}
}
