import 'server-only'
import {
	GoogleGenAI,
	type GenerateContentParameters,
	type GenerateContentResponse
} from '@google/genai'
import { env } from '@/lib/env'
import { trackAiCall } from '@/server/lib/ai-usage/sink'
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
 * What the spend is for. `feature` is the axis every cost question gets asked
 * along: `transcribe_take` and `parse_edit_command` answer different
 * questions, `generate` answers none.
 *
 * `meta` takes ids, enums and booleans only — project_id, clip_id, user_id.
 * Never prompt, transcript or completion text. MOAD reads the `ai_usage`
 * table directly, so that constraint is the only thing keeping it safe.
 */
export type AiContext = {
	feature: string
	model: TrackedModel
	meta?: AiUsageMeta
}

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
	return trackAiCall({ provider: 'google', ...context }, () =>
		gemini().models.generateContent({ ...params, model: context.model })
	)
}
