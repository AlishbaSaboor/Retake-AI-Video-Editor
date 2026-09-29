import type { AdminRole } from '@prisma/client'
import { FLAGS, variantsOf, type FlagKey, type JsonValue, type ValueOf } from './flags'

// The runtime value a provider can decide on: an on/off boolean, or a variant
// string (multivariate / experiment flags). It's the widened successor to the
// old boolean-only return — boolean is still a valid FlagValue, so every
// existing boolean flag and provider keeps working unchanged. Kept as a plain
// serialisable union so a resolved value can cross the server→client boundary.
export type FlagValue = boolean | string

// The context a flag resolves against. Everything here is optional and
// serialisable — an anonymous visitor has none of it, a signed-in user has a
// userId, an admin also has a role. userId is the app user's id (also the
// PostHog distinctId). The *Properties/groups fields are PostHog targeting
// inputs: person/group properties let a release condition or experiment target
// a segment, and are forwarded verbatim to evaluateFlags. Nothing here is a
// Prisma row — this is the small slice a provider needs to decide.
export type FlagContext = {
	userId?: string
	role?: AdminRole
	personProperties?: Readonly<Record<string, string | number | boolean>>
	groups?: Readonly<Record<string, string>>
	groupProperties?: Readonly<Record<string, Record<string, string | number | boolean>>>
}

// A single link in the resolution chain. `resolve` returns:
//   - a FlagValue (boolean | variant string) → this provider decided; stop.
//   - undefined                              → this provider abstains; fall through.
// A provider MUST NOT throw for a "no opinion" case — abstaining is undefined,
// not an exception. Real infrastructure failures (DB down, PostHog unreachable)
// are swallowed inside the provider and turned into `undefined` so one flaky
// backend degrades to the next link (and ultimately the static default) rather
// than taking the request down. A flag lookup is never allowed to fail the page.
export interface FlagProvider {
	resolve(key: FlagKey, ctx: FlagContext): Promise<FlagValue | undefined>
}

// Walk an explicit, ordered list of providers; the first defined answer wins,
// otherwise fall back to the registry's static default. Generic over the key so
// the return type is that flag's precise ValueOf<K> (a variant union or
// boolean), not the wide FlagValue. Exported for tests so precedence, the
// kill-switch, and the unknown-key fallback can be exercised with fake providers
// and no DB/PostHog.
//
// The two `as ValueOf<K>` casts are unavoidable and narrow, not escape hatches:
// a `readonly FlagProvider[]` can't be typed generically per element, so the
// widened FlagValue a provider returns is asserted back to the key's value type.
// server.ts guards these at runtime — a PostHog variant passes isVariantOf
// before it's returned, so an off-list value never reaches this cast.
export async function walkProviders<K extends FlagKey>(
	key: K,
	ctx: FlagContext,
	providers: readonly FlagProvider[]
): Promise<ValueOf<K>> {
	for (const provider of providers) {
		const decided = await provider.resolve(key, ctx)
		if (decided !== undefined) return decided as ValueOf<K>
	}
	return FLAGS[key].default as ValueOf<K>
}

// --- Deterministic bucketing (pure, so it's unit-tested here, not in the
// server-only module that wires it into the DB providers) --------------------

// Deterministic 0–99 bucket for a (flag, user) pair, so a gradual rollout / a
// weighted variant split is stable per user (the same user always lands in the
// same bucket for a flag) and independent across flags. A cheap string hash is
// enough — this is a rollout gate, not a security boundary.
export function rolloutBucket(flagKey: string, userId: string): number {
	let hash = 0
	const seed = `${flagKey}:${userId}`
	for (let i = 0; i < seed.length; i++) {
		hash = (hash * 31 + seed.charCodeAt(i)) | 0
	}
	return Math.abs(hash) % 100
}

// Coerce a raw variantWeights JSON value to a { variant: weight } map, or
// undefined when it isn't a well-formed object of non-negative numbers.
export function parseWeights(raw: JsonValue | null): Record<string, number> | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
	const out: Record<string, number> = {}
	for (const [variant, weight] of Object.entries(raw)) {
		if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) return undefined
		out[variant] = weight
	}
	return Object.keys(out).length > 0 ? out : undefined
}

// Deterministically pick a variant from a weighted split (a PostHog-independent
// A/B/n), stable per user. Iterates the flag's DECLARED variants in registry
// order — never the stored JSON's key order — so the split is identical for two
// equivalent configs and re-saving weights with reordered keys doesn't reshuffle
// users. Only declared variants count toward the total, so an off-registry key
// in a legacy / seeded row can't open a silent dead band. The 0–99 bucket is
// compared against each variant's cumulative share scaled to 100, so the last
// variant's band reaches 100 and the full range is assignable (no unreachable
// top sliver). Returns undefined when no declared variant carries weight.
export function weightedVariant(
	key: FlagKey,
	userId: string,
	weights: Record<string, number>
): string | undefined {
	const variants = variantsOf(key)
	const total = variants.reduce((sum, variant) => sum + (weights[variant] ?? 0), 0)
	if (total <= 0) return undefined
	const bucket = rolloutBucket(key, userId)
	let cumulative = 0
	for (const variant of variants) {
		cumulative += weights[variant] ?? 0
		if (bucket < (cumulative / total) * 100) return variant
	}
	return undefined
}

// The real chain, in precedence order:
//   1. DB per-user override  — a specific user pinned on/off
//   2. DB global flag        — enabled=false is a hard kill-switch; optional rollout%
//   3. PostHog               — rollout / experiment targeting, variant selection
//   4. static default        — terminal, applied by walkProviders, never network
//
// The DB and PostHog providers live in server.ts (they need `db`, PostHog, and
// the `server-only` marker); server.ts assembles the ordered list and hands it
// to walkProviders. This module stays free of server-only imports so its logic
// is unit-testable. flagProviders below is the fixed ORDER/interface contract —
// server.ts is where each link is actually implemented.
export const flagProviders: readonly FlagProvider[] = []

// App entry point: resolve a single flag against the real chain. server.ts
// wraps this (adding cache() + the concrete providers); it is kept here so the
// precedence rule lives next to walkProviders it delegates to.
export async function resolveFlag<K extends FlagKey>(
	key: K,
	ctx: FlagContext
): Promise<ValueOf<K>> {
	return walkProviders(key, ctx, flagProviders)
}
