import { readdirSync, readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'

// Each Gemini call's output cap, run through the real wrapper and the real
// actions with only what can't run under `node --test` swapped out: the
// Gemini SDK (no real call is ever made), Supabase's session (signed in),
// the allowance table (always room), the usage sink, the logger (kept, to
// read), Sentry and Next's own runtime.

/** What each Gemini call was sent: its output cap. How the next one answers. */
const sent: Array<{ maxOutputTokens?: number }> = []
let answer: () => { text: string; candidates?: Array<{ finishReason: string }> } = () => ({
	text: '{}'
})
/** The feature each tracked call was for, in order. */
const tracked: string[] = []
/** What reached the logger at warn level. */
const warned: Array<{ message: string; fields: Record<string, unknown> }> = []

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
mock.module(import.meta.resolve('@/lib/env'), {
	namedExports: { env: { GEMINI_API_KEY: 'test-key', DEEPGRAM_API_KEY: 'test-key' } }
})
mock.module(import.meta.resolve('@/server/lib/ai-usage/sink'), {
	namedExports: {
		trackAiCall: (context: { feature: string }, call: () => Promise<unknown>) => {
			tracked.push(context.feature)
			return call()
		}
	}
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: {
		log: {
			warn: (message: string, fields: Record<string, unknown>) => warned.push({ message, fields }),
			info: () => {},
			error: () => {}
		}
	}
})
mock.module(import.meta.resolve('@/server/db/client'), {
	namedExports: {
		Prisma: { PrismaClientKnownRequestError: class extends Error {} },
		db: { aiAllowance: { updateMany: async () => ({ count: 1 }) } }
	}
})
mock.module('@google/genai', {
	namedExports: {
		GoogleGenAI: class {
			models = {
				generateContent: async (params: { config?: { maxOutputTokens?: number } }) => {
					sent.push({ maxOutputTokens: params.config?.maxOutputTokens })
					return answer()
				}
			}
		},
		MediaResolution: { MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM' }
	}
})

// Accounts on, as in production (session.ts reads these).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

const { GEMINI_MAX_OUTPUT_TOKENS, generateContent } = await import('./google')
const editor = await import('@/app/[locale]/editor/actions')
const make = await import('@/app/[locale]/(app)/make/actions')

const plan = JSON.parse(
	readFileSync(new URL('../../../e2e/fixtures/real-run3-reply.json', import.meta.url), 'utf-8')
)
const sentences = [{ startSeconds: 0, endSeconds: 2, text: 'Hello there.' }]
const planInput = {
	request: 'make a promo ad',
	answers: [],
	durationSeconds: 60,
	sentences,
	frames: 'AAAA'
}

/** Every action that calls Gemini, with an input it accepts. */
const GEMINI_ACTIONS: Array<{ name: string; call: () => Promise<{ ok: boolean }> }> = [
	{
		name: 'parseEditCommand',
		call: () =>
			editor.parseEditCommand({ command: 'cut from 1 to 2', durationSeconds: 10, clipCount: 1 })
	},
	{ name: 'findHighlights', call: () => editor.findHighlights({ sentences }) },
	{
		name: 'checkMakePlan',
		call: () => make.checkMakePlan({ request: 'make a promo ad', planText: 'A promo, 30 s.' })
	},
	{
		name: 'followUpMakeIt',
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
	{ name: 'planMakeIt', call: () => make.planMakeIt(planInput) }
]

const reset = () => {
	sent.length = 0
	tracked.length = 0
	warned.length = 0
	answer = () => ({ text: '{}' })
}

test('the caps are as approved: 1,024 for the short replies, 8,192 for a plan and a follow-up', () => {
	assert.deepEqual(GEMINI_MAX_OUTPUT_TOKENS, {
		parse_edit_command: 1024,
		find_highlights: 1024,
		make_it_check: 1024,
		make_it: 8192,
		make_it_follow_up: 8192
	})
})

test('every Gemini call in the code is for a feature with a cap, and every cap is for a call', () => {
	// Each call of the wrapper's `generateContent(`, and the feature it names.
	const features: string[] = []
	const walk = (dir: URL) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
			if (entry.isDirectory()) walk(path)
			else if (/\.tsx?$/.test(entry.name) && !path.pathname.includes('/src/server/ai/')) {
				const source = readFileSync(path, 'utf-8')
				// Only files that call the wrapper (a comment elsewhere may name the SDK's method).
				if (!source.includes("from '@/server/ai/google'")) continue
				for (const match of source.matchAll(/generateContent\(\s*\{\s*feature:\s*'([a-z_]+)'/g)) {
					features.push(match[1] ?? '')
				}
				const calls = source.match(/\bgenerateContent\(/g)?.length ?? 0
				const named = [...source.matchAll(/generateContent\(\s*\{\s*feature:/g)].length
				assert.equal(
					calls,
					named,
					`${path.pathname}: a Gemini call whose feature isn't written first`
				)
			}
		}
	}
	walk(new URL('../../', import.meta.url))
	assert.deepEqual(features.toSorted(), Object.keys(GEMINI_MAX_OUTPUT_TOKENS).toSorted())
})

test('each action that calls Gemini sends its own feature’s cap', async () => {
	for (const { name, call } of GEMINI_ACTIONS) {
		reset()
		assert.equal((await call()).ok, true, name)
		assert.equal(sent.length, 1, name)
		const feature = tracked[0] as keyof typeof GEMINI_MAX_OUTPUT_TOKENS
		assert.ok(feature in GEMINI_MAX_OUTPUT_TOKENS, name)
		assert.equal(sent[0]?.maxOutputTokens, GEMINI_MAX_OUTPUT_TOKENS[feature], name)
	}
})

test('a cap passed by the caller never replaces the feature’s', async () => {
	reset()
	await generateContent(
		{ feature: 'parse_edit_command', model: 'gemini-3.5-flash-lite', timeoutMs: 30_000 },
		{ contents: 'x', config: { maxOutputTokens: 999_999 } }
	)
	assert.equal(sent[0]?.maxOutputTokens, 1024)
})

test('a plan cut off by its cap is logged as a cut-off with its feature, and comes back as no plan, not a crash', async () => {
	reset()
	// What Gemini sends when the cap is hit mid-reply: JSON that stops.
	answer = () => ({
		text: '{"questions":[],"style":"cle',
		candidates: [{ finishReason: 'MAX_TOKENS' }]
	})
	const result = await make.planMakeIt(planInput)
	assert.deepEqual(result, { ok: true, data: { reply: null, tracks: [] } })
	// Logged once, as a cut-off: never as anything else.
	assert.deepEqual(warned, [
		{
			message: 'AI reply cut off by its output cap',
			fields: { provider: 'google', feature: 'make_it', maxOutputTokens: 8192 }
		}
	])
})

test('a reply that ends on its own logs nothing', async () => {
	reset()
	answer = () => ({ text: '{}', candidates: [{ finishReason: 'STOP' }] })
	await make.planMakeIt(planInput)
	assert.deepEqual(warned, [])
})
