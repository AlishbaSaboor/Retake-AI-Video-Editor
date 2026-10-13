import { randomUUID } from 'node:crypto'
import { after, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'
import type { Prisma } from '@prisma/client'
import { assertLocalDatabase } from '@/server/db/local-database'

// A paid action as the server runs it, against real Postgres (`pnpm test:db`;
// CI's db-tests job): the real action, its real allowance, the real Gemini
// wrapper, the real Gemini SDK building and sending its request, and the
// real usage sink pricing the call and writing its ai_usage row. The only
// fakes are at the network edge (Gemini and OpenRouter answer through a
// stand-in fetch; anything else is refused, so no real call can ever leave)
// and what can't run under `node --test`: Supabase's session, Sentry and
// Next's own runtime.

assertLocalDatabase(process.env.DATABASE_URL)

const USER = randomUUID()
const KEY = 'test-key-not-real'
process.env.GEMINI_API_KEY = KEY
// Accounts on, as in production (session.ts reads these).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: {
		createServerSupabaseClient: async () => ({
			auth: { getUser: async () => ({ data: { user: { id: USER, email: 'a@b.c' } }, error: null }) }
		})
	}
})
mock.module(import.meta.resolve('@/lib/rbac/context'), {
	namedExports: { enforceAuthorize: async () => ({}) }
})
mock.module(import.meta.resolve('@/lib/observability/capture-error'), {
	namedExports: { captureError: (error: unknown) => normalizeError(error) }
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: { log: { warn: () => {}, info: () => {}, error: () => {} } }
})

/** Each request Gemini received: its URL, its key header and its body. */
const toGemini: Array<{ url: string; key: string | null; body: Record<string, unknown> }> = []
/** The response id of every answer the fake gave, so its rows are found and removed. */
const responseIds: string[] = []
/** How Gemini answers the next request. */
let gemini: (responseId: string) => Response = () => new Response(null, { status: 500 })
const RATES = { prompt: '0.0000001', completion: '0.0000004' }

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const request = new Request(input, init)
	const url = request.url
	if (url.includes('generativelanguage.googleapis.com')) {
		toGemini.push({
			url,
			key: request.headers.get('x-goog-api-key'),
			body: (await request.json()) as Record<string, unknown>
		})
		const responseId = `test-${randomUUID()}`
		responseIds.push(responseId)
		return gemini(responseId)
	}
	if (url.startsWith('https://openrouter.ai/')) {
		return Response.json({ data: [{ id: 'google/gemini-3.5-flash-lite', pricing: RATES }] })
	}
	throw new Error(`No real network in this test: ${url}`)
}) as typeof fetch

const { db } = await import('@/server/db/client')
const { utcDay } = await import('@/server/lib/ai-allowance')
const editor = await import('@/app/[locale]/editor/actions')

// Only this run's rows are removed: its own user's allowance, the rows whose
// request id the fake made up, and the one failure row it identified.
const usageRows: bigint[] = []
after(async () => {
	await db.aiAllowance.deleteMany({ where: { userId: USER } })
	await db.aiUsage.deleteMany({
		where: { OR: [{ id: { in: usageRows } }, { requestId: { in: responseIds } }] }
	})
	await db.$disconnect()
})

/** Waits for the rows the sink writes after the call (it isn't awaited by the action). */
async function waitForUsage(where: Prisma.AiUsageWhereInput) {
	for (let attempt = 0; attempt < 50; attempt++) {
		const rows = await db.aiUsage.findMany({
			where: { ...where, feature: 'parse_edit_command' }
		})
		if (rows.length > 0) return rows
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.fail('no ai_usage row was written')
}
const used = async () =>
	(
		await db.aiAllowance.findUnique({
			where: { userId_day_kind: { userId: USER, day: utcDay(new Date()), kind: 'command' } }
		})
	)?.used ?? 0

const command = { command: 'cut from 1 to 4', durationSeconds: 10, clipCount: 1 }

test('a typed command: the real SDK sends its request, the allowance is taken, the call is priced and recorded', async () => {
	let responseId = ''
	gemini = (id) => {
		responseId = id
		return Response.json({
			candidates: [
				{
					content: {
						role: 'model',
						parts: [{ text: JSON.stringify({ action: 'trim', startSeconds: 1, endSeconds: 4 }) }]
					},
					finishReason: 'STOP'
				}
			],
			usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
			modelVersion: 'gemini-3.5-flash-lite',
			responseId: id
		})
	}
	const result = await editor.parseEditCommand(command)
	assert.equal(result.ok, true)
	assert.equal(result.ok && result.data.action, 'trim')
	assert.equal(result.ok && result.data.startSeconds, 1)

	// What the SDK put on the wire: the model, the key, the feature's output cap.
	assert.equal(toGemini.length, 1)
	assert.match(toGemini[0]?.url ?? '', /models\/gemini-3\.5-flash-lite:generateContent/)
	assert.equal(toGemini[0]?.key, KEY)
	const config = toGemini[0]?.body.generationConfig as Record<string, unknown>
	assert.equal(config.maxOutputTokens, 1024)
	assert.equal(config.temperature, 0)

	// The allowance, in Postgres.
	assert.equal(await used(), 1)

	// The row the sink wrote, priced from the rate card: 120 × $0.0000001 + 30 × $0.0000004 = $0.000024.
	const [row, ...others] = await waitForUsage({ requestId: responseId })
	assert.equal(others.length, 0)
	assert.ok(row)
	usageRows.push(row.id)
	assert.equal(row.provider, 'google')
	assert.equal(row.model, 'google/gemini-3.5-flash-lite')
	assert.equal(row.status, 'ok')
	assert.equal(row.inputTokens, 120)
	assert.equal(row.outputTokens, 30)
	assert.equal(row.costMicroUsd, 24n)
})

test('Gemini busy: the person gets the plain message, the allowance is given back, the failure is recorded', async () => {
	const before = await used()
	const since = new Date()
	gemini = () =>
		Response.json(
			{ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } },
			{ status: 503 }
		)
	const result = await editor.parseEditCommand(command)
	assert.deepEqual(result, {
		ok: false,
		error: 'The AI is busy right now. Try again in a moment.',
		status: 503
	})
	// Taken for the call, then given back when it failed.
	assert.equal(await used(), before)
	// A failure has no request id, so the row is the one failed call since
	// the test began that carries the fake's 503. More than one and the test
	// stops without removing any, rather than guess which is its own.
	const failed = await waitForUsage({
		status: { not: 'ok' },
		createdAt: { gte: since },
		meta: { path: ['error_status'], equals: 503 }
	})
	assert.equal(failed.length, 1, 'another process wrote a failed row meanwhile; none removed')
	const [row] = failed
	assert.ok(row)
	usageRows.push(row.id)
	assert.equal(row.provider, 'google')
	assert.equal(row.inputTokens, 0)
})
