import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'

// When a failed paid action gives its daily allowance back: one test per row
// of the table in src/server/ai/not-charged.ts, for each provider, through
// the real action, validatedAction, the real wrappers and their time limits.
// Only what can't run under `node --test` is swapped out: Supabase's session
// (always signed in), the Gemini SDK and fetch (no real call is ever made),
// the usage sink, the allowance table (in memory), Sentry, the logger and
// Next's runtime.

const env: { GEMINI_API_KEY?: string; DEEPGRAM_API_KEY?: string } = {}
const warned: Array<Record<string, unknown>> = []
let geminiAnswer: (signal?: AbortSignal) => Promise<{ text: string }> = async () => ({ text: '{}' })
let deepgramAnswer: (signal?: AbortSignal | null) => Promise<Response> = async () => OK_TRANSCRIPT()
let geminiCalls = 0
let deepgramCalls = 0

const OK_TRANSCRIPT = () =>
	Response.json({
		metadata: { duration: 1 },
		results: { channels: [{ alternatives: [{ words: [] }] }] }
	})

mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: {
		createServerSupabaseClient: async () => ({
			auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }) }
		})
	}
})
mock.module(import.meta.resolve('@/lib/observability/capture-error'), {
	namedExports: { captureError: (error: unknown) => normalizeError(error) }
})
mock.module(import.meta.resolve('@/lib/env'), { namedExports: { env } })
mock.module(import.meta.resolve('@/server/lib/ai-usage/sink'), {
	namedExports: { trackAiCall: (_context: unknown, call: () => Promise<unknown>) => call() }
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: {
		log: {
			warn: (_message: string, fields: Record<string, unknown>) => warned.push(fields),
			info: () => {},
			error: () => {}
		}
	}
})

/** ai_allowances in memory, keyed by user, day and kind. */
const used = new Map<string, number>()
const key = (where: { userId: string; day: Date; kind: string }) =>
	`${where.userId}|${where.day.toISOString()}|${where.kind}`
class UniqueViolation extends Error {
	code = 'P2002'
}
mock.module(import.meta.resolve('@/server/db/client'), {
	namedExports: {
		Prisma: { PrismaClientKnownRequestError: UniqueViolation },
		db: {
			aiAllowance: {
				updateMany: async ({
					where,
					data
				}: {
					where: { userId: string; day: Date; kind: string; used: { lt?: number; gt?: number } }
					data: { used: { increment?: number; decrement?: number } }
				}) => {
					const now = used.get(key(where))
					const matches =
						now !== undefined &&
						(where.used.lt === undefined || now < where.used.lt) &&
						(where.used.gt === undefined || now > where.used.gt)
					if (matches) {
						used.set(key(where), now + (data.used.increment ?? 0) - (data.used.decrement ?? 0))
					}
					return { count: matches ? 1 : 0 }
				},
				create: async ({
					data
				}: {
					data: { userId: string; day: Date; kind: string; used: number }
				}) => {
					if (used.has(key(data))) throw new UniqueViolation('unique')
					used.set(key(data), data.used)
					return data
				}
			}
		}
	}
})
mock.module('@google/genai', {
	namedExports: {
		GoogleGenAI: class {
			models = {
				generateContent: (params: { config?: { abortSignal?: AbortSignal } }) => {
					geminiCalls++
					return geminiAnswer(params.config?.abortSignal)
				}
			}
		},
		MediaResolution: { MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM' }
	}
})
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
	deepgramCalls++
	return deepgramAnswer(init?.signal)
}) as typeof fetch

// Accounts on, as in production (session.ts reads these).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

const editor = await import('@/app/[locale]/editor/actions')
const { utcDay } = await import('@/server/lib/ai-allowance')
const { AI_UNAVAILABLE } = await import('@/server/lib/ai-busy')

/** Gemini's SDK error for a 4xx or 5xx reply: an ApiError with its status. */
const geminiHttpError = (status: number) =>
	Object.assign(new Error(`{"error":{"code":${status}}}`), { name: 'ApiError', status })

/** A provider that never answers until its request is aborted. */
const hangUntilAborted = (signal?: AbortSignal | null) =>
	new Promise<never>((_, reject) =>
		signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
	)

type Result = { ok: boolean; status?: number; error?: string }
const PROVIDERS = {
	gemini: {
		kind: 'command',
		limitMs: 30_000,
		call: () =>
			editor.parseEditCommand({
				command: 'cut from 1 to 2',
				durationSeconds: 10,
				clipCount: 1
			}) as Promise<Result>,
		calls: () => geminiCalls
	},
	deepgram: {
		kind: 'transcript',
		limitMs: 60_000,
		call: () => editor.transcribeTake({ audioBase64: 'AAAA' }) as Promise<Result>,
		calls: () => deepgramCalls
	}
} as const

/** A fresh day: keys set, providers answering, nothing used, nothing logged. */
function reset() {
	env.GEMINI_API_KEY = 'test-key'
	env.DEEPGRAM_API_KEY = 'test-key'
	geminiAnswer = async () => ({ text: '{}' })
	deepgramAnswer = async () => OK_TRANSCRIPT()
	used.clear()
	warned.length = 0
}
const usedToday = (kind: string) => used.get(`u1|${utcDay(new Date()).toISOString()}|${kind}`) ?? 0

