'use server'

import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { requirePermission } from '@/lib/rbac/context'
import {
	isFlagKey,
	isVariantFlag,
	isVariantOf,
	type FlagKey,
	type JsonValue
} from '@/lib/flags/flags'
import { validatePayload } from '@/lib/flags/payload-schemas'
import { validatedAction } from '@/server/actions/validated-action'
import { db, Prisma } from '@/server/db/client'
import { log } from '@/server/lib/logger'

// Admin writes for feature flags. These are the ONLY sanctioned write paths to
// the FeatureFlag / FeatureFlagOverride tables (docs/rules/feature-flags.md):
// reads are server-side Prisma via src/lib/flags/server.ts, writes come through
// here, each gated by the flags.manage admin permission. Built on validatedAction
// so the Zod contract, AppError -> status/userMessage translation, and Sentry
// reporting are the same as every other action (docs/rules/error-handling.md).
// The permission check runs FIRST, before any DB work.

// Reject an unknown key up front — the tables are keyed by the typed FLAGS
// registry, so an off-registry key is a caller mistake, not an orphan row to
// write.
function assertFlagKey(key: string): asserts key is FlagKey {
	if (!isFlagKey(key)) {
		throw new AppError('That feature flag does not exist.', { status: 400, code: 'unknown_flag' })
	}
}

// Validate a variant string against the flag: it must be a variant flag and the
// value must be one of its declared variants.
function assertVariant(key: FlagKey, variant: string): void {
	if (!isVariantFlag(key) || !isVariantOf(key, variant)) {
		throw new AppError('That variant is not valid for this flag.', {
			status: 400,
			code: 'invalid_variant'
		})
	}
}

// Validate a weights map: the flag must be a variant flag, every key a declared
// variant, every weight a non-negative integer.
function assertWeights(key: FlagKey, weights: Record<string, number>): void {
	if (!isVariantFlag(key)) {
		throw new AppError('Variant weights only apply to a variant flag.', {
			status: 400,
			code: 'invalid_variant'
		})
	}
	for (const variant of Object.keys(weights)) {
		if (!isVariantOf(key, variant)) {
			throw new AppError('A weighted variant is not valid for this flag.', {
				status: 400,
				code: 'invalid_variant'
			})
		}
	}
}

// Validate a payload against the flag's declared schema (payload-schemas.ts).
// Returns the parsed value to store; throws when it fails validation so a
// malformed payload is never persisted.
function parsePayloadOrThrow(key: FlagKey, payload: JsonValue): JsonValue {
	const valid = validatePayload(key, payload)
	if (valid === undefined) {
		throw new AppError('That payload does not match the flag schema.', {
			status: 400,
			code: 'invalid_payload'
		})
	}
	return valid
}

// A nullable JSON write: a value stores it, explicit null clears the column
// (Prisma.DbNull for a nullable Json column).
function jsonWrite(value: JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
	return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
}

// rolloutPercent is a whole-number percentage in [0, 100]; null clears any
// gradual rollout. variant / variantWeights / payload are the granular columns;
// each defaults to null (unset) and is validated per key below.
const toggleFeatureFlagInput = z.object({
	key: z.string().min(1),
	enabled: z.boolean(),
	rolloutPercent: z.number().int().min(0).max(100).nullable().default(null),
	variant: z.string().min(1).nullable().default(null),
	variantWeights: z.record(z.string(), z.number().int().min(0)).nullable().default(null),
	payload: z.unknown().nullable().default(null)
})

export const toggleFeatureFlag = validatedAction({
	input: toggleFeatureFlagInput,
	handler: async (input) => {
		const ctx = await requirePermission('flags.manage')
		assertFlagKey(input.key)

		if (input.variant !== null) assertVariant(input.key, input.variant)
		if (input.variantWeights !== null) assertWeights(input.key, input.variantWeights)
		const payload =
			input.payload == null ? null : parsePayloadOrThrow(input.key, input.payload as JsonValue)

		const data = {
			enabled: input.enabled,
			rolloutPercent: input.rolloutPercent,
			variant: input.variant,
			variantWeights: jsonWrite(input.variantWeights),
			payload: jsonWrite(payload)
		}

		const flag = await db.featureFlag.upsert({
			where: { key: input.key },
			create: { key: input.key, ...data },
			update: data,
			select: {
				key: true,
				enabled: true,
				rolloutPercent: true,
				variant: true,
				variantWeights: true,
				payload: true
			}
		})

		// Structured audit line — who changed which flag to what. Through the
		// server logger, never console.* (docs/rules/logging.md); the actor id is
		// an id, not PII.
		log.info('feature flag toggled', {
			flagKey: flag.key,
			enabled: flag.enabled,
			rolloutPercent: flag.rolloutPercent,
			variant: flag.variant,
			hasWeights: input.variantWeights !== null,
			hasPayload: payload !== null,
			actorId: ctx.user.id
		})

		return flag
	}
})

// Pin a single user on/off (or to a specific variant / payload) for a flag —
// the FeatureFlagOverride write path. Same gate and audit discipline as the
// global toggle; the (flagKey, userId) pair is unique, so this upserts.
const setFeatureFlagOverrideInput = z.object({
	key: z.string().min(1),
	userId: z.string().uuid(),
	enabled: z.boolean(),
	variant: z.string().min(1).nullable().default(null),
	payload: z.unknown().nullable().default(null)
})

export const setFeatureFlagOverride = validatedAction({
	input: setFeatureFlagOverrideInput,
	handler: async (input) => {
		const ctx = await requirePermission('flags.manage')
		assertFlagKey(input.key)

		if (input.variant !== null) assertVariant(input.key, input.variant)
		const payload =
			input.payload == null ? null : parsePayloadOrThrow(input.key, input.payload as JsonValue)

		const data = {
			enabled: input.enabled,
			variant: input.variant,
			payload: jsonWrite(payload)
		}

		const override = await db.featureFlagOverride.upsert({
			where: { flagKey_userId: { flagKey: input.key, userId: input.userId } },
			create: { flagKey: input.key, userId: input.userId, ...data },
			update: data,
			select: { flagKey: true, userId: true, enabled: true, variant: true, payload: true }
		})

		log.info('feature flag override set', {
			flagKey: override.flagKey,
			targetUserId: override.userId,
			enabled: override.enabled,
			variant: override.variant,
			hasPayload: payload !== null,
			actorId: ctx.user.id
		})

		return override
	}
})
