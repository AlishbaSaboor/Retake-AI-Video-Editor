import type { TokenCounts } from './pricing'
import type { AiCallStatus, AiProvider, ServiceTier, TrackedModel } from './models'
import { extractUsage, type UsageExtractor } from './usage'

// Orchestration only: wrap a provider call, time it, build the row, hand the
// row to a sink. Deliberately imports neither `next/server` nor the Prisma
// client, so the whole thing is unit-testable under `node --test` — the sink
// is where those live (see sink.ts). The injection is load-bearing, not
// decorative: it is the only reason the "a tracking failure never breaks the
// AI call" test can exist.

export type AiUsageRow = TokenCounts & {
	provider: AiProvider
	model: string
	serviceTier: ServiceTier
	feature: string
	status: AiCallStatus
	latencyMs: number
	requestId?: string
	meta?: AiUsageMeta
	/** Audio billed, for per-minute providers; priced from this instead of tokens. */
	audioSeconds?: number
}

// Ids, enums and booleans only — the same rule as an analytics property
// (docs/rules/analytics.md rule 5). No prompt text, no completion text, no
// free text a human typed.
export type AiUsageMeta = Record<string, string | number | boolean>

export type AiCallSpec = {
	provider: AiProvider
	// What the spend is FOR. Required, and worth a moment's thought: it is
	// the axis every cost question gets asked along.
	feature: string
	// The model being asked for. Constrained to the mapped set on purpose:
	// this is the compile-time half of the loud failure, so a new model has
	// to be registered in models.ts before a call site can name it. Also the
	// fallback recorded when the call throws before a response exists, or
	// when the response carries no model of its own (image and embedding
	// endpoints often don't).
	model: TrackedModel
	serviceTier?: ServiceTier
	meta?: AiUsageMeta
	// Override for a response shape the built-in extractors don't know —
	// a streamed aggregate, an image endpoint, a provider SDK's own wrapper.
	extract?: UsageExtractor
}

export type UsageSink = (row: AiUsageRow) => void

const NO_TOKENS: TokenCounts = {
	inputTokens: 0,
	outputTokens: 0,
	cacheWriteTokens: 0,
	cacheReadTokens: 0
}

/**
 * Why a call failed, in what `meta` may hold: the error's type and, when it
 * has one, its HTTP status (429, 503, ...). Never its message, which is free
 * text and can echo what was sent.
 */
export function failureMeta(error: unknown): AiUsageMeta {
	const meta: AiUsageMeta = { error_type: error instanceof Error ? error.name : typeof error }
	if (typeof error === 'object' && error !== null && 'status' in error) {
		if (typeof error.status === 'number') meta.error_status = error.status
	}
	return meta
}

export function buildRow(
	spec: AiCallSpec,
	response: unknown,
	outcome: { status: AiCallStatus; latencyMs: number; failure?: AiUsageMeta }
): AiUsageRow {
	const extracted =
		outcome.status === 'error'
			? undefined
			: (spec.extract ?? ((raw) => extractUsage(spec.provider, raw)))(response)
	return {
		provider: spec.provider,
		// The served model wins over the requested one — that is the whole
		// point of the column, and of a billing dispute.
		model: extracted?.model ?? spec.model,
		serviceTier: spec.serviceTier ?? 'standard',
		feature: spec.feature,
		status: extracted?.status ?? outcome.status,
		latencyMs: outcome.latencyMs,
		requestId: extracted?.requestId,
		meta: outcome.failure ? { ...spec.meta, ...outcome.failure } : spec.meta,
		audioSeconds: extracted?.audioSeconds,
		...(extracted?.tokens ?? NO_TOKENS)
	}
}

export function createAiTracker(sink: UsageSink) {
	// Nothing in the tracking path is allowed to reach the caller. A failed
	// row costs a line in a spend report; a failed AI call costs a user their
	// feature. That trade is never close, so this swallows everything —
	// including a bug in buildRow or in a caller's own `extract`.
	function record(
		spec: AiCallSpec,
		response: unknown,
		status: AiCallStatus,
		startedAt: number,
		failure?: AiUsageMeta
	) {
		try {
			sink(buildRow(spec, response, { status, latencyMs: Date.now() - startedAt, failure }))
		} catch {
			// The sink is responsible for reporting its own failures to Sentry;
			// it holds the context to do it usefully and this frame does not.
		}
	}

	return async function trackAiCall<T>(spec: AiCallSpec, call: () => Promise<T>): Promise<T> {
		const startedAt = Date.now()
		try {
			const response = await call()
			record(spec, response, 'ok', startedAt)
			return response
		} catch (error) {
			record(spec, undefined, 'error', startedAt, failureMeta(error))
			throw error
		}
	}
}
