'use server'

import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { deepgramWords, transcribeAudio } from '@/server/ai/deepgram'
import { generateContent } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { EDIT_COMMAND_JSON_SCHEMA, editCommandSchema, type EditCommand } from './edit-command'
import { MAX_AUDIO_BASE64_LENGTH } from './take-audio'
import { toTranscript, type Transcript } from './transcript'

// A command is a sentence, not a document — this also caps what one request
// can spend.
const MAX_COMMAND_LENGTH = 300

const UNSUPPORTED: EditCommand = {
	action: 'unsupported',
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null
}

// Gemini and Deepgram both answer 429 (rate-limited) or 503 (overloaded)
// under load — the user's cue to retry, not a bug to report, so an AppError.
const busyResponse = z.object({ status: z.union([z.literal(429), z.literal(503)]) })

function rethrowAsBusy(error: unknown): never {
	if (busyResponse.safeParse(error).success) {
		throw new AppError('The AI is busy right now. Try again in a moment.', { status: 503 })
	}
	throw error
}

function systemInstruction(durationSeconds: number): string {
	return [
		'You turn one video-editing command into JSON. The video is',
		`${durationSeconds.toFixed(1)} seconds long.`,
		'"Cut from X to Y" (or "keep X to Y", "trim to X–Y") means keep only that range:',
		'action "trim" with startSeconds X and endSeconds Y, converting minutes to seconds.',
		'Use null for an edge the command leaves at the clip boundary ("from 3s to the end").',
		'A title card ("add the title Welcome for the first 3 seconds") is action "title"',
		'with text the exact words to show, and startSeconds/endSeconds when it is on screen',
		'(the first 3 seconds: 0 and 3; null for an edge left open).',
		'A watermark or logo in a corner is action "watermark" with corner one of',
		'"top-left", "top-right", "bottom-left", "bottom-right", or null if none is named.',
		'Unused fields are null. Anything else — removing a middle section, other effects,',
		'audio — is action "unsupported" with every other field null.'
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
		).catch(rethrowAsBusy)
		try {
			const parsed = editCommandSchema.safeParse(JSON.parse(response.text ?? ''))
			return parsed.success ? parsed.data : UNSUPPORTED
		} catch {
			return UNSUPPORTED
		}
	}
})

/**
 * Transcribes a take's audio (16 kHz mono WAV, base64) with Deepgram, which
 * keeps filler words and times every word against the audio — the timing
 * filler clean-up is built on. Malformed replies fail validation inside the
 * wrapper and surface as an error, never as an empty "no speech" transcript.
 */
export const transcribeTake = validatedAction({
	input: z.object({ audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_LENGTH) }),
	handler: async ({ audioBase64 }): Promise<Transcript> => {
		const response = await transcribeAudio(
			{ feature: 'transcribe_take', model: 'nova-3' },
			Buffer.from(audioBase64, 'base64'),
			'audio/wav'
		).catch(rethrowAsBusy)
		return toTranscript(deepgramWords(response))
	}
})