/** Runs `call` under fake timers, advancing them until it settles. */
async function underFakeTimers(limitMs: number, call: () => Promise<Result>): Promise<Result> {
	mock.timers.enable({ apis: ['setTimeout'] })
	let settled = false
	const result = call().finally(() => (settled = true))
	try {
		for (let elapsed = 0; !settled && elapsed <= limitMs + 1000; elapsed += 500) {
			await new Promise((resolve) => setImmediate(resolve))
			await new Promise((resolve) => setImmediate(resolve))
			if (!settled) mock.timers.tick(500)
		}
		return await result
	} finally {
		mock.timers.reset()
	}
}

test('the key is not set: no request is sent, the person sees the generic message, the log names the setting, and the allowance is given back', async () => {
	for (const [name, provider] of Object.entries(PROVIDERS)) {
		reset()
		const setting = name === 'gemini' ? 'GEMINI_API_KEY' : 'DEEPGRAM_API_KEY'
		env[setting] = ''
		const before = provider.calls()
		const result = await provider.call()
		assert.deepEqual(result, { ok: false, error: AI_UNAVAILABLE, status: 401 }, name)
		assert.equal(provider.calls(), before, `${name}: nothing sent`)
		assert.equal(usedToday(provider.kind), 0, `${name}: given back`)
		assert.deepEqual(
			warned,
			[
				{
					provider: name,
					feature: name === 'gemini' ? 'parse_edit_command' : 'transcribe_take',
					failure: 'key',
					status: 401,
					setting
				}
			],
			name
		)
		// Never a key's value, in what's shown or what's logged.
		assert.doesNotMatch(JSON.stringify({ result, warned }), /test-key/, name)
	}
})

test('the provider answers 4xx: it refused the request, so the allowance is given back', async () => {
	reset()
	geminiAnswer = async () => {
		throw geminiHttpError(400)
	}
	assert.equal((await PROVIDERS.gemini.call()).ok, false)
	assert.equal(usedToday('command'), 0, 'gemini')
	deepgramAnswer = async () => new Response('bad request', { status: 400 })
	assert.equal((await PROVIDERS.deepgram.call()).ok, false)
	assert.equal(usedToday('transcript'), 0, 'deepgram')
	// A refused key and a usage limit are 4xx too, shown with the plain message.
	reset()
	geminiAnswer = async () => {
		throw geminiHttpError(429)
	}
	assert.deepEqual(await PROVIDERS.gemini.call(), { ok: false, error: AI_UNAVAILABLE, status: 429 })
	assert.equal(usedToday('command'), 0, 'gemini quota')
})

test('the provider answers 5xx: it failed the request, so the allowance is given back', async () => {
	reset()
	geminiAnswer = async () => {
		throw geminiHttpError(500)
	}
	assert.equal((await PROVIDERS.gemini.call()).ok, false)
	assert.equal(usedToday('command'), 0, 'gemini 500')
	geminiAnswer = async () => {
		throw geminiHttpError(503)
	}
	assert.equal((await PROVIDERS.gemini.call()).status, 503)
	assert.equal(usedToday('command'), 0, 'gemini 503')
	deepgramAnswer = async () => new Response('busy', { status: 500 })
	assert.equal((await PROVIDERS.deepgram.call()).ok, false)
	assert.equal(usedToday('transcript'), 0, 'deepgram 500')
})

test('the provider answers 2xx but the reply is bad: it answered, so the allowance stays used', async () => {
	reset()
	// Gemini's text isn't JSON: the action answers "unsupported".
	geminiAnswer = async () => ({ text: 'not json' })
	assert.equal((await PROVIDERS.gemini.call()).ok, true)
	assert.equal(usedToday('command'), 1, 'gemini')
	// Deepgram's body isn't a transcript: the wrapper's own check fails.
	deepgramAnswer = async () => Response.json({ unexpected: true })
	assert.equal((await PROVIDERS.deepgram.call()).ok, false)
	assert.equal(usedToday('transcript'), 1, 'deepgram')
})

test('a timeout: we stopped waiting and the provider may still have charged, so the allowance stays used', async () => {
	for (const [name, provider] of Object.entries(PROVIDERS)) {
		reset()
		geminiAnswer = hangUntilAborted
		deepgramAnswer = hangUntilAborted
		const result = await underFakeTimers(provider.limitMs, provider.call)
		assert.equal(result.status, 504, name)
		assert.equal(usedToday(provider.kind), 1, name)
	}
})

test('anything else (a dropped connection, a bug): nothing shows it was free, so the allowance stays used', async () => {
	reset()
	geminiAnswer = async () => {
		throw new TypeError('fetch failed')
	}
	assert.equal((await PROVIDERS.gemini.call()).ok, false)
	assert.equal(usedToday('command'), 1, 'gemini')
	deepgramAnswer = async () => {
		throw new TypeError('fetch failed')
	}
	assert.equal((await PROVIDERS.deepgram.call()).ok, false)
	assert.equal(usedToday('transcript'), 1, 'deepgram')
})
