import 'server-only'
import { after } from 'next/server'
import { db } from '@/server/db/client'
import { captureError } from '@/lib/observability/capture-error'
import { openRouterSlug } from './models'
import { costMicroUsd, rateCard } from './pricing'
import { createAiTracker, type AiUsageRow } from './track'

// The real sink: price the row, write it, and make sure a failure here can
// only ever cost a row, never the AI call that produced it. Everything that
// makes this untestable under `node --test` (server-only, next/server, the
// Prisma client) is confined to this file so track.ts stays pure.

// Deduped per process. Sentry is for things an engineer must fix, and a model
// that is unmapped on one call is unmapped on the next ten thousand —
// alerting on each would guarantee the alert gets muted, which is the exact
// failure this whole design is built to avoid.
const reportedModels = new Set<string>()

/**
 * Wrap a provider call so its token usage lands in `ai_usage`.
 *
 * ```ts
 * const message = await trackAiCall(
 *   { provider: 'anthropic', model: 'claude-opus-5', feature: 'offer_copy' },
 *   () => anthropic.messages.create({ model: 'claude-opus-5', ... })
 * )
 * ```
 *
 * Returns the provider's response untouched, and rethrows its errors
 * untouched. See docs/rules/ai-usage.md.
 */
export const trackAiCall = createAiTracker(recordUsage)

function recordUsage(row: AiUsageRow): void {
	const write = persist(row).catch((error) => {
		captureError(error, { feature: row.feature, provider: row.provider, model: row.model })
	})
	try {
		// Keeps the write alive past the response on Vercel without adding its
		// latency to the response.
		after(write)
	} catch {
		// Not inside a request scope (a script, a queue worker, a test) — the
		// promise is already running, so there is nothing left to arrange.
	}
}

async function persist(row: AiUsageRow): Promise<void> {
	const rates = await rateCard()
	// Two lookups, two jobs. The tier-suffixed slug is what prices the call,
	// since `:batch` is a separate upstream entry at half price. The base slug
	// is what gets stored, because `service_tier` already carries the tier and
	// folding it into the model id would split every group-by-model in two.
	const pricingSlug = openRouterSlug(row.model, row.serviceTier)
	const baseSlug = openRouterSlug(row.model)
	if (pricingSlug == null) reportUnmappedModel(row)

	const cost = pricingSlug == null ? null : costMicroUsd(row, rates?.get(pricingSlug))
	await db.aiUsage.create({
		data: {
			provider: row.provider,
			// The OpenRouter slug, so one model reads as one model across every
			// repo. A provider serves the same model under different ids
			// depending on whether the call named a dated or a floating alias,
			// and the slug is the only form that collapses them.
			//
			// Falls back to the provider's raw id when nothing is mapped. That
			// is the string someone needs in order to find the slug, and those
			// rows are exactly the ones carrying a NULL cost.
			model: baseSlug ?? row.model,
			serviceTier: row.serviceTier,
			feature: row.feature,
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			cacheWriteTokens: row.cacheWriteTokens,
			cacheReadTokens: row.cacheReadTokens,
			costMicroUsd: cost == null ? null : BigInt(cost),
			status: row.status,
			latencyMs: row.latencyMs,
			requestId: row.requestId,
			meta: row.meta
		}
	})
}

function reportUnmappedModel(row: AiUsageRow): void {
	if (reportedModels.has(row.model)) return
	reportedModels.add(row.model)
	captureError(
		new Error(`No OpenRouter slug mapped for model "${row.model}" — usage is recorded unpriced`),
		{ provider: row.provider, model: row.model, feature: row.feature }
	)
}
