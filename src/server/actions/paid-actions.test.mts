import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'

// The paid AI actions, run as the server runs them (validatedAction, the
// session check, the AI wrappers, their time limits) with only what can't
// run under `node --test` swapped out: Supabase's cookie client (its answers
// scripted per test), the Gemini SDK and fetch (no real call is ever made),
// the usage sink's database, Sentry, and Next's own runtime. Real Supabase
// sign-in is not covered here.

/** What Supabase's getUser answers, per test: a user, no one, an error, or a throw. */
let session: () => Promise<{
	data: { user: { id: string; email: string } | null }
	error: { name: string } | null
}> = async () => ({ data: { user: null }, error: null })
const SIGNED_IN = async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })

/** The Gemini calls made, each with the signal it was given; how each answers. */
const geminiCalls: Array<{ abortSignal?: AbortSignal }> = []
let geminiAnswer: (signal?: AbortSignal) => Promise<{ text: string }> = async () => ({ text: '{}' })

mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: { createServerSupabaseClient: async () => ({ auth: { getUser: () => session() } }) }
})
mock.module(import.meta.resolve('@/lib/rbac/context'), {
	namedExports: { enforceAuthorize: async () => ({}) }
})
mock.module(import.meta.resolve('@/lib/observability/capture-error'), {
	namedExports: { captureError: (error: unknown) => normalizeError(error) }
})
mock.module(import.meta.resolve('@/lib/env'), {
	namedExports: { env: { GEMINI_API_KEY: 'test-key', DEEPGRAM_API_KEY: 'test-key' } }
})
mock.module(import.meta.resolve('@/server/lib/ai-usage/sink'), {
	namedExports: { trackAiCall: (_context: unknown, call: () => Promise<unknown>) => call() }
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: { log: { warn: () => {}, info: () => {} } }
})
mock.module('@google/genai', {
	namedExports: {
		GoogleGenAI: class {
			models = {
				generateContent: (params: { config?: { abortSignal?: AbortSignal } }) => {
					geminiCalls.push({ abortSignal: params.config?.abortSignal })
					return geminiAnswer(params.config?.abortSignal)
				}
			}
		},
		MediaResolution: { MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM' }
	}
})

/** Deepgram's calls (fetch), each with its signal; how each answers. */
const deepgramCalls: Array<{ signal?: AbortSignal | null }> = []
let deepgramAnswer: (signal?: AbortSignal | null) => Promise<Response> = async () =>
	Response.json({
		metadata: { duration: 1 },
		results: { channels: [{ alternatives: [{ words: [] }] }] }
	})
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
	deepgramCalls.push({ signal: init?.signal })
	return deepgramAnswer(init?.signal)
}) as typeof fetch

// Accounts on, as in production (session.ts reads these).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

const editor = await import('@/app/[locale]/editor/actions')
const make = await import('@/app/[locale]/(app)/make/actions')

const plan = JSON.parse(
	readFileSync(new URL('../../../e2e/fixtures/real-run3-reply.json', import.meta.url), 'utf-8')
)
const sentences = [{ startSeconds: 0, endSeconds: 2, text: 'Hello there.' }]

/** Every paid action, with an input it accepts, and the provider it pays. */
const PAID: Array<{
	name: string
	provider: 'gemini' | 'deepgram'
	call: () => Promise<{ ok: boolean; status?: number; error?: string }>
}> = [
	{
		name: 'parseEditCommand',
		provider: 'gemini',
		call: () =>
			editor.parseEditCommand({ command: 'cut from 1 to 2', durationSeconds: 10, clipCount: 1 })
	},
	{ name: 'findHighlights', provider: 'gemini', call: () => editor.findHighlights({ sentences }) },
	{
		name: 'transcribeTake',
		provider: 'deepgram',
		call: () => editor.transcribeTake({ audioBase64: 'AAAA' })
	},
	{
		name: 'transcribeVoiceCommand',
		provider: 'deepgram',
		call: () => editor.transcribeVoiceCommand({ audioBase64: 'AAAA' })
	},
	{
		name: 'checkMakePlan',
		provider: 'gemini',
		call: () => make.checkMakePlan({ request: 'make a promo ad', planText: 'A promo, 30 s.' })
	},
	{
		name: 'followUpMakeIt',
		provider: 'gemini',
		call: () =>
			make.followUpMakeIt({
				request: 'make a promo ad',
				earlier: [],
				followUp: 'make it shorter',
				answers: [],
				plan,
				durationSeconds: 60,
				editedSeconds: 30,
				sentences
			})
	},
	{
		name: 'planMakeIt',
		provider: 'gemini',
		call: () =>
			make.planMakeIt({
				request: 'make a promo ad',
				answers: [],
				durationSeconds: 60,
				sentences,
				frames: 'AAAA'
			})
	}
]

