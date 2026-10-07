import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import { AI_FAILURE_STATUS, aiFailureOf, type AiFailure } from '@/lib/ai-failure'
import { log } from '@/server/lib/logger'

// An AI call that failed in a way the person can act on comes back as an
// AppError with a plain message (shown on the page) and is logged here, by
// kind; never its raw text. Anything else is rethrown untouched: a bug,
// reported as one by the action's own error handling.

type Provider = 'gemini' | 'deepgram'

const KEY_SETTING: Record<Provider, string> = {
	gemini: 'GEMINI_API_KEY',
	deepgram: 'DEEPGRAM_API_KEY'
}
const NAME: Record<Provider, string> = { gemini: 'Gemini', deepgram: 'Deepgram' }

function message(failure: AiFailure, provider: Provider): string {
	switch (failure) {
		case 'timeout':
			return "The AI didn't answer in time. Try again in a moment."
		case 'key':
			return `The ${NAME[provider]} API key was refused. Check ${KEY_SETTING[provider]} in .env.local, then try again.`
		case 'quota':
			return `The ${NAME[provider]} usage limit has been reached. Wait a minute and try again; if it keeps happening, check the key's quota.`
		case 'busy':
			return 'The AI is busy right now. Try again in a moment.'
	}
}

/** A catch for an AI call: `.catch(rethrowAiError('gemini', 'make_it'))`. */
export function rethrowAiError(provider: Provider, feature: string) {
	return (error: unknown): never => {
		const failure = aiFailureOf(error)
		if (!failure) throw error
		log.warn('AI call failed', { provider, feature, failure, status: AI_FAILURE_STATUS[failure] })
		throw new AppError(message(failure, provider), { status: AI_FAILURE_STATUS[failure] })
	}
}
