// The single source of truth for feature flags. Every flag this app knows
// about is a key in FLAGS below — the keys are a closed set, so a flag name is
// never a bare string that can drift or typo. Adding a flag is one line here;
// the whole provider chain (src/lib/flags/provider.ts) and both the server and
// client surfaces (server.ts / client.tsx) derive from this object.
//
// This module is deliberately runtime-light and has NO server-only import: it's
// safe to pull into the client bundle (client.tsx imports FLAGS at runtime for
// its variant fallbacks), so keep heavy deps (zod, PostHog) out of it.
//
// kind is a category, not a switch — every flag resolves through the same
// chain regardless of kind. It's here so a flag admin UI can group flags and so
// an owner can tell at a glance what a flag is FOR:
//   - 'release'    a not-yet-shipped feature, on for staff/rollout, off in prod
//   - 'ops'        a kill-switch — flip off to disable a risky path in an incident
//   - 'experiment' an A/B/n test, usually PostHog-resolved to a variant
//   - 'module'     a whole product module toggled on/off (payments, messaging…)
//   - 'permission' a capability gate expressed as a flag rather than admin RBAC
export type FlagKind = 'release' | 'ops' | 'experiment' | 'module' | 'permission'

// `type` is the VALUE SHAPE a flag resolves to (orthogonal to `kind`, which is
// intent/grouping). It's the discriminant of the FlagDef union below:
//   - 'boolean'    on/off (the default when `type` is omitted)
//   - 'variant'    one of a closed set of variant strings (multivariate)
//   - 'experiment' a variant flag whose tuple MUST lead with 'control' — the
//                  shape PostHog experiments require. Resolves through the same
//                  variant path; the distinction is intent + the leading-control
//                  guarantee, so experiment analysis has a stable baseline.
export type FlagType = 'boolean' | 'variant' | 'experiment'

// Any JSON value — the shape a flag PAYLOAD can take. Payloads are orthogonal to
// a flag's value (a boolean OR variant flag can also carry one), so this type
// lives on the registry but the payload machinery (schemas, typed accessors)
// lives in ./payload-schemas — see docs/rules/feature-flags.md.
export type JsonValue =
	string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// Fields every flag carries regardless of shape.
type BaseFlagDef = {
	kind: FlagKind
	description: string
	owner: string
}

// A plain on/off flag. `type` is optional here so existing boolean flags read
// exactly as before — omitting `type` means 'boolean'. `default` is the terminal
// fallback: what the flag resolves to when no provider (DB override, DB flag,
// PostHog) has an opinion. Ship it as `false` for anything not yet fully rolled
// out — a flag with no backing row then stays off everywhere until turned on.
export type BooleanFlagDef = BaseFlagDef & {
	type?: 'boolean'
	default: boolean
}

// A multivariate flag: resolves to one of `variants`. `default` is the terminal
// fallback and MUST be one of `variants` (enforced at the type level below via
// `default: V[number]` on the const). A variant flag is "on" whenever it holds
// any variant (only an explicit PostHog `false` reads as off), so useFlag keeps
// working against it.
export type VariantFlagDef<
	V extends readonly [string, ...string[]] = readonly [string, ...string[]]
> = BaseFlagDef & {
	type: 'variant'
	variants: V
	default: V[number]
}

// An experiment flag: a variant flag whose tuple leads with the literal
// 'control'. Typing the first element as 'control' makes PostHog's required
// baseline a compile error to omit, not a runtime surprise.
export type ExperimentFlagDef<
	V extends readonly ['control', ...string[]] = readonly ['control', ...string[]]
> = BaseFlagDef & {
	type: 'experiment'
	variants: V
	default: V[number]
}

export type FlagDef = BooleanFlagDef | VariantFlagDef | ExperimentFlagDef

