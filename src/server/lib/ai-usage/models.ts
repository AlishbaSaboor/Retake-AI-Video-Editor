// The provider model id -> OpenRouter slug map, and nothing else. This file
// is the one place a new model gets registered; AGENTS.md's "Adding a model
// or a new AI call" section is the checklist that points here.
//
// Nothing below is derived, on purpose. The two id schemes disagree on word
// order and separators — Anthropic serves `claude-haiku-4-5-20251001`,
// OpenRouter calls the same model `anthropic/claude-haiku-4.5` and its
// canonical slug `anthropic/claude-4.5-haiku-20251001` — and a normalizer
// clever enough to bridge that is also clever enough to resolve a new model
// to the wrong row and mis-price it in silence. An explicit map fails
// loudly instead: an unmapped model prices as NULL, never 0, so every such
// row is one `where cost_micro_usd is null` away from being counted on the
// dashboard.

export const AI_PROVIDERS = ['anthropic', 'openai', 'google'] as const
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
export const OPENROUTER_SLUGS = {
	'claude-opus-5': 'anthropic/claude-opus-5',
	'claude-sonnet-5': 'anthropic/claude-sonnet-5',
	'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
	'gpt-5.4': 'openai/gpt-5.4',
	'gpt-5.4-mini': 'openai/gpt-5.4-mini',
	'gemini-3.8-flash': 'google/gemini-3.8-flash'
} satisfies Record<string, string>

// The model ids a call site is allowed to ask for. `satisfies` above keeps
// the keys as literals so this type exists at all, which turns "someone
// added an AI call for a model nobody mapped" from a production discovery
// into a `pnpm typecheck` failure. The model a provider *reports* is still
// an open string — that one is caught at runtime, unpriced and loud.
export type TrackedModel = keyof typeof OPENROUTER_SLUGS

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
