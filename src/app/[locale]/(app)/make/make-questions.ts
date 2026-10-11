import { z } from 'zod'
import type { MakeReply } from './make-plan'

// Make it's quick questions: fixed choices on one screen before the plan,
// costing no AI call. Code decides which to ask from the request's own
// words (whole words only), never one the request already answers. What is
// clicked counts as the user's own words, as the request does: it decides
// what it names and reads as "From your brief"; anything left to "You
// decide" is chosen for them, and the plan card says so.

/** A part of a brief, as the reply quotes it or the user types it. */
export const MAX_BRIEF_PART_LENGTH = 120

/** What the video is: question 1. */
export const MAKE_KINDS = ['instagram_reel', 'tiktok', 'youtube_shorts', 'ad', 'other'] as const
export type MakeKind = (typeof MAKE_KINDS)[number]
/** An ad's shape: question 2. */
export const AD_SHAPES = ['vertical', 'horizontal', 'original'] as const
export type AdShape = (typeof AD_SHAPES)[number]
/** A reel's sound: question 3, shown once music is built. */
export const VOICE_CHOICES = ['voice', 'music_only', 'both'] as const
/** The music's genre or mood: question 4, shown once music is built. */
export const MUSIC_MOODS = ['calm', 'upbeat', 'hip_hop', 'cinematic', 'none'] as const

export const QUESTION_IDS = ['kind', 'adShape', 'voice', 'music', 'tone', 'callToAction'] as const
export type QuestionId = (typeof QUESTION_IDS)[number]
/**
 * Every question, in the order asked. One for a feature that isn't built
 * yet (music, and with it the voice-or-music choice) is defined, never shown.
 */
export const QUESTIONS: ReadonlyArray<{ id: QuestionId; built: boolean }> = [
	{ id: 'kind', built: true },
	{ id: 'adShape', built: true },
	{ id: 'voice', built: false },
	{ id: 'music', built: false },
	{ id: 'tone', built: true },
	{ id: 'callToAction', built: true }
]

const choiceText = z.string().trim().max(MAX_BRIEF_PART_LENGTH).nullable()

/** The answers, null for each left to "You decide"; `asked` is the questions shown. */
export const makeChoicesSchema = z.object({
	kind: z.enum(MAKE_KINDS).nullable(),
	adShape: z.enum(AD_SHAPES).nullable(),
	voice: z.enum(VOICE_CHOICES).nullable(),
	music: z.enum(MUSIC_MOODS).nullable(),
	tone: choiceText,
	callToAction: choiceText,
	asked: z.array(z.enum(QUESTION_IDS)).max(QUESTION_IDS.length)
})
export type MakeChoices = z.infer<typeof makeChoicesSchema>

/** Every question left to "You decide": Skip all. */
export const decideAll = (asked: QuestionId[]): MakeChoices => ({
	kind: null,
	adShape: null,
	voice: null,
	music: null,
	tone: null,
	callToAction: null,
	asked
})

// What a request already says, in whole words: "add captions" is no ad, and
// "history" no story.
/** A reel, TikTok, Short or story: short and vertical. */
const SHORT_VIDEO =
	/\b(?:reels?|instagram|insta|tik[\s-]?toks?|(?:youtube|yt)[\s-]?shorts?|shorts|stor(?:y|ies))\b/i
const AD = /\b(?:ads?|adverts?|advertisements?|advertising|promos?|promotional|commercials?)\b/i
const SHAPE =
	/\b(?:vertical|portrait|horizontal|landscape|widescreen|square|9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|4\s*:\s*5)\b|\b(?:keep|same|own|original)\b[^.]{0,20}\b(?:shape|size|aspect|ratio|format)\b/i
const TONE =
	/\b(?:tone|vibe|mood|feel|energetic|upbeat|calm|relaxed|serious|playful|fun|funny|friendly|professional|formal|casual|warm|inspiring|inspirational|dramatic|bold|chill|hype|emotional|heartfelt|witty|confident)\b/i
const CALL_TO_ACTION =
	/\b(?:call[\s-]to[\s-]action|cta|end(?:s|ing)? (?:it )?with|close(?:s)? with|link in (?:the )?bio|subscribe|follow (?:us|me|for)|sign[\s-]?up|visit|shop now|buy now|book now|order now|download|learn more|dm (?:me|us))\b/i
