import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AiAllowanceKind } from '@/lib/ai-limits'
import { normalizeError } from '@/lib/errors/normalize-error'
import type { Prisma } from '@prisma/client'
import { assertLocalDatabase } from '@/server/db/local-database'

// Every paid action as the server runs it, against real Postgres (`pnpm
// test:db`; CI's db-tests job): the real action, its real allowance, the
// real Gemini and Deepgram wrappers (the real Gemini SDK building and
// sending its request), and the real usage sink pricing the call and
// writing its ai_usage row. The only fakes are at the network edge (Gemini,
// Deepgram and OpenRouter answer through a stand-in fetch; anything else is
// refused, so no real call can ever leave) and what can't run under `node
// --test`: Supabase's session, Sentry and Next's own runtime.

assertLocalDatabase(process.env.DATABASE_URL)

const USER = randomUUID()
const KEY = 'test-key-not-real'
process.env.GEMINI_API_KEY = KEY
process.env.DEEPGRAM_API_KEY = KEY
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
/** Each request Deepgram received: its URL, its auth and content-type headers, and the audio. */
const toDeepgram: Array<{
	url: string
	authorization: string | null
	contentType: string | null
	body: Uint8Array
}> = []
/** How Deepgram answers the next request. */
let deepgram: (requestId: string) => Response = () => new Response(null, { status: 500 })
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
	if (url.startsWith('https://api.deepgram.com/')) {
		toDeepgram.push({
			url,
			authorization: request.headers.get('authorization'),
			contentType: request.headers.get('content-type'),
			body: new Uint8Array(await request.arrayBuffer())
		})
		const requestId = `test-${randomUUID()}`
		responseIds.push(requestId)
		return deepgram(requestId)
	}
	if (url.startsWith('https://openrouter.ai/')) {
		return Response.json({ data: [{ id: 'google/gemini-3.5-flash-lite', pricing: RATES }] })
	}
	throw new Error(`No real network in this test: ${url}`)
}) as typeof fetch

const { db } = await import('@/server/db/client')
const { utcDay } = await import('@/server/lib/ai-allowance')
const editor = await import('@/app/[locale]/editor/actions')
const make = await import('@/app/[locale]/(app)/make/actions')

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

/**
 * Waits for the rows the sink writes after the call (it isn't awaited by the
 * action), for one feature: the typed command's unless another is named.
 */
