'use server'

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { generateContent } from '@/server/ai/google'
import { validatedAction } from '@/server/actions/validated-action'
import { rethrowAsBusy } from '@/server/lib/ai-busy'
import { numberedSentences } from '@/app/[locale]/editor/highlights'
import {
	FRAME_SEPARATOR,
	MAKE_REPLY_JSON_SCHEMA,
	makeReplySchema,
	MAX_FRAMES,
	MAX_MAKE_SECONDS,
	MAX_QUESTIONS,
	MAX_REQUEST_LENGTH,
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
	'You plan a whole video edit from one request. The editor can only: cut parts out,',
	'show captions of the speech (word by word, or a line or two at a time), push in with a zoom',
	'during a sentence, fade or dissolve where parts were cut, lay background music from a list',
	'under it (quieter under speech), make it vertical 9:16 (following the face of one person, or',
	'the whole picture with black bars), and show one short title at the start.',
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
	'instagram_reel), else other. Reels, TikToks and Shorts must run under 60 seconds: keep only',
	'the key moments (for a walkthrough, the line that shows each step), cut dead time and repeats.',
	'keyMoments: sentence numbers of the moments that matter most, best first.',
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
	'captions: words, lines or off. zoomSentences: the few sentences worth a push-in.',
	'transition: none, fade or dissolve, where parts were cut.',
	'vertical: true for reels, TikTok, Shorts, stories and ads for phones.',
	'faces: only when subject is one_person: for each picture showing them, its number as frame,',
	'and x and y of the face centre on a 0 to 1000 grid. Otherwise empty.',
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
			{ feature: 'make_it', model: 'gemini-3.5-flash-lite' },
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
					systemInstruction: MAKE_INSTRUCTION,
					responseMimeType: 'application/json',
					responseJsonSchema: MAKE_REPLY_JSON_SCHEMA,
					temperature: 0
				}
			}
		).catch(rethrowAsBusy)
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
