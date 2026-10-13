import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { TimeoutError } from '@/lib/with-timeout'

// What the logger is given, to check what reaches the log.
const logged: Array<{ message: string; fields: Record<string, unknown> }> = []
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: {
		log: {
			warn: (message: string, fields: Record<string, unknown>) => logged.push({ message, fields }),
			info: () => {},
			error: () => {}
		}
	}
})
const { AI_UNAVAILABLE, aiFailureMessage, rethrowAiError } = await import('./ai-busy')
const { AppError } = await import('@/lib/errors/app-error')

/** An SDK error as each provider throws it: a status and a message. */
const providerError = (status: number, message = '') =>
	Object.assign(new Error(message), { status })
const FAILURES = {
	key: providerError(400, 'API key not valid. Please pass a valid API key.'),
	quota: providerError(429, 'Resource has been exhausted'),
	busy: providerError(503, 'The model is overloaded'),
	timeout: new TimeoutError(30_000)
} as const

/** What a person sees: the AppError's message, thrown by the catch. */
function shown(
	provider: 'gemini' | 'deepgram',
	error: unknown
): { message: string; status: number } {
	try {
		rethrowAiError(provider, 'make_it')(error)
	} catch (thrown) {
		assert.ok(thrown instanceof AppError)
		return { message: thrown.message, status: thrown.status }
	}
	assert.fail('expected a throw')
}

test('a refused key or a provider usage limit shows one generic message; timeout and busy keep theirs', () => {
	for (const provider of ['gemini', 'deepgram'] as const) {
		assert.deepEqual(shown(provider, FAILURES.key), { message: AI_UNAVAILABLE, status: 401 })
		assert.deepEqual(shown(provider, FAILURES.quota), { message: AI_UNAVAILABLE, status: 429 })
		assert.deepEqual(shown(provider, FAILURES.busy), {
			message: 'The AI is busy right now. Try again in a moment.',
			status: 503
		})
		assert.deepEqual(shown(provider, FAILURES.timeout), {
			message: "The AI didn't answer in time. Try again in a moment.",
			status: 504
		})
	}
	assert.equal(AI_UNAVAILABLE, "The AI isn't available right now. Try again later.")
})

test('the text a person sees never mentions .env, an API key, or a setting name', () => {
	const forbidden = [/\.env/i, /api key/i, /GEMINI_API_KEY/, /DEEPGRAM_API_KEY/, /_API_KEY/]
	for (const failure of ['timeout', 'busy', 'key', 'quota'] as const) {
		for (const pattern of forbidden) {
			assert.doesNotMatch(aiFailureMessage(failure), pattern, failure)
		}
	}
	for (const provider of ['gemini', 'deepgram'] as const) {
		for (const error of Object.values(FAILURES)) {
			for (const pattern of forbidden) assert.doesNotMatch(shown(provider, error).message, pattern)
		}
	}
})

test('the detail goes to the log: provider, failure and the setting to check, never a key value', () => {
	logged.length = 0
	shown('gemini', FAILURES.key)
	shown('deepgram', FAILURES.quota)
	shown('gemini', FAILURES.busy)
	assert.deepEqual(
		logged.map(({ message, fields }) => ({ message, ...fields })),
		[
			{
				message: 'AI call failed',
				provider: 'gemini',
				feature: 'make_it',
				failure: 'key',
				status: 401,
				setting: 'GEMINI_API_KEY'
			},
			{
				message: 'AI call failed',
				provider: 'deepgram',
				feature: 'make_it',
				failure: 'quota',
				status: 429,
				setting: 'DEEPGRAM_API_KEY'
			},
			// A busy provider isn't the server's setup: no setting named.
			{
				message: 'AI call failed',
				provider: 'gemini',
				feature: 'make_it',
				failure: 'busy',
				status: 503
			}
		]
	)
	// Nothing logged carries a provider's raw message (where a key could appear).
	for (const { fields } of logged) {
		assert.ok(
			!Object.values(fields).some((v) => typeof v === 'string' && /valid API key|exhausted/.test(v))
		)
	}
})

test('anything that is not a known AI failure is rethrown untouched', () => {
	const bug = new TypeError('a bug')
	assert.throws(
		() => rethrowAiError('gemini', 'make_it')(bug),
		(thrown) => thrown === bug
	)
})
