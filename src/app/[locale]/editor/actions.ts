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
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null,
	degrees: null,
	axis: null,
	aspect: null,
	percent: null,
	seconds: null,
	property: null,
	target: null,
	color: null,
	background: null,
	font: null
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

// Terse on purpose: every word is paid for on every command. Each line names
// an action and its fields; examples only where the mapping isn't obvious.
function systemInstruction(durationSeconds: number, clipCount: number): string {
	return [
		`Turn one video-editing command into JSON. The video is ${durationSeconds.toFixed(1)} s long,`,
		`in ${clipCount} clips.`,
		'Times are in seconds (convert minutes). Unused fields are null; null for an edge left open.',
		'Clips count from 1. Actions:',
		'trim: keep startSeconds to endSeconds ("cut from 2 to 5", "keep 1:05 to 1:20").',
		'split at startSeconds. merge fromClip to toClip (both null: all clips).',
		'move fromClip to position toClip (null: the end).',
		'cleanup: remove silences and filler words. undo, redo, reset (start over), export (or download).',
		'speed: preview rate only, no clip named ("play at 2x": 2). rerecord: the sentence at startSeconds.',
		'clip_speed: how fast clips really play, rate 0.25 to 4, fromClip (null: every clip)',
		'("make clip 2 play at 2x", "slow the last clip to half speed", "speed the whole video up 1.5x").',
		'Between clips fromClip and toClip, seconds long (all null: every pair): fade_transition',
		'("a fade between clips", through black), dissolve (a dissolve or cross-fade), remove_transition.',
		'delete_clip, duplicate_clip: fromClip.',
		'color: property brightness, contrast or saturation with percent the change (more: 20,',
		'less: -20), or property black_and_white, warm, cool, or normal (colors back to normal);',
		'fromClip (null: whole video).',
		'text_style: target title, captions or text (the on-video text); color and background as',
		'a color name or #rrggbb (background "none" removes it), font sans, serif, mono or',
		'handwriting, percent size (normal 100, bigger 150, smaller 75).',
		'title: text (the exact words) shown startSeconds to endSeconds ("the first 3 seconds": 0, 3).',
		'watermark: a logo in corner top-left, top-right, bottom-left or bottom-right.',
		'captions_on, captions_off (or subtitles).',
		'box, blur, pixelate: cover part of the picture, region top-left, top-right, bottom-left,',
		'bottom-right, top, bottom, left, right, center or full, from startSeconds to endSeconds.',
		'rotate: degrees to turn, clockwise; negative for anticlockwise or left.',
		'flip: axis horizontal (default) or vertical. crop: aspect 16:9, 9:16, 1:1, 4:5, or none.',
		'volume: percent, for fromClip (null: every clip). louder, quieter: for fromClip (null: all).',
		'mute, unmute: fromClip (null: all). fade_in, fade_out: seconds long, on fromClip',
		'(null: the start or end of the video; "fade out the last 2 seconds": fade_out, seconds 2).',
		'unsupported: anything else, every other field null.'
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
		durationSeconds: z.number().positive(),
		clipCount: z.number().int().positive()
	}),
	handler: async ({ command, durationSeconds, clipCount }): Promise<EditCommand> => {
		const response = await generateContent(
			{ feature: 'parse_edit_command', model: 'gemini-3.5-flash-lite' },
			{
				contents: command,
				config: {
					systemInstruction: systemInstruction(durationSeconds, clipCount),
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
