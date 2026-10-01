import { z } from 'zod'
import type { TokenCounts } from './pricing'
import type { AiCallStatus, AiProvider } from './models'

// Reads token counts, the served model id, the request id and a refusal
// signal out of a raw provider response. Zod rather than hand-rolled
// narrowing so an unexpected response shape degrades to "no usage recorded"
// instead of throwing inside the tracking path (docs/rules/code-style.md:
// every external contract is parsed, never assumed).
//
// **The trap this file exists to contain:** the three providers disagree on
// whether the prompt-token count already includes cached tokens.
//
//   Anthropic  input_tokens EXCLUDES both cache figures. Add all four.
//   OpenAI     prompt_tokens INCLUDES cached_tokens. Subtract, or every
//              cache hit gets billed twice in our numbers.
//   Google     promptTokenCount INCLUDES cachedContentTokenCount. Same.
//
// Get this wrong and the totals are plausible, self-consistent, and wrong,
// which is the hardest kind of wrong to notice.
//
// The same disagreement runs on the output side, over whether the completion
// count already includes reasoning tokens:
//
//   Anthropic  output_tokens INCLUDES thinking. Nothing to add.
//   OpenAI     completion_tokens INCLUDES reasoning_tokens. Nothing to add.
//   Google     candidatesTokenCount EXCLUDES thoughtsTokenCount. Add it, or
//              every thinking call under-reports by however much it thought,
//              which on a reasoning-heavy call is most of the output.
//
// Google is the only one of the three needing work here, which is why it is
// the one that gets missed.
//
// Only Google's extractor is live — Retake calls no other provider. The table
// above stays so whoever adds one writes its extractor against it.

export type ExtractedUsage = {
	model?: string
	requestId?: string
	status?: AiCallStatus
	tokens: TokenCounts
}

export type UsageExtractor = (response: unknown) => ExtractedUsage | undefined

const count = z
	.number()
	.nullish()
	.transform((value) => value ?? 0)

const googleResponse = z.object({
	responseId: z.string().optional(),
	modelVersion: z.string().optional(),
	candidates: z.array(z.object({ finishReason: z.string().nullish() })).optional(),
	usageMetadata: z.object({
		promptTokenCount: count,
		candidatesTokenCount: count,
		cachedContentTokenCount: count,
		thoughtsTokenCount: count
	})
})

// Never let a negative fall through: a provider changing its accounting mid-
// flight should show up as an odd-looking zero, not as a credit.
function nonNegative(value: number): number {
	return value > 0 ? value : 0
}

const EXTRACTORS: Record<AiProvider, UsageExtractor> = {
	google: (response) => {
		const parsed = googleResponse.safeParse(response)
		if (!parsed.success) return undefined
		const { responseId, modelVersion, candidates, usageMetadata: usage } = parsed.data
		const cached = usage.cachedContentTokenCount
		const blocked = candidates?.[0]?.finishReason
		return {
			model: modelVersion,
			requestId: responseId,
			status: blocked === 'SAFETY' || blocked === 'PROHIBITED_CONTENT' ? 'refusal' : 'ok',
			tokens: {
				inputTokens: nonNegative(usage.promptTokenCount - cached),
				// Merged into the output figure rather than given a column of
				// its own: Google bills thinking at the completion rate, so
				// the arithmetic is identical either way, and the other two
				// providers fold it in upstream with no way to unfold it. A
				// Google-only column would leave `output_tokens` meaning
				// different things per provider. Split it out if Google ever
				// prices thinking off the output rate.
				outputTokens: usage.candidatesTokenCount + usage.thoughtsTokenCount,
				cacheWriteTokens: 0,
				cacheReadTokens: cached
			}
		}
	}
}

export function extractUsage(provider: AiProvider, response: unknown): ExtractedUsage | undefined {
	return EXTRACTORS[provider](response)
}
