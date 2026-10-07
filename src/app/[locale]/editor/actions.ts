'use server'

import { z } from 'zod'
import { deepgramWords, transcribeAudio } from '@/server/ai/deepgram'
import { generateContent } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { rethrowAsBusy } from '@/server/lib/ai-busy'
import { EDIT_COMMAND_JSON_SCHEMA, editCommandSchema, type EditCommand } from './edit-command'
import {
	HIGHLIGHTS_JSON_SCHEMA,
	highlightsReplySchema,
	MAX_HIGHLIGHTS,
	MIN_HIGHLIGHTS,
	numberedSentences,
	type HighlightPick
} from './highlights'
import { MAX_AUDIO_BASE64_LENGTH } from './take-audio'
import { toTranscript, type Transcript } from './transcript'
import { MAX_VOICE_BASE64_LENGTH } from './voice-command'

// A command is a sentence, not a document — this also caps what one request
// can spend.
const MAX_COMMAND_LENGTH = 300

// A transcript is at most 5 minutes of speech: far fewer sentences than
// this, each far shorter. Caps what one request can send to the model.
const MAX_SENTENCES = 400
const MAX_SENTENCE_LENGTH = 1000

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
	font: null,
	effect: null
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
		'find_highlights: find the best moments, highlights or clips worth sharing.',
		'speed: preview rate only, no clip named ("play at 2x": 2). rerecord: the sentence at startSeconds.',
		'clip_speed: how fast clips really play, rate 0.25 to 4, fromClip (null: every clip)',
		'("make clip 2 play at 2x", "slow the last clip to half speed", "speed the whole video up 1.5x").',
		'Between clips fromClip and toClip, seconds long (all null: every pair): fade_transition',
		'("a fade between clips", through black), dissolve (a dissolve or cross-fade), remove_transition.',
		'delete_clip, duplicate_clip: fromClip.',
		'add_audio: add music or a sound file at startSeconds (null: the playhead).',
		'extract_audio: take clip fromClip\'s sound out to its own audio track ("detach the audio").',
		'delete_audio: the audio track numbered fromClip (null: the last one added).',
		'add_video: add another video file to the project, after the clips.',
		'save_project: text the name to save it as (null: its name). open_project: text the saved',
		'project\'s name ("open my project Holiday": Holiday).',
		'lower_third: text "name, subtitle", startSeconds to endSeconds.',
		'animate_in, animate_out: target title or text comes in or goes out with effect fade, slide,',
		'pop or words (word by word) (none: still), region the side, seconds long. zoom_in (push in),',
		'zoom_out (pull out):',
		'the picture, startSeconds to endSeconds, percent the zoom (null: 130).',
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

// Terse for the same reason as the command prompt: paid for on every call.
const HIGHLIGHTS_INSTRUCTION = [
	'You pick the best moments of a spoken video, to share as short clips.',
	'You get its transcript, one numbered sentence a line, with its start and end in seconds.',
	`Pick ${MIN_HIGHLIGHTS} to ${MAX_HIGHLIGHTS} moments, best first, fewer only if the video is too short.`,
	'Each is a run of whole sentences, firstSentence to lastSentence (the same for one sentence),',
	'that makes sense on its own: a strong point, a story, a clear explanation, a memorable line.',
	'Aim for 10 to 60 seconds each where the video allows. Moments must not overlap.',
	'title: at most 6 words. description: one line, at most 15 words, saying what happens.',
	"Write both in the transcript's language. Never invent anything not in the transcript."
].join(' ')

/**
 * Asks Gemini for a take's best moments, given its transcript's sentences.
 * Returns the picks as sentence numbers; the client turns them into times
 * (planHighlights), so a moment always starts and ends on a sentence's edge.
 * A reply that isn't valid JSON in the expected shape comes back as no
 * picks, which the dialog reports as none found.
 */
export const findHighlights = validatedAction({
	input: z.object({
		sentences: z
			.array(
				z.object({
					startSeconds: z.number().nonnegative(),
					endSeconds: z.number().nonnegative(),
					text: z.string().max(MAX_SENTENCE_LENGTH)
				})
			)
			.min(1)
			.max(MAX_SENTENCES)
	}),
	handler: async ({ sentences }): Promise<HighlightPick[]> => {
		const response = await generateContent(
			{ feature: 'find_highlights', model: 'gemini-3.5-flash-lite' },
			{
				contents: numberedSentences(sentences),
				config: {
					systemInstruction: HIGHLIGHTS_INSTRUCTION,
					responseMimeType: 'application/json',
					responseJsonSchema: HIGHLIGHTS_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch(rethrowAsBusy)
		try {
			const parsed = highlightsReplySchema.safeParse(JSON.parse(response.text ?? ''))
			return parsed.success ? parsed.data.highlights : []
		} catch {
			return []
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

/**
 * A spoken command as text (16 kHz mono WAV, base64), with Deepgram. Its
 * words, punctuated, in order; empty when nothing was said.
 */
export const transcribeVoiceCommand = validatedAction({
	input: z.object({ audioBase64: z.string().min(1).max(MAX_VOICE_BASE64_LENGTH) }),
	handler: async ({ audioBase64 }): Promise<string> => {
		const response = await transcribeAudio(
			{ feature: 'voice_command', model: 'nova-3' },
			Buffer.from(audioBase64, 'base64'),
			'audio/wav'
		).catch(rethrowAsBusy)
		return deepgramWords(response)
			.map((word) => word.punctuated_word ?? word.word)
			.join(' ')
	}
})
