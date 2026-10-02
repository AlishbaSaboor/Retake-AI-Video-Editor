import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioCostMicroUsd, costMicroUsd, type OpenRouterRates } from './pricing'
import { audioMinuteRate, openRouterSlug } from './models'
import { extractUsage } from './usage'
import { buildRow, createAiTracker, type AiCallSpec, type AiUsageRow } from './track'

// Real rates, copied from OpenRouter's catalogue. Using invented round
// numbers would let a units bug (per-token vs. per-million) pass every
// assertion here and still be off by six orders of magnitude in production.
const OPUS: OpenRouterRates = {
	prompt: '0.000005',
	completion: '0.000025',
	input_cache_read: '0.0000005',
	input_cache_write: '0.00000625'
}

const LONG_CONTEXT: OpenRouterRates = {
	prompt: '0.0000025',
	completion: '0.000015',
	input_cache_read: '0.00000025',
	overrides: [
		{
			min_prompt_tokens: 272_000,
			prompt: '0.000005',
			completion: '0.0000225',
			input_cache_read: '0.0000005'
		}
	]
}

const NO_TOKENS = {
	inputTokens: 0,
	outputTokens: 0,
	cacheWriteTokens: 0,
	cacheReadTokens: 0
}

// --- the model map ---------------------------------------------------------

test('maps a known model and leaves an unknown one unpriced', () => {
	assert.equal(openRouterSlug('gemini-3.5-flash-lite'), 'google/gemini-3.5-flash-lite')
	assert.equal(openRouterSlug('gemini-9-flash-20290101'), null)
})

test('batch is a separate upstream entry, fast is not', () => {
	assert.equal(
		openRouterSlug('gemini-3.5-flash-lite', 'batch'),
		'google/gemini-3.5-flash-lite:batch'
	)
	assert.equal(openRouterSlug('gemini-3.5-flash-lite', 'fast'), 'google/gemini-3.5-flash-lite')
})

// --- pricing ---------------------------------------------------------------

test('prices all four token buckets at their own rate', () => {
	const cost = costMicroUsd(
		{ inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 200, cacheReadTokens: 10_000 },
		OPUS
	)
	// 0.005 + 0.0125 + 0.00125 + 0.005 = 0.02375 USD
	assert.equal(cost, 23_750)
})

test('an unmapped model prices as null, never as zero', () => {
	assert.equal(costMicroUsd({ ...NO_TOKENS, inputTokens: 1000 }, undefined), null)
})

test('a long-context call is priced at the override tier', () => {
	const below = costMicroUsd({ ...NO_TOKENS, inputTokens: 1000, outputTokens: 100 }, LONG_CONTEXT)
	assert.equal(below, 4000)

	const above = costMicroUsd(
		{ ...NO_TOKENS, inputTokens: 300_000, outputTokens: 100 },
		LONG_CONTEXT
	)
	assert.equal(above, 1_502_250)
})

test('cached tokens count toward the long-context threshold', () => {
	// 100 fresh tokens, but a 300k context — the provider charges for the
	// window, not for what changed in it.
	const cost = costMicroUsd(
		{ ...NO_TOKENS, inputTokens: 100, cacheReadTokens: 300_000 },
		LONG_CONTEXT
	)
	assert.equal(cost, 150_500)
})

test('an override leaves the rates it does not declare alone', () => {
	const promptOnly: OpenRouterRates = {
		prompt: '0.0000025',
		completion: '0.000015',
		overrides: [{ min_prompt_tokens: 272_000, prompt: '0.000005' }]
	}
	const cost = costMicroUsd({ ...NO_TOKENS, inputTokens: 300_000, outputTokens: 100 }, promptOnly)
	// Prompt doubles, completion stays at the base rate: 1.5 + 0.0015
	assert.equal(cost, 1_501_500)
})

// --- provider response extraction ------------------------------------------

test('google extraction reads the served model, request id and status', () => {
	const extracted = extractUsage('google', {
		responseId: 'resp-0',
		modelVersion: 'gemini-3.5-flash-lite',
		candidates: [{ finishReason: 'STOP' }],
		usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 }
	})
	assert.deepEqual(extracted, {
		model: 'gemini-3.5-flash-lite',
		requestId: 'resp-0',
		status: 'ok',
		tokens: { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0 }
	})
})

test('google cachedContentTokenCount is subtracted out of the prompt count', () => {
	const extracted = extractUsage('google', {
		responseId: 'resp-1',
		modelVersion: 'gemini-3.5-flash-lite',
		usageMetadata: {
			promptTokenCount: 11_000,
			candidatesTokenCount: 500,
			cachedContentTokenCount: 10_000
		}
	})
	// The trap: billing 11,000 fresh input tokens here would double-count
	// every cache hit and inflate the reported spend on the cheapest calls.
	assert.equal(extracted?.tokens.inputTokens, 1000)
	assert.equal(extracted?.tokens.cacheReadTokens, 10_000)
})