const MUSIC = /\b(?:music|song|track|soundtrack|beat|hip[\s-]?hop|cinematic)\b/i

const SHORT_KINDS: ReadonlySet<MakeKind> = new Set(['instagram_reel', 'tiktok', 'youtube_shorts'])

/** Whether the request names what the video is: a reel, TikTok, Short, story or an ad. */
export const namesKind = (text: string) => SHORT_VIDEO.test(text) || AD.test(text)
export const namesAd = (text: string) => AD.test(text)
export const namesShortVideo = (text: string) => SHORT_VIDEO.test(text)
export const namesShape = (text: string) => SHAPE.test(text)
export const namesTone = (text: string) => TONE.test(text)
export const namesCallToAction = (text: string) => CALL_TO_ACTION.test(text)
export const namesMusic = (text: string) => MUSIC.test(text)

/**
 * The questions to show for a request, in order, given what's been picked
 * so far (an ad's shape is asked once it's an ad): only what the request
 * doesn't already say, and only questions whose feature is built.
 */
export function questionsToAsk(
	request: string,
	picked: Pick<MakeChoices, 'kind'> = { kind: null }
): QuestionId[] {
	const ad = namesAd(request) || picked.kind === 'ad'
	const short = namesShortVideo(request) || (picked.kind !== null && SHORT_KINDS.has(picked.kind))
	const ask: Record<QuestionId, boolean> = {
		kind: !namesKind(request),
		// A reel, TikTok or Short is always vertical; a shape or platform named answers it.
		adShape: ad && !namesShortVideo(request) && !namesShape(request),
		voice: short,
		music: !namesMusic(request),
		tone: !namesTone(request),
		callToAction: !namesCallToAction(request)
	}
	return QUESTIONS.filter(({ id, built }) => built && ask[id]).map(({ id }) => id)
}

const KIND_WORDS: Record<MakeKind, string> = {
	instagram_reel: 'An Instagram reel.',
	tiktok: 'A TikTok.',
	youtube_shorts: 'YouTube Shorts.',
	ad: 'An ad.',
	other: 'Another kind of video.'
}
const SHAPE_WORDS: Record<AdShape, string> = {
	vertical: 'Vertical.',
	horizontal: 'Horizontal.',
	original: "Keep the video's own shape."
}

/**
 * The answers as the user's own words, a sentence each: read with the
 * request, by Gemini and by the rules that only trust the user's words.
 * Nothing for a question left to "You decide".
 */
export function choiceWords(choices: MakeChoices | null | undefined): string[] {
	if (!choices) return []
	return [
		...(choices.kind ? [KIND_WORDS[choices.kind]] : []),
		...(choices.adShape ? [SHAPE_WORDS[choices.adShape]] : []),
		...(choices.tone ? [`Tone: ${choices.tone}.`] : []),
		...(choices.callToAction ? [`Call to action: ${choices.callToAction}.`] : [])
	]
}

/**
 * The reply with what the user clicked put in place of Gemini's guess: what
 * it is, an ad's shape, the tone and the call to action. A later follow-up
 * naming the same thing ("make it square") wins over the click, as the
 * latest ask does everywhere.
 */
export function applyChoices(
	reply: MakeReply,
	choices: MakeChoices | null | undefined,
	followUps: readonly string[] = []
): MakeReply {
	if (!choices) return reply
	const later = (names: (text: string) => boolean) => followUps.some(names)
	let out = reply
	const { kind, adShape, tone, callToAction } = choices
	if (kind && !later(namesKind)) {
		out =
			kind === 'ad'
				? { ...out, format: 'other', style: 'ad' }
				: kind === 'other'
					? { ...out, format: 'other' }
					: { ...out, format: kind, style: out.style === 'ad' ? 'reel' : out.style }
	}
	if (adShape && !later((text) => namesShape(text) || namesShortVideo(text))) {
		out = { ...out, shape: adShape }
	}
	if (tone && !later(namesTone)) out = { ...out, brief: { ...out.brief, tone } }
	if (callToAction && !later(namesCallToAction)) {
		out = { ...out, brief: { ...out.brief, callToAction } }
	}
	return out
}
