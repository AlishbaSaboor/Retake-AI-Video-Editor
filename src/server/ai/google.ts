import 'server-only'
import {
	GoogleGenAI,
	MediaResolution,
	type FinishReason,
	type GenerateContentParameters,
	type GenerateContentResponse
} from '@google/genai'
import { withTimeout } from '@/lib/with-timeout'
import { env } from '@/lib/env'
import { trackAiCall } from '@/server/lib/ai-usage/sink'
import { log } from '@/server/lib/logger'
import type { TrackedModel } from '@/server/lib/ai-usage/models'
import type { AiUsageMeta } from '@/server/lib/ai-usage/track'

// **This file is the reference pattern, and that is its main job.** It is the
// only file allowed to import the Google Gen AI SDK, enforced by
// no-restricted-imports in eslint.config.mjs. Same shape as
// src/components/ui/icons.tsx: one file owns the dependency, everything else
// imports the wrapper. Feature code never touches the SDK and never calls
// trackAiCall, so a call that isn't costed is not something anyone has to
// remember — it's a lint error. See docs/rules/ai-usage.md.
//
// Keep wrappers to the methods actually in use. Streaming, file uploads for
// long videos, and batch each get a wrapper here the day a feature needs one.

// Created on first use rather than at import: a missing key should fail the
// AI call that needs it, not every page whose module graph reaches this file.
let client: GoogleGenAI | undefined
function gemini(): GoogleGenAI {
	if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set')
	client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
	return client
}

/**
 * The most each Gemini feature may write per call: the visible reply plus the
 * model's thinking, which Gemini bills as output (`ai_usage.output_tokens`).
 * Set from the real replies in `ai_usage` up to 2026-10-12 (360 calls):
 *
 * - Typed commands, highlights and the check are short JSON: at most 161,
 *   169 and 211 seen, so 1,024 leaves room to spare.
 * - A plan is 1.5x the largest seen (5,483, a recording near 5 minutes). It
 *   is not a proven bound: the 5-minute limit caps the input, not the reply,
 *   since the reply's lists have no length limit and thinking isn't bounded
 *   by the recording's length. Bounding the reply's schema and setting a
 *   thinking budget is the known next step. A follow-up answers with the
 *   same reply as a plan, so it gets the same cap.
 *
 * A reply cut off here fails to parse and each feature treats it as no reply;
 * the wrapper logs the cut-off as its own event, so it is never mistaken for
 * a malformed reply.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = {
	parse_edit_command: 1024,
	find_highlights: 1024,
	make_it_check: 1024,
	make_it: 8192,
	make_it_follow_up: 8192
} as const

/** Why a reply stopped, when it hit its output cap: the SDK's own value, checked against its enum. */
const CUT_OFF = 'MAX_TOKENS' satisfies `${FinishReason}`

/** A Gemini feature: one with an output cap, so a call without one doesn't compile. */
export type GeminiFeature = keyof typeof GEMINI_MAX_OUTPUT_TOKENS

/**
 * What the spend is for. `feature` is the axis every cost question gets asked
 * along: `transcribe_take` and `parse_edit_command` answer different
 * questions, `generate` answers none.
 *
 * `meta` takes ids, enums and booleans only — project_id, clip_id, user_id.
 * Never prompt, transcript or completion text. MOAD reads the `ai_usage`
 * table directly, so that constraint is the only thing keeping it safe.
 */
export type AiContext = {
	feature: GeminiFeature
	model: TrackedModel
	meta?: AiUsageMeta
	/** Give up after this long: the request is aborted and the call fails with a TimeoutError (recorded). */
	timeoutMs?: number
}

/** Pictures read at medium detail (~256 tokens each). The SDK's own value, so callers needn't import it. */
export const MEDIA_RESOLUTION_MEDIUM = MediaResolution.MEDIA_RESOLUTION_MEDIUM

/**
 * A tracked `models.generateContent`. Returns the SDK's own response
 * untouched and rethrows its errors untouched.
 *
 * ```ts
 * const response = await generateContent(
 *   { feature: 'parse_edit_command', model: 'gemini-3.5-flash-lite', meta: { project_id: projectId } },
 *   { contents: command }
 * )
 * ```
 *
 * `model` is deliberately not part of the params: it is passed once and used
 * for both the SDK call and the usage row, so the two can never disagree
 * about which model was billed.
 */
export function generateContent(
	context: AiContext,
	params: Omit<GenerateContentParameters, 'model'>
): Promise<GenerateContentResponse> {
	const { timeoutMs, ...tracked } = context
	const maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS[context.feature]
	const call = (abortSignal?: AbortSignal) =>
		gemini().models.generateContent({
			...params,
			model: context.model,
			// The feature's cap wins over anything the caller passed.
			config: { ...params.config, maxOutputTokens, ...(abortSignal && { abortSignal }) }
		})
	return trackAiCall({ provider: 'google', ...tracked }, () =>
		timeoutMs ? withTimeout(timeoutMs, call) : call()
	).then((response) => {
		if (response.candidates?.[0]?.finishReason === CUT_OFF) {
			log.warn('AI reply cut off by its output cap', {
				provider: 'google',
				feature: context.feature,
				maxOutputTokens
			})
		}
		return response
	})
}
