import 'server-only'
import { z } from 'zod'
import { env } from '@/lib/env'
import { withTimeout } from '@/lib/with-timeout'
import { trackAiCall } from '@/server/lib/ai-usage/sink'
import type { AudioMinuteModel } from '@/server/lib/ai-usage/models'
import type { AiUsageMeta } from '@/server/lib/ai-usage/track'

// The only file that talks to Deepgram, and the only place its calls are
// costed — same layering as google.ts (see docs/rules/ai-usage.md). Deepgram
// is plain HTTPS, so there's no SDK to wrap: this file owns the request,
// the response contract, and the tracking.
//
// Deepgram over Gemini for transcripts because its word timings are measured
// against the audio: on an exact-timing benchmark it found every filler with
// edges 25-105 ms off, where Gemini's model-written timestamps were 108-438
// ms off and missed one. That is still too coarse to cut on alone — the
// editor snaps each filler to the real gaps in the audio (filler-cuts.ts).

const LISTEN_URL = 'https://api.deepgram.com/v1/listen'

const wordSchema = z.object({
	word: z.string(),
	punctuated_word: z.string().optional(),
	start: z.number().nonnegative(),
	end: z.number().nonnegative()
})

const responseSchema = z.object({
	metadata: z.object({ request_id: z.string().optional(), duration: z.number().nonnegative() }),
	results: z.object({
		channels: z.array(z.object({ alternatives: z.array(z.object({ words: z.array(wordSchema) })) }))
	})
})
export type DeepgramResponse = z.infer<typeof responseSchema>
export type DeepgramWord = z.infer<typeof wordSchema>

/** A non-2xx reply, carrying its HTTP status so callers can tell "busy" from broken. */
export class DeepgramError extends Error {
	readonly status: number
	constructor(status: number) {
		super(`Deepgram responded ${status}`)
		this.name = 'DeepgramError'
		this.status = status
	}
}

export type TranscribeContext = {
	feature: string
	model: AudioMinuteModel
	meta?: AiUsageMeta
	/** Give up after this long: the request is aborted and the call fails with a TimeoutError (recorded). */
	timeoutMs: number
}

/**
 * A tracked pre-recorded transcription. `filler_words` keeps "um"/"uh" in
 * the word list (Deepgram drops them by default). Costed per audio minute
 * from the duration Deepgram reports.
 */
export function transcribeAudio(
	context: TranscribeContext,
	audio: Uint8Array,
	mimeType: string
): Promise<DeepgramResponse> {
	const { timeoutMs, ...tracked } = context
	return trackAiCall({ provider: 'deepgram', ...tracked }, () =>
		withTimeout(timeoutMs, async (signal) => {
			if (!env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY is not set')
			const params = new URLSearchParams({
				model: context.model,
				filler_words: 'true',
				punctuate: 'true'
			})
			const response = await fetch(`${LISTEN_URL}?${params}`, {
				method: 'POST',
				headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': mimeType },
				body: new Blob([audio.slice()], { type: mimeType }),
				signal
			})
			if (!response.ok) throw new DeepgramError(response.status)
			return responseSchema.parse(await response.json())
		})
	)
}

/** The word list of the first channel's best alternative. */
export function deepgramWords(response: DeepgramResponse): DeepgramWord[] {
	return response.results.channels[0]?.alternatives[0]?.words ?? []
}
