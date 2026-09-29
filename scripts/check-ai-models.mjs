#!/usr/bin/env node
// Checks this project's model map against OpenRouter's live catalogue.
//
// This is the direction TypeScript cannot catch. `TrackedModel` in
// src/server/lib/ai-usage/models.ts already makes an unmapped model a
// typecheck failure at the call site; what it cannot see is a slug that was
// correct when it was written and has since been retired upstream. That is
// how a mapping rots with nobody touching the code, and how a model silently
// starts costing $0 in the reports.
//
// Usage: node --import ./scripts/register-ts.mjs scripts/check-ai-models.mjs
//
// Exit codes: 0 clean (or upstream unreachable), 1 a mapped slug is gone.

import { fetchRateCard } from '../src/server/lib/ai-usage/pricing.ts'
import { OPENROUTER_SLUGS } from '../src/server/lib/ai-usage/models.ts'

const mapped = Object.entries(OPENROUTER_SLUGS)

if (mapped.length === 0) {
	console.log('No models mapped — nothing to check. (A project with no AI calls is fine here.)')
	process.exit(0)
}

let rates
try {
	rates = await fetchRateCard()
} catch (error) {
	// Deliberately not a failure. A network blip upstream must not turn every
	// PR in every repo red, and the runtime path already degrades correctly:
	// no rate card means rows are written unpriced and reported in the
	// `unpriced` array, not lost and not zeroed.
	console.warn(`Could not reach OpenRouter, skipping the check: ${error.message}`)
	process.exit(0)
}

const retired = mapped.filter(([, slug]) => !rates.has(slug))

if (retired.length > 0) {
	console.error(
		`OpenRouter no longer lists ${retired.length} mapped slug(s). Until they are ` +
			`updated in src/server/lib/ai-usage/models.ts, every call to these models ` +
			`is recorded unpriced:\n`
	)
	for (const [model, slug] of retired) {
		console.error(`  ${model}  ->  ${slug}`)
	}
	console.error(
		`\nFind the current slug at https://openrouter.ai/api/v1/models — note that ` +
			`the id and the canonical_slug differ, and it is the "id" field that belongs here.`
	)
	process.exit(1)
}

console.log(`All ${mapped.length} mapped model(s) still priced by OpenRouter.`)

// Batch tiers are separate upstream entries, so a model can be mapped
// correctly and still have no batch price. Worth saying out loud rather than
// failing on, since most projects never call the batch tier.
const withoutBatch = mapped
	.filter(([, slug]) => !rates.has(`${slug}:batch`))
	.map(([model]) => model)
if (withoutBatch.length > 0) {
	console.log(`No batch tier upstream for: ${withoutBatch.join(', ')} (fine unless you use it).`)
}