async function waitForUsage(where: Prisma.AiUsageWhereInput, feature = 'parse_edit_command') {
	for (let attempt = 0; attempt < 50; attempt++) {
		const rows = await db.aiUsage.findMany({
			where: { ...where, feature }
		})
		if (rows.length > 0) return rows
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.fail('no ai_usage row was written')
}
/** Today's allowance used, for one kind: typed commands' unless another is named. */
const used = async (kind: AiAllowanceKind = 'command') =>
	(
		await db.aiAllowance.findUnique({
			where: { userId_day_kind: { userId: USER, day: utcDay(new Date()), kind } }
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

/** Gemini's answer: `reply` as its JSON text, with the tokens it reports. */
const geminiReply =
	(reply: unknown, promptTokens: number, outputTokens: number) => (responseId: string) =>
		Response.json({
			candidates: [
				{
					content: { role: 'model', parts: [{ text: JSON.stringify(reply) }] },
					finishReason: 'STOP'
				}
			],
			usageMetadata: {
				promptTokenCount: promptTokens,
				candidatesTokenCount: outputTokens,
				totalTokenCount: promptTokens + outputTokens
			},
			modelVersion: 'gemini-3.5-flash-lite',
			responseId
		})

type DeepgramWord = { word: string; punctuated_word: string; start: number; end: number }

/** Deepgram's answer: these words, from audio `duration` seconds long. */
const deepgramReply = (words: DeepgramWord[], duration: number) => (requestId: string) =>
	Response.json({
		metadata: { request_id: requestId, duration },
		results: { channels: [{ alternatives: [{ words }] }] }
	})

/** The one row the sink wrote for this answer, checked for its provider, model, tokens and price. */
async function usageRow(
	feature: string,
	requestId: string,
	expected: {
		provider: string
		model: string
		inputTokens: number
		outputTokens: number
		costMicroUsd: bigint
	}
) {
	const [row, ...others] = await waitForUsage({ requestId }, feature)
	assert.equal(others.length, 0)
	assert.ok(row)
	usageRows.push(row.id)
	assert.equal(row.status, 'ok')
	assert.deepEqual(
		{
			provider: row.provider,
			model: row.model,
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			costMicroUsd: row.costMicroUsd
		},
		expected
	)
}

/** What the last Gemini request carried: checked for its model and key; its body and config. */
function lastToGemini() {
	const sent = toGemini.at(-1)
	assert.ok(sent)
	assert.match(sent.url, /models\/gemini-3\.5-flash-lite:generateContent/)
	assert.equal(sent.key, KEY)
	return { body: sent.body, config: sent.body.generationConfig as Record<string, unknown> }
}

const sentences = [
	{ startSeconds: 0, endSeconds: 4, text: 'Welcome to the demo.' },
	{ startSeconds: 4, endSeconds: 9, text: 'Here is the one feature that matters.' }
]
const plan = JSON.parse(
	readFileSync(new URL('../../../e2e/fixtures/real-run3-reply.json', import.meta.url), 'utf-8')
)

test('findHighlights: the picks come back, the highlights allowance is taken, the call is priced and recorded', async () => {
	const before = await used('highlights')
	let responseId = ''
	const pick = {
		firstSentence: 1,
		lastSentence: 2,
		title: 'The demo',
		description: 'The one feature.'
	}
	gemini = (id) => {
		responseId = id
		return geminiReply({ highlights: [pick] }, 300, 50)(id)
	}
	const result = await editor.findHighlights({ sentences })
	assert.deepEqual(result, { ok: true, data: [pick] })

	const { body, config } = lastToGemini()
	assert.equal(config.maxOutputTokens, 1024)
	assert.match(JSON.stringify(body.contents), /Welcome to the demo\./)
	assert.equal(await used('highlights'), before + 1)
	// 300 × $0.0000001 + 50 × $0.0000004 = $0.00005.
	await usageRow('find_highlights', responseId, {
		provider: 'google',
		model: 'google/gemini-3.5-flash-lite',
		inputTokens: 300,
		outputTokens: 50,
		costMicroUsd: 50n
	})
})

test('planMakeIt: the plan comes back with the pictures sent, a Make it step is taken, the call is priced and recorded', async () => {
	const before = await used('make_it')
	let responseId = ''
	gemini = (id) => {
		responseId = id
		return geminiReply(plan, 5000, 1000)(id)
	}
	const result = await make.planMakeIt({
		request: 'make a promo ad',
		answers: [],
		durationSeconds: 9,
		sentences,
		frames: ['AAAA', 'BBBB'].join(' ')
	})
	assert.deepEqual(result, { ok: true, data: { reply: plan, tracks: [] } })

	// Two pictures, at medium detail, under the plan's own output cap.
	const { body, config } = lastToGemini()
	assert.equal(config.maxOutputTokens, 8192)
	assert.equal(config.mediaResolution, 'MEDIA_RESOLUTION_MEDIUM')
	const parts = (body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]?.parts ?? []
	assert.deepEqual(
		parts.filter((part) => 'inlineData' in part),
		[
			{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
			{ inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } }
		]
	)
	assert.equal(await used('make_it'), before + 1)
	// 5,000 × $0.0000001 + 1,000 × $0.0000004 = $0.0009.
	await usageRow('make_it', responseId, {
		provider: 'google',
		model: 'google/gemini-3.5-flash-lite',
		inputTokens: 5000,
		outputTokens: 1000,
		costMicroUsd: 900n
	})
})

test('checkMakePlan: the fixes come back, text only, a Make it step is taken, the call is priced and recorded', async () => {
	const before = await used('make_it')
	let responseId = ''
	const check = {
		problems: ['The opening is not the strongest line.'],
		title: null,
		keyLines: [],
		captions: 'classic',
		transition: 'fade',
		dropSentences: [1],
		tooShort: false
	}
	gemini = (id) => {
		responseId = id
		return geminiReply(check, 400, 100)(id)
	}
	const result = await make.checkMakePlan({ request: 'make a promo ad', planText: 'A promo, 9 s.' })
	assert.deepEqual(result, { ok: true, data: check })

	const { body, config } = lastToGemini()
	assert.equal(config.maxOutputTokens, 1024)
	assert.doesNotMatch(JSON.stringify(body.contents), /inlineData/)
	assert.equal(await used('make_it'), before + 1)
	// 400 × $0.0000001 + 100 × $0.0000004 = $0.00008.
	await usageRow('make_it_check', responseId, {
		provider: 'google',
		model: 'google/gemini-3.5-flash-lite',
		inputTokens: 400,
		outputTokens: 100,
		costMicroUsd: 80n
	})
})

test('followUpMakeIt: the changed plan comes back, text only, a Make it step is taken, the call is priced and recorded', async () => {
	const before = await used('make_it')
	let responseId = ''
	const shorter = { ...plan, maxSeconds: 6 }
	gemini = (id) => {
		responseId = id
		return geminiReply(shorter, 3000, 800)(id)
	}
	const result = await make.followUpMakeIt({
		request: 'make a promo ad',
		earlier: [],
		followUp: 'make it shorter',
		answers: [],
		plan,
		durationSeconds: 9,
		editedSeconds: 9,
		sentences
	})
	assert.deepEqual(result, { ok: true, data: { reply: shorter } })

	const { body, config } = lastToGemini()
	assert.equal(config.maxOutputTokens, 8192)
	assert.doesNotMatch(JSON.stringify(body.contents), /inlineData/)
	assert.match(JSON.stringify(body.contents), /Follow-up: make it shorter/)
	assert.equal(await used('make_it'), before + 1)
	// 3,000 × $0.0000001 + 800 × $0.0000004 = $0.00062.
	await usageRow('make_it_follow_up', responseId, {
		provider: 'google',
		model: 'google/gemini-3.5-flash-lite',
		inputTokens: 3000,
		outputTokens: 800,
		costMicroUsd: 620n
	})
})

/** A few bytes standing in for a WAV file: Deepgram's fake only checks they arrive whole. */
const AUDIO = Buffer.from('RIFF-not-really-a-wav')

/** Checks the last Deepgram request against what every call must send. */
function assertSentToDeepgram() {
	const sent = toDeepgram.at(-1)
	assert.ok(sent)
	const url = new URL(sent.url)
	assert.equal(url.pathname, '/v1/listen')
	assert.deepEqual(Object.fromEntries(url.searchParams), {
		model: 'nova-3',
		filler_words: 'true',
		punctuate: 'true'
	})
	assert.equal(sent.authorization, `Token ${KEY}`)
	assert.equal(sent.contentType, 'audio/wav')
	assert.deepEqual(Buffer.from(sent.body), AUDIO)
}

test('transcribeTake: the transcript comes back, the transcript allowance is taken, the audio is priced and recorded', async () => {
	const before = await used('transcript')
	let requestId = ''
	deepgram = (id) => {
		requestId = id
		return deepgramReply(
			[
				{ word: 'so', punctuated_word: 'So,', start: 0, end: 0.3 },
				{ word: 'um', punctuated_word: 'um,', start: 0.4, end: 0.6 },
				{ word: 'hello', punctuated_word: 'hello', start: 0.7, end: 1 },
				{ word: 'there', punctuated_word: 'there.', start: 1, end: 1.4 }
			],
			60
		)(id)
	}
	const result = await editor.transcribeTake({ audioBase64: AUDIO.toString('base64') })
	assert.equal(result.ok, true)
	assert.deepEqual(result.ok && result.data.segments, [
		{ startSeconds: 0, endSeconds: 1.4, text: 'So, um, hello there.' }
	])
	assert.equal(result.ok && result.data.words.length, 4)

	assertSentToDeepgram()
	assert.equal(await used('transcript'), before + 1)
	// A minute of audio at $0.0043 a minute.
	await usageRow('transcribe_take', requestId, {
		provider: 'deepgram',
		model: 'deepgram/nova-3',
		inputTokens: 0,
		outputTokens: 0,
		costMicroUsd: 4300n
	})
})

test('transcribeVoiceCommand: the words come back, the voice allowance is taken, the audio is priced and recorded', async () => {
	const before = await used('voice')
	let requestId = ''
	deepgram = (id) => {
		requestId = id
		return deepgramReply(
			[
				{ word: 'cut', punctuated_word: 'Cut', start: 0, end: 0.3 },
				{ word: 'the', punctuated_word: 'the', start: 0.3, end: 0.4 },
				{ word: 'intro', punctuated_word: 'intro.', start: 0.4, end: 0.9 }
			],
			3
		)(id)
	}
	const result = await editor.transcribeVoiceCommand({ audioBase64: AUDIO.toString('base64') })
	assert.deepEqual(result, { ok: true, data: 'Cut the intro.' })

	assertSentToDeepgram()
	assert.equal(await used('voice'), before + 1)
	// 3 seconds at $0.0043 a minute.
	await usageRow('voice_command', requestId, {
		provider: 'deepgram',
		model: 'deepgram/nova-3',
		inputTokens: 0,
		outputTokens: 0,
		costMicroUsd: 215n
	})
})

test('Deepgram busy: the person gets the plain message, the voice allowance is given back, the failure is recorded', async () => {
	const before = await used('voice')
	const since = new Date()
	deepgram = () => Response.json({ err_msg: 'Too many requests.' }, { status: 503 })
	const result = await editor.transcribeVoiceCommand({ audioBase64: AUDIO.toString('base64') })
	assert.deepEqual(result, {
		ok: false,
		error: 'The AI is busy right now. Try again in a moment.',
		status: 503
	})
	assert.equal(await used('voice'), before)
	// As for Gemini's: the one failed row since the test began that carries
	// the fake's 503, or none removed.
	const failed = await waitForUsage(
		{
			status: { not: 'ok' },
			createdAt: { gte: since },
			meta: { path: ['error_status'], equals: 503 }
		},
		'voice_command'
	)
	assert.equal(failed.length, 1, 'another process wrote a failed row meanwhile; none removed')
	const [row] = failed
	assert.ok(row)
	usageRows.push(row.id)
	assert.equal(row.provider, 'deepgram')
	assert.equal(row.costMicroUsd, null)
	assert.deepEqual(row.meta, { error_type: 'DeepgramError', error_status: 503 })
})
