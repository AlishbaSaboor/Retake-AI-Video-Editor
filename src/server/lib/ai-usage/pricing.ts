import { z } from 'zod'

// Everything about what a call cost: the rate card fetched from OpenRouter,
// and the arithmetic applied to it. The math half is pure (no network, no
// database, no Next) and is what ai-usage.test.mts exercises.

// Rates are USD **per token**, delivered as strings. Not per million, and not
// numbers: parse, don't assume.
const rateFields = z.object({
	prompt: z.string(),
	completion: z.string(),
	input_cache_read: z.string().optional(),
	input_cache_write: z.string().optional()
})

export const openRouterRatesSchema = rateFields.extend({
	// Long-context tiers. Several models roughly double their rate past a
	// prompt-size threshold; pricing off the top-level rates alone
	// under-reports by half on exactly the calls that cost the most.
	overrides: z.array(rateFields.partial().extend({ min_prompt_tokens: z.number() })).optional()
})

export type OpenRouterRates = z.infer<typeof openRouterRatesSchema>

export type TokenCounts = {
	inputTokens: number
	outputTokens: number
	cacheWriteTokens: number
	cacheReadTokens: number
}

// Costs are stored as millionths of a USD: integers sum exactly, so a spend
// total never drifts the way a running float sum does.
export const MICRO_USD_PER_USD = 1_000_000

function rate(value: string | undefined): number {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

// Which tier applies is decided by everything occupying the context window,
// not just the freshly-sent tokens — a mostly-cached 400k prompt is still a
// 400k prompt as far as the provider's long-context pricing is concerned.
function applicableRates(rates: OpenRouterRates, tokens: TokenCounts): OpenRouterRates {
	const promptTokens = tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens
	const tier = (rates.overrides ?? [])
		.filter((override) => promptTokens >= override.min_prompt_tokens)
		.sort((a, b) => a.min_prompt_tokens - b.min_prompt_tokens)
		.at(-1)
	if (tier == null) return rates
	// Merged field by field rather than by spread: an override declares only
	// the rates it changes, and a spread would let an absent key blank out
	// the base rate it was meant to leave alone.
	return {
		prompt: tier.prompt ?? rates.prompt,
		completion: tier.completion ?? rates.completion,
		input_cache_read: tier.input_cache_read ?? rates.input_cache_read,
		input_cache_write: tier.input_cache_write ?? rates.input_cache_write
	}
}

// Returns null when the model has no known rates, never 0 — see the
// costMicroUsd comment in prisma/schema/ai-usage.prisma for why that
// distinction is the whole point.
//
// ponytail: sub-microdollar calls (a handful of tokens at the cheapest cache
// read rate) round to 0. Move to nano-USD if per-call precision ever matters
// more than the aggregate.
export function costMicroUsd(
	tokens: TokenCounts,
	rates: OpenRouterRates | undefined
): number | null {
	if (rates == null) return null
	const tier = applicableRates(rates, tokens)
	const usd =
		tokens.inputTokens * rate(tier.prompt) +
		tokens.outputTokens * rate(tier.completion) +
		tokens.cacheReadTokens * rate(tier.input_cache_read) +
		tokens.cacheWriteTokens * rate(tier.input_cache_write)
	return Math.round(usd * MICRO_USD_PER_USD)
}

// --- the rate card ---------------------------------------------------------

// OpenRouter publishes its whole rate card unauthenticated, which is the only
// reason this works without yet another API key to provision per project.
//
// `output_modalities` is not optional decoration. Bare `/api/v1/models`
// defaults to text-output models only, so an embedding or transcription slug
// is absent from the response, prices as NULL, and reads on the dashboard as
// a real $0.00 — while the model map entry it needed was correct all along.
// Ask for every modality this repo could call.
const OPENROUTER_MODELS_URL =
	'https://openrouter.ai/api/v1/models?output_modalities=text,embeddings,transcription'

// Rates move on the order of weeks. A day-old rate card is fine; a fetch on
// every AI call is not.
const RATE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

export type RateCard = Map<string, OpenRouterRates>

// `pricing` stays unknown here and is parsed per entry below.
const catalogueSchema = z.object({
	data: z.array(z.object({ id: z.string(), pricing: z.unknown() }))
})

type Cached = { fetchedAt: number; rates: RateCard }

// ponytail: per-instance in-memory cache, so each serverless instance pays
// one ~1MB fetch per day. It never lands on a user-facing path (the sink
// runs after the response), so this stays until someone can point at a bill
// or a cold-start graph. Upstash/Redis is the upgrade if that day comes.
let cached: Cached | null = null

export async function fetchRateCard(): Promise<RateCard> {
	const response = await fetch(OPENROUTER_MODELS_URL, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { accept: 'application/json' }
	})
	if (!response.ok) {
		throw new Error(`OpenRouter rate card responded ${response.status}`)
	}
	const body: unknown = await response.json()
	const rates: RateCard = new Map()
	// Each entry is parsed on its own so one unfamiliar model cannot invalidate
	// the other 400 — the catalogue carries fields that change often, and only
	// `pricing` is load-bearing here.
	const parsed = catalogueSchema.safeParse(body)
	if (parsed.success) {
		for (const entry of parsed.data.data) {
			const pricing = openRouterRatesSchema.safeParse(entry.pricing)
			if (pricing.success) rates.set(entry.id, pricing.data)
		}
	}
	if (rates.size === 0) throw new Error('OpenRouter rate card returned no priceable models')
	return rates
}

// Never throws and never blocks a caller for long: a rate card that cannot be
// fetched yields `undefined`, which prices the row as NULL rather than losing
// the row or writing a zero. NULL is recoverable and countable; a zero sums
// cleanly into a total and under-reports forever.
export async function rateCard(): Promise<RateCard | undefined> {
	if (cached != null && Date.now() - cached.fetchedAt < RATE_TTL_MS) return cached.rates
	try {
		const rates = await fetchRateCard()
		cached = { fetchedAt: Date.now(), rates }
		return rates
	} catch {
		// Stale rates beat no rates — a week-old price is off by a rounding
		// error, a missing price is off by the entire call.
		return cached?.rates
	}
}
