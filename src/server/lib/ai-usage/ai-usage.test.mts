import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costMicroUsd, type OpenRouterRates } from './pricing'
import { openRouterSlug } from './models'
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
	assert.equal(openRouterSlug('claude-opus-5'), 'anthropic/claude-opus-5')
	assert.equal(openRouterSlug('claude-opus-6-20270101'), null)
})

test('batch is a separate upstream entry, fast is not', () => {
	assert.equal(openRouterSlug('claude-opus-5', 'batch'), 'anthropic/claude-opus-5:batch')
	assert.equal(openRouterSlug('claude-opus-5', 'fast'), 'anthropic/claude-opus-5')
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

test('anthropic input_tokens excludes cache, so nothing is subtracted', () => {
	const extracted = extractUsage('anthropic', {
		id: 'msg_01abc',
		model: 'claude-opus-5',
		stop_reason: 'end_turn',
		usage: {
			input_tokens: 1000,
			output_tokens: 500,
			cache_creation_input_tokens: 200,
			cache_read_input_tokens: 10_000
		}
	})
	assert.deepEqual(extracted, {
		model: 'claude-opus-5',
		requestId: 'msg_01abc',
		status: 'ok',
		tokens: {
			inputTokens: 1000,
			outputTokens: 500,
			cacheWriteTokens: 200,
			cacheReadTokens: 10_000
		}
	})
})

test('openai prompt_tokens includes cache, so cached tokens are subtracted out', () => {
	const extracted = extractUsage('openai', {
		id: 'chatcmpl-1',
		model: 'gpt-5.4',
		usage: {
			prompt_tokens: 11_000,
			completion_tokens: 500,
			prompt_tokens_details: { cached_tokens: 10_000 }
		}
	})
	// The trap: billing 11,000 fresh input tokens here would double-count
	// every cache hit and inflate the reported spend on the cheapest calls.
	assert.equal(extracted?.tokens.inputTokens, 1000)
	assert.equal(extracted?.tokens.cacheReadTokens, 10_000)
})

test('google cachedContentTokenCount is subtracted out of the prompt count too', () => {
	const extracted = extractUsage('google', {
		responseId: 'resp-1',
		modelVersion: 'gemini-3.8-flash',
		usageMetadata: {
			promptTokenCount: 11_000,
			candidatesTokenCount: 500,
			cachedContentTokenCount: 10_000
		}
	})
	assert.equal(extracted?.tokens.inputTokens, 1000)
	assert.equal(extracted?.tokens.cacheReadTokens, 10_000)
})

test('google thinking tokens are billed as output, so they land in the output count', () => {
	const extracted = extractUsage('google', {
		responseId: 'resp-2',
		modelVersion: 'gemini-3.8-flash',
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
	const anthropic = extractUsage('anthropic', {
		stop_reason: 'refusal',
		usage: { input_tokens: 10, output_tokens: 0 }
	})
	assert.equal(anthropic?.status, 'refusal')

	const openai = extractUsage('openai', {
		choices: [{ finish_reason: 'content_filter' }],
		usage: { prompt_tokens: 10, completion_tokens: 0 }
	})
	assert.equal(openai?.status, 'refusal')
})

test('an unrecognised response shape yields no usage rather than throwing', () => {
	assert.equal(extractUsage('anthropic', { unexpected: true }), undefined)
	assert.equal(extractUsage('openai', null), undefined)
})

// --- row building ----------------------------------------------------------

const SPEC: AiCallSpec = {
	provider: 'anthropic',
	model: 'claude-opus-5',
	feature: 'offer_copy'
}

test('the model that served the call wins over the model that was asked for', () => {
	const row = buildRow(
		{ ...SPEC, model: 'claude-opus-5' },
		{ model: 'claude-opus-5-20260723', usage: { input_tokens: 1, output_tokens: 1 } },
		{ status: 'ok', latencyMs: 12 }
	)
	assert.equal(row.model, 'claude-opus-5-20260723')
})

test('a failed call still produces a row, with the requested model and no tokens', () => {
	const row = buildRow(SPEC, undefined, { status: 'error', latencyMs: 12 })
	assert.equal(row.status, 'error')
	assert.equal(row.model, 'claude-opus-5')
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
