import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_AI_LIMITS, type AiAllowanceKind } from '@/lib/ai-limits'
import { normalizeError } from '@/lib/errors/normalize-error'

// The paid AI actions, run as the server runs them (validatedAction, the
// session check, the AI wrappers, their time limits) with only what can't
// run under `node --test` swapped out: Supabase's cookie client (its answers
// scripted per test), the Gemini SDK and fetch (no real call is ever made),
// the usage sink's database, the allowance table (kept in memory below),
// Sentry, and Next's own runtime. Real Supabase sign-in, and Postgres itself,
// are not covered here.

/** What Supabase's getUser answers, per test: a user, no one, an error, or a throw. */
let session: () => Promise<{
	data: { user: { id: string; email: string } | null }
	error: { name: string } | null
}> = async () => ({ data: { user: null }, error: null })
const SIGNED_IN = async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })

/** The Gemini calls made, each with the signal it was given and what it sent; how each answers. */
const geminiCalls: Array<{
	abortSignal?: AbortSignal
	contents?: unknown
	systemInstruction?: unknown
}> = []
let geminiAnswer: (signal?: AbortSignal) => Promise<{ text: string }> = async () => ({ text: '{}' })

mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: { createServerSupabaseClient: async () => ({ auth: { getUser: () => session() } }) }
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
/**
 * ai_allowances, in memory, answering the calls the allowance makes. Each
 * call pauses as a database round trip does, so simultaneous requests
 * interleave between them; a single conditional update applies at once, as
 * Postgres applies it under its row lock.
 */
type AllowanceRow = { userId: string; day: Date; kind: string; used: number }
const allowances = new Map<string, AllowanceRow>()
const allowanceKey = (where: { userId: string; day: Date; kind: string }) =>
	`${where.userId}|${where.day.toISOString()}|${where.kind}`