const calls = (provider: 'gemini' | 'deepgram') =>
	provider === 'gemini' ? geminiCalls.length : deepgramCalls.length

/** Each way of not being signed in, as Supabase reports it (or doesn't). */
const SIGNED_OUT: Array<[string, () => void]> = [
	['no session', () => (session = async () => ({ data: { user: null }, error: null }))],
	[
		'Supabase unreachable',
		() =>
			(session = async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError' } }))
	],
	[
		'the session lookup throws',
		() =>
			(session = async () => {
				throw new Error('fetch failed')
			})
	],
	[
		'a bad session',
		() => (session = async () => ({ data: { user: null }, error: { name: 'AuthApiError' } }))
	]
]

for (const action of PAID) {
	test(`${action.name}: refused when not signed in, however that comes about; never reaches ${action.provider}`, async () => {
		for (const [how, signOut] of SIGNED_OUT) {
			signOut()
			const before = calls(action.provider)
			const result = await action.call()
			assert.deepEqual(result, { ok: false, error: 'Sign in to use this.', status: 401 }, how)
			assert.equal(calls(action.provider), before, `${how}: no ${action.provider} call`)
		}
		// Accounts not set up at all: refused too, not opened up.
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL
		delete process.env.NEXT_PUBLIC_SUPABASE_URL
		session = SIGNED_IN
		const before = calls(action.provider)
		const result = await action.call()
		process.env.NEXT_PUBLIC_SUPABASE_URL = url
		assert.deepEqual(
			result,
			{ ok: false, error: 'Sign in to use this.', status: 401 },
			'accounts off'
		)
		assert.equal(calls(action.provider), before, 'accounts off: no call')
		// Signed in: it reaches the provider.
		session = SIGNED_IN
		await action.call()
		assert.equal(calls(action.provider), before + 1, 'signed in: one call')
	})
}

/**
 * Runs `call` under fake timers, advancing them half a second at a time, and
 * says how long it took to settle (or `ms` + 1 s when it never did).
 */
async function settledAfter(ms: number, call: () => Promise<unknown>) {
	mock.timers.enable({ apis: ['setTimeout'] })
	let settled = false
	const result = call().finally(() => (settled = true))
	let elapsed = 0
	try {
		while (!settled && elapsed <= ms + 1000) {
			await new Promise((resolve) => setImmediate(resolve))
			await new Promise((resolve) => setImmediate(resolve))
			if (settled) break
			mock.timers.tick(500)
			elapsed += 500
		}
		return { elapsed, result: settled ? await result : null }
	} finally {
		mock.timers.reset()
	}
}

/** A provider that never answers until its request is aborted. */
const hangUntilAborted = (signal?: AbortSignal | null) =>
	new Promise<never>((_, reject) =>
		signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
	)

const TIMED: Array<{
	name: string
	provider: 'gemini' | 'deepgram'
	limit: number
	call: () => Promise<unknown>
}> = [
	{ name: 'parseEditCommand', provider: 'gemini', limit: 30_000, call: PAID[0]!.call },
	{ name: 'findHighlights', provider: 'gemini', limit: 60_000, call: PAID[1]!.call },
	{ name: 'transcribeTake', provider: 'deepgram', limit: 60_000, call: PAID[2]!.call },
	{ name: 'transcribeVoiceCommand', provider: 'deepgram', limit: 30_000, call: PAID[3]!.call }
]

for (const action of TIMED) {
	test(`${action.name}: a ${action.provider} call that never answers is given up after ${action.limit / 1000} s, its request aborted`, async () => {
		session = SIGNED_IN
		geminiAnswer = hangUntilAborted
		deepgramAnswer = hangUntilAborted
		const { elapsed, result } = await settledAfter(action.limit, action.call)
		geminiAnswer = async () => ({ text: '{}' })
		deepgramAnswer = async () =>
			Response.json({
				metadata: { duration: 1 },
				results: { channels: [{ alternatives: [{ words: [] }] }] }
			})
		assert.deepEqual(result, {
			ok: false,
			error: "The AI didn't answer in time. Try again in a moment.",
			status: 504
		})
		// At its limit: not before, and not long after.
		assert.ok(
			elapsed >= action.limit && elapsed <= action.limit + 500,
			`settled after ${elapsed} ms`
		)
		const last =
			action.provider === 'gemini' ? geminiCalls.at(-1)?.abortSignal : deepgramCalls.at(-1)?.signal
		assert.equal(last?.aborted, true, 'the request itself was aborted')
	})
}
