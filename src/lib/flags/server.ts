import 'server-only'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { getPostHogServerClient } from '@/lib/posthog/server'
import {
	FLAGS,
	isBooleanFlag,
	isFlagKey,
	isVariantFlag,
	isVariantOf,
	type FlagKey,
	type FlagSnapshot,
	type JsonValue,
	type ValueOf
} from './flags'
import { validatePayload, type PayloadOf, type PayloadSnapshot } from './payload-schemas'
import {
	parseWeights,
	rolloutBucket,
	walkProviders,
	weightedVariant,
	type FlagContext,
	type FlagProvider,
	type FlagValue
} from './provider'

// The context flag resolution runs against. Re-exported from provider.ts so a
// caller (the admin layout) has one import for the whole server surface. It is
// deliberately the small serialisable slice — the layout builds it from the
// RBAC AdminContext (ctx.user.id → userId, ctx.member.role → role) rather than
// this module importing getAdminContext, which would couple flags to RBAC's
// runtime. See docs/rules/feature-flags.md.
export type { FlagContext } from './provider'

// One row per global flag, keyed by flag key. Mirrors the FeatureFlag Prisma
// model (prisma/schema/flags.prisma): a global on/off + optional rollout %, plus
// the granular columns — a forced `variant`, a `variantWeights` split for a
// PostHog-independent A/B/n, and a global `payload`.
type FeatureFlagRow = {
	key: string
	enabled: boolean
	rolloutPercent: number | null
	variant: string | null
	variantWeights: JsonValue | null
	payload: JsonValue | null
}

// One row per per-user pin, keyed by (flagKey, userId). Mirrors the
// FeatureFlagOverride Prisma model — a pin can now force a specific `variant` or
// a `payload`, not just on/off.
type FeatureFlagOverrideRow = {
	flagKey: string
	userId: string
	enabled: boolean
	variant: string | null
	payload: JsonValue | null
}

// Everything the chain needs from the DB, read in ONE round trip per request so
// a full snapshot never fans out into a query-per-flag (N+1). Shared via cache()
// so several reads in a request still hit the DB once. Reads degrade to empty on
// any DB error — a flag lookup must never fail the page; the chain then falls
// through to PostHog and finally the static default.
type FlagDbSnapshot = {
	flags: Map<string, FeatureFlagRow>
	overrides: Map<string, FeatureFlagOverrideRow>
}

// key for the override map: a flag+user pair.
function overrideKey(flagKey: string, userId: string): string {
	return `${flagKey}:${userId}`
}

// Pull every flag row and (if we know the user) their overrides in one pass.
// cache()'d so multiple reads in a request share the read.
const loadFlagSnapshot = cache(async (userId: string | undefined): Promise<FlagDbSnapshot> => {
	try {
		const [flagRows, overrideRows] = await Promise.all([
			db.featureFlag.findMany({
				select: {
					key: true,
					enabled: true,
					rolloutPercent: true,
					variant: true,
					variantWeights: true,
					payload: true
				}
			}),
			userId
				? db.featureFlagOverride.findMany({
						where: { userId },
						select: { flagKey: true, userId: true, enabled: true, variant: true, payload: true }
					})
				: Promise.resolve([])
		])

		const flags = new Map<string, FeatureFlagRow>()
		for (const row of flagRows) {
			flags.set(row.key, {
				key: row.key,
				enabled: row.enabled,
				rolloutPercent: row.rolloutPercent,
				variant: row.variant,
				variantWeights: row.variantWeights as JsonValue | null,
				payload: row.payload as JsonValue | null
			})
		}

		const overrides = new Map<string, FeatureFlagOverrideRow>()
		for (const row of overrideRows) {
			overrides.set(overrideKey(row.flagKey, row.userId), {
				flagKey: row.flagKey,
				userId: row.userId,
				enabled: row.enabled,
				variant: row.variant,
				payload: row.payload as JsonValue | null
			})
		}

		return { flags, overrides }
	} catch {
		// DB unavailable → no rows. The chain falls through to PostHog / default
		// rather than throwing; a flag read can never take down the request.
		return { flags: new Map(), overrides: new Map() }
	}
})

