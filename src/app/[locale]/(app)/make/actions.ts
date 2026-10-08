'use server'

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { generateContent, MEDIA_RESOLUTION_MEDIUM } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { rethrowAiError } from '@/server/lib/ai-busy'
import { numberedSentences } from '@/app/[locale]/editor/highlights'
import {
	CHECK_REPLY_JSON_SCHEMA,
	checkReplySchema,
	FRAME_SEPARATOR,
	MAKE_REPLY_JSON_SCHEMA,
	makeReplySchema,
	MAX_FRAMES,
	MAX_MAKE_SECONDS,
	MAX_QUESTIONS,
	MAX_REQUEST_LENGTH,
	CHECK_TIMEOUT_MS,
	PLAN_TIMEOUT_MS,
	type CheckReply,
	type MakeReply
} from './make-plan'

/** The free-licence tracks Make it may lay under an edit (see LICENSES there). */
const MUSIC_FOLDER = path.join(process.cwd(), 'public', 'music')
const MUSIC_FILE = /\.(mp3|m4a|ogg|opus|wav|webm)$/i
/** A small JPEG of a frame, base64: about 10 KB at the size the page takes them. */
const MAX_FRAME_BASE64_LENGTH = 60_000
const MAX_SENTENCES = 400
const MAX_SENTENCE_LENGTH = 1000
const MAX_ANSWER_LENGTH = 300

/** The tracks in public/music, by file name; none when it's empty or missing. */
async function musicTracks(): Promise<string[]> {
	try {
		return (await readdir(MUSIC_FOLDER)).filter((name) => MUSIC_FILE.test(name)).sort()
	} catch {
		return []
	}
}

// Every word is paid for on every call, as with the other prompts, but this
// one has a whole edit to describe: what the editor can do, the styles, and
// the rules that keep it honest.
const MAKE_INSTRUCTION = [
	'You plan a whole video edit from one request. The editor can only: cut parts out and reorder',
	'them, show captions of the speech, push in with a zoom during a sentence, join cuts with a',
	'fade, dissolve, slide or zoom cut, lay background music from a list under it (quieter under',
	'speech), make it vertical 9:16 (following the face of one person, or the whole picture with',
	'black bars), show one short title at the start and a few key lines quoted from the speech,',
	'animated in the style asked for.',
	'You get the request, the transcript (numbered sentences with their times in seconds) and',
	'small pictures of the video, one every 2 seconds, numbered.',
	'Styles: reel (Instagram reel, TikTok or Shorts: vertical, word-by-word captions, tight cuts,',
	'zooms on key lines, upbeat music); professional (tidy: line captions, few or no zooms,',
	'dissolves, calm music); funny (word-by-word captions, quick cuts, zooms on the punchlines,',
	'playful music); ad (vertical, tight, a short hook title, energetic music).',
	'Guess every detail the request leaves out from its style. Ask questions only when you cannot',
	`tell what is wanted at all ("make it better"): then 1 to ${MAX_QUESTIONS} short questions,`,
	'and still fill in everything else. When answers are given, ask nothing.',
	'format: instagram_reel, tiktok or youtube_shorts when the request names one (a reel is',
	'instagram_reel), else other. Reels, TikToks and Shorts run 50 to 59 seconds when the video',
	'has enough: complete thoughts only, never half a point; for a walkthrough, each step.',
	'moments: complete thoughts as first and last sentence numbers, best first; the first is the',
	'strongest line, which a reel opens with. Cover everything worth keeping.',
	'summary: one or two plain sentences on how the footage was shortened: what was kept and what',
	'was cut. Not what the video is in general.',
	'subject: one_person when one person on camera is clearly the subject; screen (a screen',
	'recording), meeting (a call), slides, or other.',
	'pictureMatters: false when the words carry the video (people talking to camera, a meeting or',
	'call, slides, a static screen); true when what is seen carries it (action, a demo, scenery).',
	'A meeting, call, slides or screen recording is judged by its speech only: no zooms, no faces,',
	'no removeSpans.',
	'removeSentences: numbers of dead sentences (false starts, repeats, off-topic rambling).',
	'Keep everything worth hearing.',
	'removeSpans: only when pictureMatters: stretches in seconds where nothing is said or worth',
	'seeing.',
	'captions: classic (a line or two in a band), bold_words (one big word at a time),',
	'highlight (lines with the word being said picked out), large (big lines), or off. Reels and',
	'TikToks suit bold_words or highlight, professional classic, funny bold_words, ads large.',
	'zoomSentences: the few sentences worth a push-in.',
	'transition: none, fade, dissolve, slide or zoom_cut, used only where parts were cut:',
	'professional dissolve or fade, reel and funny zoom_cut or slide, ad slide or zoom_cut.',
	'keyLines: up to 4 short lines (at most 8 words) to show on screen, each quoting words said in',
	'its sentence, given by number: the points worth reading. Empty when none fit.',
	'vertical: true for reels, TikTok, Shorts, stories and ads for phones.',
	'faces: only when subject is one_person: for each picture showing them, its number as frame,',
	'and x and y of the face centre on a 0 to 1000 grid. Otherwise empty.',
	'card: when the picture does not carry the video (a meeting, a still screen), a reel or ad is',
	'designed around the speech with the picture as a small card: corner when the picture shows',
	'anything worth keeping (a name card, a face, a slide, a screen), hidden only when it shows',
	'nothing (black, a still logo). Choose either way for other videos.',
	'music: exactly one file name from the list, or null when none fits or none is listed.',
	'title: a short hook, for ads or when asked, else null; in sentence case, using only words',
	'from the transcript or the request.',
	'Never invent names, usernames, handles, brands, prices or facts.',
	'cannotDo: each part of the request this editor cannot do, said plainly (stock footage, effects,',
	'a name or handle that was not given). Empty when all of it can be done.',
	"Write in the request's language."
].join(' ')

