// The provider model id -> OpenRouter slug map, and nothing else. This file
// is the one place a new model gets registered; AGENTS.md's "Adding a model
// or a new AI call" section is the checklist that points here.
//
// Nothing below is derived, on purpose. Provider and OpenRouter id schemes
// disagree on word order and separators — Anthropic serves
// `claude-haiku-4-5-20251001`, OpenRouter calls the same model
// `anthropic/claude-haiku-4.5` and its canonical slug
// `anthropic/claude-4.5-haiku-20251001` — and a normalizer
// clever enough to bridge that is also clever enough to resolve a new model
// to the wrong row and mis-price it in silence. An explicit map fails
// loudly instead: an unmapped model prices as NULL, never 0, so every such
// row is one `where cost_micro_usd is null` away from being counted on the
// dashboard.

export const AI_PROVIDERS = ['google', 'deepgram'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const SERVICE_TIERS = ['standard', 'fast', 'batch'] as const
export type ServiceTier = (typeof SERVICE_TIERS)[number]

export const AI_CALL_STATUSES = ['ok', 'error', 'refusal'] as const
export type AiCallStatus = (typeof AI_CALL_STATUSES)[number]

// Keyed by the model id the provider reports back in its response, which is
// the dated one (`claude-haiku-4-5-20251001`) when you called a dated alias
// and the short one (`claude-opus-5`) when you called a floating alias. Both
// reach this map, so register both forms of any model you call by alias.
//
// Trim this to the models the project actually calls. Every entry is checked
// against the live OpenRouter catalogue by `pnpm check:ai-models`, so a
// speculative entry for a model you never call is a CI failure waiting for
// the day that slug is retired.
//
// Embedding and transcription models live in that catalogue too, but only
// behind the `output_modalities` query string pricing.ts sends — see the
// OPENROUTER_MODELS_URL comment there before concluding a slug doesn't
// exist.
//
// Retake calls Gemini 3.5 Flash-Lite for edit commands; it's on the Gemini
// API's free tier. Transcription is Deepgram's, priced per minute below.
export const OPENROUTER_SLUGS = {
	'gemini-3.5-flash-lite': 'google/gemini-3.5-flash-lite'
} satisfies Record<string, string>

// Speech-to-text models billed per minute of audio rather than per token.
// OpenRouter doesn't list them, so this is their rate source, in USD per
// audio minute — re-check the source whenever a rate or model changes, the
// same way check:ai-models keeps OPENROUTER_SLUGS honest. A row for one of
// these is costed from the audio duration and stored as `<provider>/<model>`.
//
//   nova-3: Deepgram pay-as-you-go, pre-recorded, monolingual. $0.0043/min.
//           https://deepgram.com/pricing (checked 2026-10-02). Filler-word
//           detection is not a paid add-on.
export const AUDIO_MINUTE_RATES_USD = {
	'nova-3': 0.0043
} satisfies Record<string, number>

export type AudioMinuteModel = keyof typeof AUDIO_MINUTE_RATES_USD

const minuteRatesByModel: Record<string, number | undefined> = AUDIO_MINUTE_RATES_USD

/** USD per audio minute for a per-minute model, or null for a token-priced one. */
export function audioMinuteRate(model: string): number | null {
	return minuteRatesByModel[model] ?? null
}

// The model ids a call site is allowed to ask for. `satisfies` above keeps
// the keys as literals so this type exists at all, which turns "someone
// added an AI call for a model nobody mapped" from a production discovery
// into a `pnpm typecheck` failure. The model a provider *reports* is still
// an open string — that one is caught at runtime, unpriced and loud.
export type TrackedModel = keyof typeof OPENROUTER_SLUGS | keyof typeof AUDIO_MINUTE_RATES_USD

// Indexed through a widened alias rather than a cast: the map's literal keys
// are what TrackedModel is built from, but a lookup here takes whatever the
// provider actually said.
const slugsByModel: Record<string, string | undefined> = OPENROUTER_SLUGS

// `batch` is a distinct upstream entry at half price. `fast` has no separate
// upstream listing anywhere today, so it prices as standard — if a provider
// ever starts charging a premium for it, this is the line that changes.
export function openRouterSlug(
	model: string,
	serviceTier: ServiceTier = 'standard'
): string | null {
	const slug = slugsByModel[model]
	if (slug == null) return null
	return serviceTier === 'batch' ? `${slug}:batch` : slug
}
