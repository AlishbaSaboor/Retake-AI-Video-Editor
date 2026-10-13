import 'server-only'
import { AiKeyMissingError } from '@/lib/ai-failure'
import { DeepgramError } from './deepgram'

// When a paid action fails, whether the daily allowance it took is given
// back (validatedAction). Only when the provider certainly didn't charge:
// a wrong answer here lets a charged call count as free.
//
// | Case                                        | Given back | Why                                                                  |
// | ------------------------------------------- | ---------- | -------------------------------------------------------------------- |
// | The key isn't set                           | Yes        | No request was sent                                                  |
// | The provider answers 4xx                    | Yes        | It refused the request (a refused key, a usage limit, a bad request) |
// | The provider answers 5xx                    | Yes        | It failed the request, so there's no answer to bill                  |
// | It answers 2xx, but the reply can't be used | No         | It answered, so it charged; the fault is in the reply                |
// | Timeout                                     | No         | We stopped waiting; it may still have run and charged                |
// | Anything else (a dropped connection, a bug) | No         | Nothing shows the call was free                                      |
//
// Gemini's SDK throws its ApiError only for a 4xx or 5xx reply, and
// DeepgramError is thrown only for a non-2xx one (deepgram.ts). Gemini's is
// recognised by its name and status rather than its class, so nothing
// outside this folder's wrapper imports the SDK.

const isHttpError = (status: unknown) => typeof status === 'number' && status >= 400 && status < 600

/** One error, without what caused it. */
function refusedItself(error: unknown): boolean {
	if (error instanceof AiKeyMissingError) return true
	if (error instanceof DeepgramError) return isHttpError(error.status)
	return (
		error instanceof Error &&
		error.name === 'ApiError' &&
		isHttpError((error as { status?: unknown }).status)
	)
}

/**
 * Whether a failed provider call certainly wasn't charged: the table above.
 * Follows `cause`, since `rethrowAiError` wraps a refusal in the AppError the
 * person sees.
 */
export function providerDidNotCharge(error: unknown): boolean {
	let current: unknown = error
	for (let depth = 0; depth < 5 && current !== undefined; depth++) {
		if (refusedItself(current)) return true
		current = current instanceof Error ? current.cause : undefined
	}
	return false
}
