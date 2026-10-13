import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import { AI_FAILURE_STATUS, aiFailureOf, type AiFailure } from '@/lib/ai-failure'
import { log } from '@/server/lib/logger'

// An AI call that failed in a known way (a timeout, a busy provider, a
// refused key, a provider's usage limit) comes back as an AppError with a
// plain message (shown on the page) and is logged here, by kind; never its
// raw text. A refused key or a provider's usage limit is the server's
// problem, not the person's: they see one generic message, and the detail
// (which provider, which setting to check) goes to the log only, never a
// key's value. Anything else is rethrown untouched: a bug, reported as one
// by the action's own error handling.

type Provider = 'gemini' | 'deepgram'

const KEY_SETTING: Record<Provider, string> = {
	gemini: 'GEMINI_API_KEY',
	deepgram: 'DEEPGRAM_API_KEY'
}

/** What the person sees for a refused key or a provider's usage limit: nothing about the server's setup. */
export const AI_UNAVAILABLE = "The AI isn't available right now. Try again later."

/** The plain message for each kind of failure, as shown on the page. */
export function aiFailureMessage(failure: AiFailure): string {
	switch (failure) {
		case 'timeout':
			return "The AI didn't answer in time. Try again in a moment."
		case 'busy':
			return 'The AI is busy right now. Try again in a moment.'
		case 'key':
		case 'quota':
			return AI_UNAVAILABLE
	}
}

/** A catch for an AI call: `.catch(rethrowAiError('gemini', 'make_it'))`. */
export function rethrowAiError(provider: Provider, feature: string) {
	return (error: unknown): never => {
		const failure = aiFailureOf(error)
		if (!failure) throw error
		const status = AI_FAILURE_STATUS[failure]
		// A refused key or a usage limit is the server's setup: the setting to check is named, its value never.
		const setup = failure === 'key' || failure === 'quota'
		log.warn('AI call failed', {
			provider,
			feature,
			failure,
			status,
			...(setup && { setting: KEY_SETTING[provider] })
		})
		// The provider's error as the cause: whether the allowance comes back depends on it.
		throw new AppError(aiFailureMessage(failure), { status, cause: error })
	}
}
