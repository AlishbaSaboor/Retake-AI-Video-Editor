import { z } from 'zod'
import type { FlagKey, JsonValue } from './flags'

// Runtime validation schemas for flag PAYLOADS (the JSON a PostHog flag can
// carry alongside its on/off or variant value — PostHog's "flag payloads"
// feature). Any flag MAY have a payload; declaring its schema here makes that
// payload TYPED end to end (useFlagPayload(key) returns z.infer, not `any`) and
// validated at every boundary (a malformed payload from PostHog or the DB is
// rejected, never trusted).
//
// This lives OUT of flags.ts on purpose. flags.ts is the client-safe registry
// (client.tsx imports it at runtime); keeping zod here means the payload schemas
// — and zod itself — never enter the client bundle. flags.ts imports only the
// TYPES below, which are erased at compile time.
//
// A flag with no entry here still supports payloads, just untyped (JsonValue).
export const PAYLOAD_SCHEMAS = {
	// Example: remotely-tunable payment settings shipped as a flag payload, so an
	// operator can retune retries / surcharge from PostHog without a deploy.
	payments_module: z.object({
		provider: z.enum(['stripe', 'paddle']),
		retries: z.number().int().min(0).max(10),
		surcharge_bps: z.number().int().min(0).max(10_000)
	})
} satisfies Partial<Record<FlagKey, z.ZodType>>

export type PayloadSchemas = typeof PAYLOAD_SCHEMAS

// The flag keys that declare a typed payload schema.
export type PayloadFlagKey = keyof PayloadSchemas

// The payload type of a flag: the schema's inferred type when one is declared,
// otherwise the open JsonValue (an undeclared-but-still-allowed payload).
export type PayloadOf<K extends FlagKey> = K extends PayloadFlagKey
	? z.infer<PayloadSchemas[K]>
	: JsonValue

// Every flag's resolved payload, or undefined when it has none. getFlagSnapshot
// returns this alongside the value snapshot and the client provider is seeded
// with it, so useFlagPayload is a pure read with no client waterfall.
export type PayloadSnapshot = { [K in FlagKey]?: PayloadOf<K> }

// Validate a raw payload (from PostHog or the DB) against the flag's schema.
// Returns the parsed, typed value; undefined when it fails validation (so a
// malformed payload abstains rather than escaping untyped). A flag with no
// declared schema passes its payload through as JsonValue.
export function validatePayload(key: FlagKey, raw: JsonValue): JsonValue | undefined {
	const schema = (PAYLOAD_SCHEMAS as Partial<Record<FlagKey, z.ZodType>>)[key]
	if (!schema) return raw
	const parsed = schema.safeParse(raw)
	return parsed.success ? (parsed.data as JsonValue) : undefined
}