/** The request and what's known about the video, as the model reads it before the pictures. */
function describe(input: {
	request: string
	answers: Array<{ question: string; answer: string }>
	durationSeconds: number
	sentences: Array<{ startSeconds: number; endSeconds: number; text: string }>
	tracks: string[]
}): string {
	return [
		`Request: ${input.request}`,
		...input.answers.map(({ question, answer }) => `Asked: ${question} Answer: ${answer}`),
		`Music files: ${input.tracks.length > 0 ? input.tracks.join(', ') : 'none'}`,
		`The video is ${input.durationSeconds.toFixed(1)} s long.`,
		input.sentences.length > 0
			? `Transcript:\n${numberedSentences(input.sentences)}`
			: 'Nothing is said in it.',
		'Pictures:'
	].join('\n')
}

// The second look: text only (no pictures), so it costs a fraction of the
// plan. It reads the plan as made and fixes what doesn't fit the request.
const CHECK_INSTRUCTION = [
	'You check a planned video edit against the request it was made for, and fix it.',
	'Problems to look for: the wrong length (reels, TikToks and Shorts must be under 60 seconds and',
	'should use 50 or more when there is enough), a style or caption look that does not fit the',
	'request, a title or key line with words that were not said or asked for (names, handles,',
	'brands, facts), a key line that does not quote its sentence, a sentence cut short, a point',
	'left half made, an opening that is not the strongest line.',
	'problems: each one found, in a few plain words; empty when the plan is right.',
	'title, keyLines, captions, transition: as they should be (the same when right). keyLines',
	'quote their sentence, given by number. dropSentences: numbers of sentences that should not',
	'be in it (half a thought, off the point); the editor refills the time itself.',
	"Write in the request's language."
].join(' ')

/** The longest plan description the check reads: a few hundred sentences' worth. */
const MAX_PLAN_LENGTH = 40_000

/**
 * Checks a plan against its request with a second, cheap Gemini call (text
 * only), returning what was wrong and the fixes; null when the reply
 * doesn't fit the shape, which the page treats as no check made.
 */