const roundTrip = () => new Promise((resolve) => setImmediate(resolve))
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
					await roundTrip()
					const row = allowances.get(allowanceKey(where))
					const matches =
						row !== undefined &&
						(where.used.lt === undefined || row.used < where.used.lt) &&
						(where.used.gt === undefined || row.used > where.used.gt)
					if (matches) row.used += (data.used.increment ?? 0) - (data.used.decrement ?? 0)
					return { count: matches ? 1 : 0 }
				},
				findUnique: async ({
					where
				}: {
					where: { userId_day_kind: { userId: string; day: Date; kind: string } }
				}) => {
					await roundTrip()
					const row = allowances.get(allowanceKey(where.userId_day_kind))
					return row ? { ...row } : null
				},
				create: async ({ data }: { data: AllowanceRow }) => {
					await roundTrip()
					if (allowances.has(allowanceKey(data))) throw new UniqueViolation('unique')
					allowances.set(allowanceKey(data), { ...data })
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
				generateContent: (params: {
					contents?: unknown
					config?: { abortSignal?: AbortSignal; systemInstruction?: unknown }
				}) => {
					geminiCalls.push({
						abortSignal: params.config?.abortSignal,
						contents: params.contents,
						systemInstruction: params.config?.systemInstruction
					})
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

// The daily allowance (src/lib/ai-limits.ts): checked and counted after the
// sign-in check, before the provider is called.

const KINDS: Record<string, AiAllowanceKind> = {
	parseEditCommand: 'command',
	findHighlights: 'highlights',
	transcribeTake: 'transcript',
	transcribeVoiceCommand: 'voice',
	checkMakePlan: 'make_it',
	followUpMakeIt: 'make_it',
	planMakeIt: 'make_it'
}
const TODAY = Date.parse('2026-10-11T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const used = (kind: AiAllowanceKind, at: number) =>
	allowances.get(allowanceKey({ userId: 'u1', day: new Date(at - (at % DAY)), kind }))?.used ?? 0
const setUsed = (kind: AiAllowanceKind, count: number, at: number) =>
	allowances.set(allowanceKey({ userId: 'u1', day: new Date(at - (at % DAY)), kind }), {
		userId: 'u1',
		day: new Date(at - (at % DAY)),
		kind,
		used: count
	})

for (const action of PAID) {
	const kind = KINDS[action.name] as AiAllowanceKind
	const { perDay, what } = DAILY_AI_LIMITS[kind]
	test(`${action.name}: counted under its daily ${what} limit (${perDay}); refused at it, plainly, with no ${action.provider} call; allowed again the next day`, async () => {
		session = SIGNED_IN
		allowances.clear()
		mock.timers.enable({ apis: ['Date'], now: TODAY })
		try {
			// One short of the ceiling: this call reaches the provider and is counted.
			setUsed(kind, perDay - 1, TODAY)
			const before = calls(action.provider)
			const under = await action.call()
			assert.notEqual(under.status, 429)
			assert.equal(calls(action.provider), before + 1, 'reached the provider')
			assert.equal(used(kind, TODAY), perDay, 'counted')
			// At the ceiling: refused with when it resets, and no provider call.
			const at = await action.call()
			assert.deepEqual(at, {
				ok: false,
				error: `You've used today's ${perDay} ${what}. They reset at midnight UTC, in 14 h 0 min.`,
				status: 429
			})
			assert.equal(calls(action.provider), before + 1, 'no provider call')
			assert.equal(used(kind, TODAY), perDay, 'not counted past the ceiling')
			// The next UTC day: allowed again, counted afresh.
			mock.timers.tick(14 * 60 * 60 * 1000)
			const next = await action.call()
			assert.notEqual(next.status, 429)
			assert.equal(calls(action.provider), before + 2)
			assert.equal(used(kind, TODAY + DAY), 1)
		} finally {
			mock.timers.reset()
		}
	})
}

test('simultaneous requests can never take more than the ceiling', async () => {
	session = SIGNED_IN
	allowances.clear()
	mock.timers.enable({ apis: ['Date'], now: TODAY })
	try {
		// 10 left of the typed-command allowance, and 50 at once; then a fresh day's first 20 at once.
		setUsed('command', DAILY_AI_LIMITS.command.perDay - 10, TODAY)
		const before = calls('gemini')
		const results = await Promise.all(Array.from({ length: 50 }, () => PAID[0]!.call()))
		assert.equal(results.filter((result) => result.ok).length, 10)
		assert.equal(results.filter((result) => result.status === 429).length, 40)
		assert.equal(calls('gemini'), before + 10)
		assert.equal(used('command', TODAY), DAILY_AI_LIMITS.command.perDay)
		allowances.clear()
		const first = await Promise.all(Array.from({ length: 20 }, () => PAID[0]!.call()))
		assert.ok(first.every((result) => result.ok))
		assert.equal(used('command', TODAY), 20, 'every first-of-the-day request counted once')
	} finally {
		mock.timers.reset()
	}
})

test('a provider that refuses gives the call back; one that answers, even unusably, or times out, counts', async () => {
	session = SIGNED_IN
	allowances.clear()
	const today = Date.now()
	// Deepgram refuses (a 500): the transcript is given back.
	deepgramAnswer = async () => new Response('busy', { status: 500 })
	const failed = await PAID[2]!.call()
	assert.equal(failed.ok, false)
	assert.equal(used('transcript', today), 0)
	// Gemini never answers: given up at its limit, and kept used (it may still have run and been charged).
	geminiAnswer = hangUntilAborted
	const { result } = await settledAfter(30_000, PAID[0]!.call)
	assert.equal((result as { status?: number }).status, 504)
	assert.equal(used('command', today), 1)
	// Gemini answers with something unusable: the provider was paid, so it counts.
	geminiAnswer = async () => ({ text: 'not json' })
	const answered = await PAID[0]!.call()
	assert.equal(answered.ok, true)
	assert.equal(used('command', today), 2)
	geminiAnswer = async () => ({ text: '{}' })
	deepgramAnswer = async () =>
		Response.json({
			metadata: { duration: 1 },
			results: { channels: [{ alternatives: [{ words: [] }] }] }
		})
})

// Make it's request: up to 1,000 characters (a whole brief), sent as the
// user's text in the contents, never in the instruction; the quick questions'
// answers with it. A follow-up's own text keeps its 300.

const BRIEF = 'b'.repeat(1000)
const CHOICES = {
	kind: 'ad' as const,
	adShape: 'vertical' as const,
	voice: null,
	music: null,
	tone: 'energetic',
	callToAction: 'Follow for more',
	asked: ['kind' as const, 'adShape' as const, 'tone' as const, 'callToAction' as const]
}
const sent = () => JSON.stringify(geminiCalls.at(-1)?.contents)
const instruction = () => String(geminiCalls.at(-1)?.systemInstruction)

test('planMakeIt and checkMakePlan take a 1,000-character request, as text with the answers, and refuse 1,001 before any call', async () => {
	session = SIGNED_IN
	allowances.clear()
	const before = geminiCalls.length
	const planned = await make.planMakeIt({
		request: BRIEF,
		choices: CHOICES,
		answers: [],
		durationSeconds: 60,
		sentences,
		frames: 'AAAA'
	})
	assert.equal(planned.ok, true)
	assert.ok(sent().includes(`Request: ${BRIEF}`))
	assert.ok(
		sent().includes(
			'Chosen by the user: An ad. Vertical. Tone: energetic. Call to action: Follow for more.'
		)
	)
	assert.ok(!instruction().includes(BRIEF), 'the request is never in the instruction')
	assert.ok(!instruction().includes('Follow for more'), 'nor an answer')
	const checked = await make.checkMakePlan({
		request: BRIEF,
		choices: CHOICES,
		planText: 'A promo, 30 s.'
	})
	assert.equal(checked.ok, true)
	assert.ok(sent().includes(`Request: ${BRIEF}`) && sent().includes('Chosen by the user: An ad.'))
	assert.ok(!instruction().includes(BRIEF))
	assert.equal(geminiCalls.length, before + 2)

	const tooLong = `${BRIEF}b`
	for (const result of [
		await make.planMakeIt({
			request: tooLong,
			answers: [],
			durationSeconds: 60,
			sentences,
			frames: 'AAAA'
		}),
		await make.checkMakePlan({ request: tooLong, planText: 'A promo, 30 s.' })
	]) {
		assert.equal(result.ok, false)
		assert.equal(result.status, 400)
	}
	assert.equal(geminiCalls.length, before + 2, 'no call for a request too long')
})

test('followUpMakeIt carries a 1,000-character original request; a follow-up itself stays under 300', async () => {
	session = SIGNED_IN
	allowances.clear()
	const followUp = (fields: { earlier?: string[]; followUp?: string }) =>
		make.followUpMakeIt({
			request: BRIEF,
			choices: CHOICES,
			earlier: fields.earlier ?? [],
			followUp: fields.followUp ?? 'make it shorter',
			answers: [],
			plan,
			durationSeconds: 60,
			editedSeconds: 30,
			sentences
		})
	const before = geminiCalls.length
	const ok = await followUp({ earlier: ['e'.repeat(300)], followUp: 'f'.repeat(300) })
	assert.equal(ok.ok, true)
	assert.ok(sent().includes(`Request: ${BRIEF}`) && sent().includes('Chosen by the user: An ad.'))
	assert.ok(!instruction().includes(BRIEF))
	for (const fields of [{ followUp: 'f'.repeat(301) }, { earlier: ['e'.repeat(301)] }]) {
		const refused = await followUp(fields)
		assert.equal(refused.ok, false)
		assert.equal(refused.status, 400)
	}
	assert.equal(geminiCalls.length, before + 1, 'no call for a follow-up too long')
})