test('google thinking tokens are billed as output, so they land in the output count', () => {
	const extracted = extractUsage('google', {
		responseId: 'resp-2',
		modelVersion: 'gemini-3.5-flash-lite',
		usageMetadata: {
			promptTokenCount: 1000,
			candidatesTokenCount: 500,
			cachedContentTokenCount: 0,
			thoughtsTokenCount: 4000
		}
	})
	// The output-side twin of the trap above. candidatesTokenCount alone
	// reports 500 of the 4,500 output tokens Google charges for, and a
	// reasoning-heavy call is mostly thinking. Anthropic and OpenAI fold
	// reasoning into their completion counts upstream; Google does not.
	assert.equal(extracted?.tokens.outputTokens, 4500)
})

test('a refusal is recorded as a refusal, not as a plain success', () => {
	for (const finishReason of ['SAFETY', 'PROHIBITED_CONTENT']) {
		const extracted = extractUsage('google', {
			candidates: [{ finishReason }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
		})
		assert.equal(extracted?.status, 'refusal', finishReason)
	}
})

test('an unrecognised response shape yields no usage rather than throwing', () => {
	assert.equal(extractUsage('google', { unexpected: true }), undefined)
	assert.equal(extractUsage('google', null), undefined)
})

test('deepgram usage is the audio duration it billed, with zero tokens', () => {
	assert.deepEqual(
		extractUsage('deepgram', {
			metadata: { request_id: 'dg-1', duration: 90.5 },
			results: { channels: [] }
		}),
		{
			requestId: 'dg-1',
			status: 'ok',
			tokens: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
			audioSeconds: 90.5
		}
	)
	assert.equal(extractUsage('deepgram', { results: {} }), undefined)
})

// --- per-minute pricing ----------------------------------------------------

test('a per-minute model is priced from audio duration at its listed rate', () => {
	const rate = audioMinuteRate('nova-3')
	assert.equal(rate, 0.0043)
	// 90 s at $0.0043/min = $0.00645 = 6,450 micro-USD.
	assert.equal(audioCostMicroUsd(90, rate ?? NaN), 6450)
})

test('a per-minute call with no reported duration is unpriced, never zero', () => {
	assert.equal(audioCostMicroUsd(undefined, 0.0043), null)
	assert.equal(audioCostMicroUsd(Number.NaN, 0.0043), null)
	assert.equal(audioMinuteRate('gemini-3.5-flash-lite'), null)
})

// --- row building ----------------------------------------------------------

const SPEC: AiCallSpec = {
	provider: 'google',
	model: 'gemini-3.5-flash-lite',
	feature: 'parse_edit_command'
}

test('the model that served the call wins over the model that was asked for', () => {
	const row = buildRow(
		{ ...SPEC, model: 'gemini-3.5-flash-lite' },
		{
			modelVersion: 'gemini-3.5-flash-lite-001',
			usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }
		},
		{ status: 'ok', latencyMs: 12 }
	)
	assert.equal(row.model, 'gemini-3.5-flash-lite-001')
})

test('a deepgram row carries the billed audio duration for pricing', () => {
	const row = buildRow(
		{ provider: 'deepgram', model: 'nova-3', feature: 'transcribe_take' },
		{ metadata: { request_id: 'dg-2', duration: 12 } },
		{ status: 'ok', latencyMs: 5 }
	)
	assert.equal(row.audioSeconds, 12)
	assert.equal(row.model, 'nova-3')
	assert.equal(row.inputTokens, 0)
})

test('a failed call still produces a row, with the requested model and no tokens', () => {
	const row = buildRow(SPEC, undefined, { status: 'error', latencyMs: 12 })
	assert.equal(row.status, 'error')
	assert.equal(row.model, 'gemini-3.5-flash-lite')
	assert.deepEqual(
		{
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			cacheWriteTokens: row.cacheWriteTokens,
			cacheReadTokens: row.cacheReadTokens
		},
		NO_TOKENS
	)
})

// --- failure isolation -----------------------------------------------------
// The most important test in this file. Everything else is an accounting
// detail; this is the one that decides whether a broken ledger takes a
// user-facing feature down with it.

test('a sink that throws never breaks the AI call', async () => {
	const trackAiCall = createAiTracker(() => {
		throw new Error('the database is on fire')
	})
	const result = await trackAiCall(SPEC, async () => 'the completion')
	assert.equal(result, 'the completion')
})

test('a broken custom extractor never breaks the AI call either', async () => {
	const rows: AiUsageRow[] = []
	const trackAiCall = createAiTracker((row) => rows.push(row))
	const result = await trackAiCall(
		{
			...SPEC,
			extract: () => {
				throw new Error('this extractor was written on a Friday')
			}
		},
		async () => 'the completion'
	)
	assert.equal(result, 'the completion')
	assert.equal(rows.length, 0)
})

test('a provider error is recorded and then rethrown untouched', async () => {
	const rows: AiUsageRow[] = []
	const trackAiCall = createAiTracker((row) => rows.push(row))
	const boom = new Error('529 overloaded')

	await assert.rejects(
		trackAiCall(SPEC, async () => {
			throw boom
		}),
		(error: unknown) => error === boom
	)
	assert.equal(rows.length, 1)
	assert.equal(rows[0]?.status, 'error')
})