// Illustrative catalog — replace these with your project's real flags. The
// shape (each entry a FlagDef) and the `as const` are what matter: `as const`
// is what makes FlagKey a union of the literal keys AND preserves each variant
// tuple as a literal, so ValueOf<K> can derive the exact variant union per flag.
export const FLAGS = {
	new_dashboard: {
		default: false,
		kind: 'release',
		description: 'The redesigned dashboard, off until it ships.',
		owner: 'web-team'
	},
	payments_module: {
		default: false,
		kind: 'module',
		description: 'Enables the payments module end to end.',
		owner: 'web-team'
	},
	checkout_kill_switch: {
		default: true,
		kind: 'ops',
		description: 'Master switch for checkout; flip off to halt purchases in an incident.',
		owner: 'web-team'
	},
	// Gates PostHog session replay to a targeted segment. Default OFF — nobody is
	// recorded until this flag is turned on for them. Point PostHog → Settings →
	// Session Replay → "record using a feature flag" at this key, then target the
	// flag (a cohort / person property) so only tagged people are recorded. See
	// docs/rules/feature-flags.md § Targeting, recording, and measuring.
	session_recording: {
		default: false,
		kind: 'ops',
		description: 'Records a PostHog session replay only for the targeted segment (off by default).',
		owner: 'web-team'
	},
	// A multivariate flag — resolves to one of three layouts. PostHog decides the
	// variant (release condition / rollout); when PostHog is absent it resolves
	// to `default` ('control') via the registry.
	dashboard_layout: {
		type: 'variant',
		variants: ['control', 'compact', 'spacious'],
		default: 'control',
		kind: 'experiment',
		description: 'Which dashboard layout a user sees.',
		owner: 'web-team'
	},
	// An experiment — same variant machinery, but the tuple must lead with
	// 'control' so PostHog's experiment analysis has a baseline. Read it like any
	// flag; PostHog handles randomization, exposure, and the statistics.
	pricing_page_experiment: {
		type: 'experiment',
		variants: ['control', 'value_first', 'simple'],
		default: 'control',
		kind: 'experiment',
		description: 'Pricing page presentation A/B/n test.',
		owner: 'web-team'
	}
} as const satisfies Readonly<Record<string, FlagDef>>

export type FlagKey = keyof typeof FLAGS

// The resolved value type of a specific flag, derived from the registry so a
// call site infers the exact type per key: a variant flag's literal union (e.g.
// 'control' | 'compact' | 'spacious'), a boolean flag's boolean. This is what
// makes getFlag(key)/useVariant(key) return the precise type without a cast at
// the call site. Order matters: check for a variant tuple first, else boolean.
export type ValueOf<K extends FlagKey> = (typeof FLAGS)[K] extends {
	variants: infer V extends readonly string[]
}
	? V[number]
	: boolean

// The full server-resolved snapshot shape: every flag mapped to its resolved
// value. getAllFlags returns this and the client provider is seeded with it, so
// both surfaces stay in lockstep with the registry.
export type FlagSnapshot = { [K in FlagKey]: ValueOf<K> }

// Runtime guard: narrows an unknown (a query param, a DB row's flagKey, a
// value crossing the network) to a real FlagKey before it's used as one.
export function isFlagKey(value: unknown): value is FlagKey {
	return typeof value === 'string' && Object.hasOwn(FLAGS, value)
}

// True when the flag resolves to a variant (multivariate or experiment) rather
// than an on/off boolean. Providers branch on this to decide whether they answer
// with a variant string or a boolean. (Payloads are orthogonal — any flag, of
// either value shape, may also carry one; see ./payload-schemas.)
export function isVariantFlag(key: FlagKey): boolean {
	return 'variants' in FLAGS[key]
}

// True when the flag is a plain on/off flag. The complement of isVariantFlag.
export function isBooleanFlag(key: FlagKey): boolean {
	return !isVariantFlag(key)
}

// The flag's declared variants in registry order (empty for a boolean flag).
// The declared order is the canonical order for a weighted split, so the split
// is stable regardless of the key order a stored variantWeights JSON happens to
// have.
export function variantsOf(key: FlagKey): readonly string[] {
	const def: FlagDef = FLAGS[key]
	return 'variants' in def ? def.variants : []
}

// Runtime narrowing one level deeper than isFlagKey: is `value` a declared
// variant of `key`? Used at the PostHog boundary to reject an unknown variant
// string (a renamed/removed PostHog variant) before it escapes as this flag's
// value. Always false for a boolean flag (it has no variants).
export function isVariantOf<K extends FlagKey>(key: K, value: unknown): value is ValueOf<K> {
	const def: FlagDef = FLAGS[key]
	return (
		'variants' in def &&
		typeof value === 'string' &&
		(def.variants as readonly string[]).includes(value)
	)
}