// PostHog assigns a user in an experiment's holdout to a variant named like
// `holdout-<id>`. That's a real PostHog value but not a variant this app
// declared, so normalise it to the flag's control default — typed code only
// ever sees a declared variant. (Branch on holdout membership? Expose it
// explicitly instead; see docs/rules/feature-flags.md.)
function normalizeHoldout(variant: string, key: FlagKey): string {
	return variant.startsWith('holdout-') ? (FLAGS[key].default as string) : variant
}

// Map a raw PostHog flag VALUE (string variant | boolean | undefined) to this
// flag's typed FlagValue, or undefined to abstain. A boolean flag coerces to
// on/off; a variant flag must receive a *declared* variant string (after holdout
// normalisation) or it falls back to control — an off-list / renamed PostHog
// variant never escapes as the flag's value.
function mapPostHogValue(key: FlagKey, raw: string | boolean | undefined): FlagValue | undefined {
	if (raw === undefined) return undefined
	if (isBooleanFlag(key)) return raw !== false
	if (typeof raw !== 'string') return undefined
	const variant = normalizeHoldout(raw, key)
	return isVariantOf(key, variant) ? variant : (FLAGS[key].default as string)
}

// The PostHog targeting inputs, forwarded to evaluateFlags/getAllFlags so a
// release condition, cohort, or experiment can target person/group properties.
// The admin role (ctx.role) is surfaced as the `admin_role` person property —
// this is where the context's role finally feeds resolution, so a flag can roll
// out by staff tier in PostHog. Caller-supplied personProperties win over it.
function posthogOptions(ctx: FlagContext) {
	const personProperties = ctx.role
		? { admin_role: ctx.role, ...ctx.personProperties }
		: ctx.personProperties
	return {
		personProperties,
		groups: ctx.groups,
		groupProperties: ctx.groupProperties
	}
}

// --- VALUE providers (the on/off | variant chain) ----------------------------

// Link 1 — per-user DB override. A pinned user wins over everything downstream.
// A boolean flag returns the pin. A variant flag returns a pinned `variant`
// (validated); else `enabled=false` forces control and `enabled=true` (no
// variant) abstains so PostHog can pick. Abstains for an anonymous user or a
// flag with no pin.
function overrideProvider(snapshot: FlagDbSnapshot): FlagProvider {
	return {
		resolve(key, ctx) {
			if (!ctx.userId) return Promise.resolve(undefined)
			const row = snapshot.overrides.get(overrideKey(key, ctx.userId))
			if (!row) return Promise.resolve(undefined)
			if (isVariantFlag(key)) {
				if (row.variant && isVariantOf(key, row.variant)) return Promise.resolve(row.variant)
				return Promise.resolve(row.enabled ? undefined : (FLAGS[key].default as string))
			}
			return Promise.resolve(row.enabled)
		}
	}
}

// Link 2 — global DB flag. enabled=false is a HARD kill-switch for every shape
// (boolean → off, variant → control), beating PostHog and the default. For a
// boolean flag, enabled=true + rolloutPercent gates on the stable bucket. For a
// variant flag, a forced `variant` wins, else a `variantWeights` split picks one
// deterministically (a PostHog-independent A/B/n), else it abstains so PostHog
// owns the variant. No row → abstain.
function dbFlagProvider(snapshot: FlagDbSnapshot): FlagProvider {
	return {
		resolve(key, ctx) {
			const row = snapshot.flags.get(key)
			if (!row) return Promise.resolve(undefined)
			if (isVariantFlag(key)) {
				if (!row.enabled) return Promise.resolve(FLAGS[key].default as string)
				if (row.variant && isVariantOf(key, row.variant)) return Promise.resolve(row.variant)
				const weights = parseWeights(row.variantWeights)
				if (weights && ctx.userId) {
					const picked = weightedVariant(key, ctx.userId, weights)
					if (picked) return Promise.resolve(picked)
				}
				return Promise.resolve(undefined)
			}
			if (!row.enabled) return Promise.resolve(false)
			if (row.rolloutPercent == null) return Promise.resolve(true)
			if (!ctx.userId) return Promise.resolve(undefined)
			return Promise.resolve(rolloutBucket(key, ctx.userId) < row.rolloutPercent)
		}
	}
}

