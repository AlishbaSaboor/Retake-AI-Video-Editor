'use server'

import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { generateContent } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { EDIT_COMMAND_JSON_SCHEMA, editCommandSchema, type EditCommand } from './edit-command'

// A command is a sentence, not a document — this also caps what one request
// can spend.
const MAX_COMMAND_LENGTH = 300

const UNSUPPORTED: EditCommand = { action: 'unsupported', startSeconds: null, endSeconds: null }

// Gemini answers 429 (rate-limited) or 503 (overloaded) under load — the
// user's cue to retry, not a bug to report, so it's an AppError.
const busyResponse = z.object({ status: z.union([z.literal(429), z.literal(503)]) })

function systemInstruction(durationSeconds: number): string {
	return [
		'You turn one video-editing command into JSON. The video is',
		`${durationSeconds.toFixed(1)} seconds long.`,
		'"Cut from X to Y" (or "keep X to Y", "trim to X–Y") means keep only that range:',
		'action "trim" with startSeconds X and endSeconds Y, converting minutes to seconds.',
		'Use null for an edge the command leaves at the clip boundary ("from 3s to the end").',
		'Anything else — removing a middle section, effects, text, audio — is action',
		'"unsupported" with both edges null.'
	].join(' ')
}

/**
 * Parses a typed editing command with Gemini into a structured action. A
 * reply that isn't valid JSON in the expected shape comes back as
 * "unsupported" rather than an error, so the user sees "try rephrasing",
 * not "something went wrong".
 */
export const parseEditCommand = validatedAction({
	input: z.object({
		command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
		durationSeconds: z.number().positive()
	}),
	handler: async ({ command, durationSeconds }): Promise<EditCommand> => {
		const response = await generateContent(
			{ feature: 'parse_edit_command', model: 'gemini-3.5-flash-lite' },
			{
				contents: command,
				config: {
					systemInstruction: systemInstruction(durationSeconds),
					responseMimeType: 'application/json',
					responseJsonSchema: EDIT_COMMAND_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch((error: unknown) => {
			if (busyResponse.safeParse(error).success) {
				throw new AppError('The AI is busy right now. Try again in a moment.', { status: 503 })
			}
			throw error
		})
		try {
			const parsed = editCommandSchema.safeParse(JSON.parse(response.text ?? ''))
			return parsed.success ? parsed.data : UNSUPPORTED
		} catch {
			return UNSUPPORTED
		}
	}
})
