import { z } from 'zod'

// What Gemini returns for a take's audio: roughly sentence-length segments,
// timed in seconds from the start of the clip.
export const transcriptSchema = z.object({
	segments: z.array(
		z.object({
			startSeconds: z.number().nonnegative(),
			endSeconds: z.number().nonnegative(),
			text: z.string()
		})
	)
})
export type Transcript = z.infer<typeof transcriptSchema>

/** The same shape as JSON Schema, for Gemini's structured output. */
export const TRANSCRIPT_JSON_SCHEMA = {
	type: 'object',
	properties: {
		segments: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					startSeconds: { type: 'number' },
					endSeconds: { type: 'number' },
					text: { type: 'string' }
				},
				required: ['startSeconds', 'endSeconds', 'text']
			}
		}
	},
	required: ['segments']
}