// Link 3 (single-read, EXPOSING) — PostHog for one intentional getFlag() read.
// evaluateFlags() builds one snapshot; snapshot.getFlag(key) reads the value AND
// fires the $feature_flag_called exposure event (deduped per user+flag+value) —
// the exposure PostHog experiments need. Runs only when both DB links abstain,
// so a kill-switch/pin decides without a false exposure. Any failure or missing
// user/client abstains, so an outage degrades to the static default.
function posthogExposingProvider(): FlagProvider {
	return {
		async resolve(key, ctx) {
			if (!ctx.userId) return undefined
			const posthog = getPostHogServerClient()
			if (!posthog) return undefined
			try {
				const snapshot = await posthog.evaluateFlags(ctx.userId, posthogOptions(ctx))
				return mapPostHogValue(key, snapshot.getFlag(key))
			} catch {
				return undefined
			}
		}
	}
}

// Link 3 (bulk, SILENT) — PostHog for seeding the whole snapshot. Reads from the
// pre-fetched getAllFlags() map, which does NOT fire $feature_flag_called —
// correct, because seeding every flag to hydrate the client is not a user
// exposure. Abstains when PostHog is absent.
function posthogBulkProvider(values: Record<string, string | boolean> | undefined): FlagProvider {
	return {
		resolve(key) {
			return Promise.resolve(values ? mapPostHogValue(key, values[key]) : undefined)
		}
	}
}

// --- PAYLOAD chain (orthogonal to value: any flag may carry a payload) --------

// Resolve a flag's payload with the same precedence as its value: per-user
// override → global DB flag → PostHog → none. Every source is validated against
// the flag's declared schema (payload-schemas.ts); a malformed payload is
// skipped rather than trusted. Returns undefined when the flag has no payload.
function resolvePayload(
	key: FlagKey,
	snapshot: FlagDbSnapshot,
	userId: string | undefined,
	posthogPayload: JsonValue | undefined
): JsonValue | undefined {
	if (userId) {
		const ov = snapshot.overrides.get(overrideKey(key, userId))
		if (ov?.payload != null) {
			const valid = validatePayload(key, ov.payload)
			if (valid !== undefined) return valid
		}
	}
	const flag = snapshot.flags.get(key)
	if (flag?.payload != null) {
		const valid = validatePayload(key, flag.payload)
		if (valid !== undefined) return valid
	}
	if (posthogPayload != null) return validatePayload(key, posthogPayload)
	return undefined
}

// One silent bulk PostHog read of every flag value AND payload. getAllFlags-
// AndPayloads() does not fire exposure. Degrades to undefined so the snapshot
// still resolves from DB + defaults when PostHog is unavailable.
async function loadPostHogBulk(
	ctx: FlagContext
): Promise<
	{ values?: Record<string, string | boolean>; payloads?: Record<string, JsonValue> } | undefined
> {
	if (!ctx.userId) return undefined
	const posthog = getPostHogServerClient()
	if (!posthog) return undefined
	try {
		const result = await posthog.getAllFlagsAndPayloads(ctx.userId, posthogOptions(ctx))
		return {
			values: result.featureFlags,
			payloads: result.featureFlagPayloads as Record<string, JsonValue> | undefined
		}
	} catch {
		return undefined
	}
}

// --- Public API --------------------------------------------------------------

