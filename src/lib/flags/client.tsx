'use client'

import { createContext, useContext, useMemo } from 'react'
import { captureClientError } from '@/lib/observability/capture-client-error'
// FLAGS is imported at RUNTIME here (not type-only) so the hooks have a control /
// default fallback when the provider is missing. Safe and light: flags.ts has no
// server-only import and no heavy deps (no zod/PostHog — the payload schemas live
// in payload-schemas.ts, imported type-only below) — it's a small const object.
// Flags are still resolved on the SERVER and passed down as plain snapshots; the
// client never reads the registry to *resolve* a flag, only to recover a default
// on a wiring error.
import { FLAGS, type FlagKey, type FlagSnapshot, type ValueOf } from '@/lib/flags/flags'
// Type-only: pulls no zod into the client bundle.
import type { PayloadOf, PayloadSnapshot } from '@/lib/flags/payload-schemas'

// Everything the client hooks read, both server-resolved: `flags` maps every
// flag to its value (boolean | variant), `payloads` maps the flags that carry
// one to their JSON payload. The client NEVER fetches or resolves a flag itself —
// no provider chain, no PostHog call, no waterfall; every value is decided before
// hydration. Both stay plain objects so they serialize cleanly.
type FlagContextValue = {
	flags: FlagSnapshot
	payloads: PayloadSnapshot
}

// null sentinel = provider not mounted. Distinguishing "no provider" from "flag
// absent / off" lets the hooks surface a real misconfiguration (a consumer
// rendered outside the tree) instead of silently reporting every flag as off.
const FeatureFlagContext = createContext<FlagContextValue | null>(null)

export function FeatureFlagProvider({
	flags,
	payloads,
	children
}: {
	flags: FlagSnapshot
	payloads: PayloadSnapshot
	children: React.ReactNode
}): React.ReactElement {
	// Memoize so the context value is referentially stable across re-renders that
	// don't change the snapshots, avoiding needless re-renders of every consumer.
	// The React Compiler (panicThreshold 'all_errors') memoizes aggressively; a
	// narrow dependency on the two props keeps that analysis clean.
	const value = useMemo(() => ({ flags, payloads }), [flags, payloads])

	return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>
}

// Reads a single flag from the server-seeded snapshot as an on/off boolean. A
// boolean flag is on when true; a variant/experiment flag is on whenever it
// holds any variant (only an explicit false — a PostHog-disabled flag — reads as
// off). Returns false for an unknown flag. If called outside a
// FeatureFlagProvider, that's a wiring bug — report it through captureClientError
// (never console.* or Sentry directly, docs/rules/error-handling.md) and fail
// closed (off).
export function useFlag(flag: string): boolean {
	const ctx = useContext(FeatureFlagContext)

	if (ctx === null) {
		captureClientError(new Error('useFlag called outside FeatureFlagProvider'), { flag })
		return false
	}

	// Public param is a plain string; the internal snapshot is keyed by FlagKey.
	// Under noUncheckedIndexedAccess the lookup is ValueOf | undefined. "On" is
	// anything present that isn't the explicit off value (false).
	const value = ctx.flags[flag as FlagKey] as FlagSnapshot[FlagKey] | undefined
	return value !== undefined && value !== false
}

// Reads a variant/experiment flag as its exact typed value (e.g.
// 'control' | 'compact' | 'spacious'). Use this — not useFlag — when you need to
// branch on WHICH variant. The value is already resolved on the server (a
// declared variant or the control default), so this is a pure snapshot read.
// Fails closed to the registry default if the flag is missing or the provider
// isn't mounted.
export function useVariant<K extends FlagKey>(flag: K): ValueOf<K> {
	const ctx = useContext(FeatureFlagContext)

	if (ctx === null) {
		captureClientError(new Error('useVariant called outside FeatureFlagProvider'), { flag })
		return FLAGS[flag].default as ValueOf<K>
	}

	const value = ctx.flags[flag]
	return value === undefined ? (FLAGS[flag].default as ValueOf<K>) : value
}

// Reads a flag's PAYLOAD (the JSON it carries) as its declared, typed shape.
// Returns undefined when the flag has no payload set. Any flag — boolean or
// variant — may carry a payload (PostHog's flag-payloads feature). Fails closed
// to undefined if the provider isn't mounted.
export function useFlagPayload<K extends FlagKey>(flag: K): PayloadOf<K> | undefined {
	const ctx = useContext(FeatureFlagContext)

	if (ctx === null) {
		captureClientError(new Error('useFlagPayload called outside FeatureFlagProvider'), { flag })
		return undefined
	}

	return ctx.payloads[flag]
}

// Renders children only when the flag is on, otherwise the optional fallback.
// Thin wrapper over useFlag so gating a subtree reads declaratively in JSX.
export function Feature({
	flag,
	children,
	fallback = null
}: {
	flag: string
	children: React.ReactNode
	fallback?: React.ReactNode
}): React.ReactNode {
	return useFlag(flag) ? children : fallback
}

// Renders children only when a variant/experiment flag resolves to `value`,
// otherwise the optional fallback. `value` is constrained to that flag's own
// variant union, so a typo or an off-list variant is a compile error. Reads
// declaratively in JSX alongside <Feature>.
export function Variant<K extends FlagKey>({
	flag,
	value,
	children,
	fallback = null
}: {
	flag: K
	value: ValueOf<K>
	children: React.ReactNode
	fallback?: React.ReactNode
}): React.ReactNode {
	return useVariant(flag) === value ? children : fallback
}