export const checkMakePlan = validatedAction({
	input: z.object({
		request: z.string().trim().min(1).max(MAX_REQUEST_LENGTH),
		planText: z.string().min(1).max(MAX_PLAN_LENGTH)
	}),
	handler: async ({ request, planText }): Promise<CheckReply | null> => {
		const response = await generateContent(
			{ feature: 'make_it_check', model: 'gemini-3.5-flash-lite', timeoutMs: CHECK_TIMEOUT_MS },
			{
				contents: `Request: ${request}\n${planText}`,
				config: {
					systemInstruction: CHECK_INSTRUCTION,
					responseMimeType: 'application/json',
					responseJsonSchema: CHECK_REPLY_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch(rethrowAiError('gemini', 'make_it_check'))
		try {
			const parsed = checkReplySchema.safeParse(JSON.parse(response.text ?? ''))
			return parsed.success ? parsed.data : null
		} catch {
			return null
		}
	}
})

/**
 * Plans a whole edit from a request, with Gemini reading the transcript and
 * a picture every 2 s. Returns its reply (questions to ask first, or the
 * plan), with any music it picked checked against the folder; null when the
 * reply doesn't fit the shape, which the page reports as no plan made.
 */
export const planMakeIt = validatedAction({
	input: z.object({
		request: z.string().trim().min(1).max(MAX_REQUEST_LENGTH),
		answers: z
			.array(
				z.object({
					question: z.string().max(MAX_ANSWER_LENGTH),
					answer: z.string().trim().max(MAX_ANSWER_LENGTH)
				})
			)
			.max(MAX_QUESTIONS),
		durationSeconds: z.number().positive().max(MAX_MAKE_SECONDS),
		sentences: z
			.array(
				z.object({
					startSeconds: z.number().nonnegative(),
					endSeconds: z.number().nonnegative(),
					text: z.string().max(MAX_SENTENCE_LENGTH)
				})
			)
			.max(MAX_SENTENCES),
		frames: z
			.string()
			.max(MAX_FRAMES * (MAX_FRAME_BASE64_LENGTH + 1))
			.transform((joined) => joined.split(FRAME_SEPARATOR))
			.pipe(z.array(z.string().min(1).max(MAX_FRAME_BASE64_LENGTH)).min(1).max(MAX_FRAMES))
	}),
	handler: async (input): Promise<{ reply: MakeReply | null; tracks: string[] }> => {
		const tracks = await musicTracks()
		const response = await generateContent(
			{ feature: 'make_it', model: 'gemini-3.5-flash-lite', timeoutMs: PLAN_TIMEOUT_MS },
			{
				contents: [
					{
						role: 'user',
						parts: [
							{ text: describe({ ...input, tracks }) },
							...input.frames.flatMap((data, index) => [
								{ text: `Picture ${index + 1}` },
								{ inlineData: { mimeType: 'image/jpeg', data } }
							])
						]
					}
				],
				config: {
					// The pictures at medium detail (~256 tokens each, not ~1000): a
					// 5-minute video's 150 of them made a 159k-token request that took
					// 80–100 s to plan; this is about a quarter of that.
					mediaResolution: MEDIA_RESOLUTION_MEDIUM,
					systemInstruction: MAKE_INSTRUCTION,
					responseMimeType: 'application/json',
					responseJsonSchema: MAKE_REPLY_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch(rethrowAiError('gemini', 'make_it'))
		try {
			const parsed = makeReplySchema.safeParse(JSON.parse(response.text ?? ''))
			if (!parsed.success) return { reply: null, tracks }
			const reply = parsed.data
			// Answers given: plan now, whatever the reply says.
			const questions = input.answers.length > 0 ? [] : reply.questions
			const music = reply.music !== null && tracks.includes(reply.music) ? reply.music : null
			return { reply: { ...reply, questions, music }, tracks }
		} catch {
			return { reply: null, tracks }
		}
	}
})
