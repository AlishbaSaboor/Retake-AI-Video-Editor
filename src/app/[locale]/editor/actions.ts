'use server'

import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { generateContent } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { EDIT_COMMAND_JSON_SCHEMA, editCommandSchema, type EditCommand } from './edit-command'
import { MAX_AUDIO_BASE64_LENGTH } from './take-audio'
import { TRANSCRIPT_JSON_SCHEMA, transcriptSchema, type Transcript } from './transcript'

// A command is a sentence, not a document — this also caps what one request
// can spend.
const MAX_COMMAND_LENGTH = 300

const UNSUPPORTED: EditCommand = { action: 'unsupported', startSeconds: null, endSeconds: null }

// Gemini answers 429 (rate-limited) or 503 (overloaded) under load — the
// user's cue to retry, not a bug to report, so it's an AppError.
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
		).catch(rethrowAsBusy)
		try {
			const parsed = editCommandSchema.safeParse(JSON.parse(response.text ?? ''))
			return parsed.success ? parsed.data : UNSUPPORTED
		} catch {
			return UNSUPPORTED
		}
	}
})

const TRANSCRIBE_INSTRUCTION = [
	'Transcribe the speech in this audio, verbatim, in the language spoken.',
	'Split it into segments of about one sentence, each with its start and end time',
	'in seconds from the start of the audio. Transcribe speech only — no descriptions',
	'of music, noise or silence. If there is no speech, return an empty segments array.'
].join(' ')

/**
 * Transcribes a take's audio (16 kHz mono WAV, base64) with Gemini. Unlike a
 * command, a malformed reply is an error here: an empty transcript would read
 * as "no speech", which is a claim about the footage we can't back up.
 */
export const transcribeTake = validatedAction({
	input: z.object({ audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_LENGTH) }),
	handler: async ({ audioBase64 }): Promise<Transcript> => {
		const response = await generateContent(
			{ feature: 'transcribe_take', model: 'gemini-3.5-flash-lite' },
			{
				contents: [
					{
						role: 'user',
						parts: [{ inlineData: { mimeType: 'audio/wav', data: audioBase64 } }]
					}
				],
				config: {
					systemInstruction: TRANSCRIBE_INSTRUCTION,
					responseMimeType: 'application/json',
					responseJsonSchema: TRANSCRIPT_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch(rethrowAsBusy)
		const unreadable = new AppError("Couldn't read the transcript. Try again.", { status: 502 })
		let raw: unknown
		try {
			raw = JSON.parse(response.text ?? '')
		} catch {
			throw unreadable
		}
		const parsed = transcriptSchema.safeParse(raw)
		if (!parsed.success) throw unreadable
		return parsed.data
	}
})