// Resolve one flag's VALUE for the current request/context, typed to that flag's
// exact value (a variant union or boolean). NOT cache()'d: React's cache()
// erases the generic (collapsing ValueOf<K> to the whole union), losing per-key
// inference. The DB read underneath is cache()'d, and PostHog is consulted only
// when the DB links abstain — so a getFlag() a kill-switch/pin decides costs no
// network call. Fires PostHog exposure when PostHog decides. Read many at once
// with getFlagSnapshot.
export async function getFlag<K extends FlagKey>(
	key: K,
	ctx: FlagContext = {}
): Promise<ValueOf<K>> {
	const snapshot = await loadFlagSnapshot(ctx.userId)
	const providers: readonly FlagProvider[] = [
		overrideProvider(snapshot),
		dbFlagProvider(snapshot),
		posthogExposingProvider()
	]
	return walkProviders(key, ctx, providers)
}

// Resolve one flag's PAYLOAD (the JSON it carries) for the current context,
// typed via its declared schema. Same precedence as the value path — per-user
// override → global DB flag → PostHog — and, like the value path, exposure fires
// ONLY when PostHog is the deciding source: a DB-served payload records no
// $feature_flag_called (PostHog didn't decide it), and a flag with no payload
// records none at all. So a payload read only inflates experiment exposure when
// PostHog actually served the payload the user sees. Returns undefined when the
// flag has no payload anywhere.
export async function getFlagPayload<K extends FlagKey>(
	key: K,
	ctx: FlagContext = {}
): Promise<PayloadOf<K> | undefined> {
	const snapshot = await loadFlagSnapshot(ctx.userId)

	// DB links first, silently — PostHog was not the source, so no exposure.
	const fromDb = resolvePayload(key, snapshot, ctx.userId, undefined)
	if (fromDb !== undefined) return fromDb as PayloadOf<K>

	// Only now consult PostHog. Read the payload silently first; fire exposure
	// only when PostHog actually serves one (getFlagPayload never fires on its
	// own — getFlag does), so a payload-less flag records no exposure.
	const posthog = getPostHogServerClient()
	if (ctx.userId && posthog) {
		try {
			const phSnapshot = await posthog.evaluateFlags(ctx.userId, posthogOptions(ctx))
			const raw = phSnapshot.getFlagPayload(key)
			if (raw != null) {
				const valid = validatePayload(key, raw as JsonValue)
				if (valid !== undefined) {
					phSnapshot.getFlag(key) // exposure: PostHog is the deciding source
					return valid as PayloadOf<K>
				}
			}
		} catch {
			// Abstain — a PostHog failure must not fail the read.
		}
	}
	return undefined
}

// Resolve every flag's value AND payload at once, for seeding the client
// provider. ONE DB read (shared snapshot) and ONE silent PostHog bulk read, then
// resolve each key against them — no per-flag query, no per-flag PostHog call, no
// exposure spam. Both results are plain serialisable objects, safe to pass across
// the server→client boundary. cache()'d.
export const getFlagSnapshot = cache(
	async (ctx: FlagContext = {}): Promise<{ flags: FlagSnapshot; payloads: PayloadSnapshot }> => {
		const [snapshot, bulk] = await Promise.all([loadFlagSnapshot(ctx.userId), loadPostHogBulk(ctx)])
		const providers: readonly FlagProvider[] = [
			overrideProvider(snapshot),
			dbFlagProvider(snapshot),
			posthogBulkProvider(bulk?.values)
		]
		const keys = Object.keys(FLAGS).filter(isFlagKey)
		const flags: Partial<Record<FlagKey, FlagValue>> = {}
		const payloads: Partial<Record<FlagKey, JsonValue>> = {}
		await Promise.all(
			keys.map(async (key) => {
				flags[key] = await walkProviders(key, ctx, providers)
				const payload = resolvePayload(key, snapshot, ctx.userId, bulk?.payloads?.[key])
				if (payload !== undefined) payloads[key] = payload
			})
		)
		return { flags: flags as FlagSnapshot, payloads: payloads as PayloadSnapshot }
	}
)

// Convenience: just the value snapshot (Record of flag → resolved value).
export async function getAllFlags(ctx: FlagContext = {}): Promise<FlagSnapshot> {
	return (await getFlagSnapshot(ctx)).flags
}
