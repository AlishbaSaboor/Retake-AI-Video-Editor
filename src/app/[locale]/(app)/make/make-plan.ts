import { z } from 'zod'
import { availableSeconds, type AudioItem } from '../../editor/model/audio-lane'
import type { Cut } from '../../editor/model/cleanup'
import type { Design } from '../../editor/overlays/design'
import { ORIGINAL_EDIT, type EditSnapshot } from '../../editor/model/edit-snapshot'
import type { CaptionMode } from '../../editor/overlays/captions'
import type { Zoom } from '../../editor/overlays/motion'
import type { TitleCard } from '../../editor/overlays/overlays'
import {
	editedLength,
	editedStarts,
	playableSegments,
	type Clip,
	type Segment,
	type SourceRange
} from '../../editor/model/sequence'
import { DEFAULT_TEXT_STYLE } from '../../editor/overlays/text-style'
import {
	centredCrop,
	fittedCrop,
	type CropAspect,
	type CropKey,
	type PictureTransform,
	type Size
} from '../../editor/model/transform'
import type { Transcript, TranscriptSegment, TranscriptWord } from '../../editor/audio/transcript'
import { transitionLimit, type TransitionKind } from '../../editor/model/transitions'
import {
	applyChoices,
	choiceWords,
	DEFAULT_AD_SECONDS,
	LENGTH,
	MAX_BRIEF_PART_LENGTH,
	namesLength,
	namesLengthChange,
	type MakeChoices,
	type MakeKind
} from './make-questions'
import { choosePreset, presetLook, type Preset, type PresetLook } from './make-presets'

// Make it: a whole edit planned from one request ("make this a reel").
// Gemini reads the transcript and small pictures of the video and answers
// in the shape below; everything it names is checked and turned into an
// ordinary edit here, so Apply hands the editor a snapshot like any other
// (one undo step, saved and exported as usual). The model only names
// sentences by number, frames by number and choices from fixed lists; the
// times, the crop and the levels are worked out here from the transcript.

export const MAKE_STYLES = ['reel', 'professional', 'funny', 'ad'] as const
export type MakeStyle = (typeof MAKE_STYLES)[number]
/** Where the video is going, when the request names a place for short videos. */
export const MAKE_FORMATS = ['instagram_reel', 'tiktok', 'youtube_shorts', 'other'] as const
export type MakeFormat = (typeof MAKE_FORMATS)[number]
/**
 * The shape it comes out: vertical 9:16, square 1:1, portrait 4:5,
 * horizontal 16:9, or the video's own (original).
 */
export const MAKE_SHAPES = ['vertical', 'square', 'portrait', 'horizontal', 'original'] as const
export type MakeShape = (typeof MAKE_SHAPES)[number]
/**
 * How the video goes into a shape that isn't its own: the whole of it with
 * black bars, the whole of it over a blurred copy of itself, or filling the
 * frame with its edges cut off (a zoom).
 */
export const MAKE_FITS = ['bars', 'blur', 'fill'] as const
export type MakeFit = (typeof MAKE_FITS)[number]
/**
 * How a screen recording shows: the whole screen (bars or a blur), or
 * designed around what's said with no picture of the screen at all.
 */
export const SCREEN_TREATMENTS = ['whole', 'designed'] as const
export type ScreenTreatment = (typeof SCREEN_TREATMENTS)[number]
/** A request for an ad, a promo, a teaser or a highlights reel: a screen recording is designed for it. */
const PROMO_REQUEST =
	/\b(ads?|adverts?|advertisements?|promos?|promotional|teasers?|highlights?)\b/i
/** The user's own words asking for a screen recording as text and captions only. */
const TEXT_ONLY_REQUEST =
	/\b(text[ -]?only|only (the )?text|just (the )?text|captions? only|only (the )?captions|no screen|without (the |my )?screen|hide (the |my )?screen|leave (out )?(the |my )?screen( out)?)\b/i
/** The user's own words asking for the screen itself to show. */
const SHOW_SCREEN_REQUEST =
	/\b(show (me )?(the |my )?(whole |full |entire )?screen|keep (the |my )?(whole |full )?screen|(whole|full|entire) screen|screen (visible|showing)|with (the |my )?screen)\b/i
/** The user's own words naming how the video fits its shape: bars, a blur, a zoom or a crop. */
const FIT_REQUEST =
	/\b(black bars?|bars|blur(red|ry)?|zoom(ed|s)?|crop(ped|s)?|fill(s|ing)? the (frame|screen)|close[- ]?ups?)\b/i

/**
 * The treatment the user's own words ask for, latest first: text only, or
 * the screen shown; null when they ask for neither (or both at once).
 * Gemini's reply never decides this on its own.
 */
export function askedTreatment(texts: readonly string[]): ScreenTreatment | null {
	for (const text of [...texts].reverse()) {
		const textOnly = TEXT_ONLY_REQUEST.test(text)
		const showScreen = SHOW_SCREEN_REQUEST.test(text)
		if (textOnly !== showScreen) return textOnly ? 'designed' : 'whole'
	}
	return null
}
/** What the picture shows: only one person as the clear subject gets a crop that follows a face. */
export const MAKE_SUBJECTS = ['one_person', 'screen', 'meeting', 'slides', 'other'] as const

/**
 * Reels, TikToks and Shorts come out under a minute: enforced here, whatever
 * the reply plans. A second under, so the export's few hundredths of a
 * second either way never take it to 60.
 */
export const SHORT_FORM_MAX_SECONDS = 59
/** A short-form edit fills at least this much when the video has enough worth keeping. */
export const SHORT_FORM_TARGET_SECONDS = 50
/** A length asked for ("make it 30 seconds") is filled to at least this share of it. */
const ASKED_FILL = 0.85
/** The request names a short-video format itself: a check that doesn't rest on the model. */
const SHORT_FORM_REQUEST = /\b(reels?|tik\s?toks?|shorts|stor(?:y|ies))\b/i

/** Whether the edit must come out under a minute: the reply's format, or the request's own words. */
export function isShortForm(format: MakeFormat, request: string): boolean {
	return format !== 'other' || SHORT_FORM_REQUEST.test(request)
}

/** One picture every this many seconds, from the middle of each stretch. */
export const FRAME_EVERY_SECONDS = 2
/** Make it reads at most 5 minutes, like the transcript: one picture every 2 s of it. */
export const MAX_MAKE_SECONDS = 300
export const MAX_FRAMES = MAX_MAKE_SECONDS / FRAME_EVERY_SECONDS
export const MAX_QUESTIONS = 3
/**
 * How long the plan and its second check may take on the server before
 * they're given up as unanswered; the page stops waiting a little after.
 */
export const PLAN_TIMEOUT_MS = 60_000
export const CHECK_TIMEOUT_MS = 30_000
/** The page's own limit past the server's: room for the request to travel. */
export const PAGE_GRACE_MS = 5_000
/** A request, a brief at its longest: platform, shape, genre, tone, audience, call to action, length. */
export const MAX_REQUEST_LENGTH = 1000
/** A follow-up in the chat, and each earlier one sent back with it. */
export const MAX_FOLLOW_UP_LENGTH = 300
/** An answer to a question Gemini asked. */
export const MAX_ANSWER_LENGTH = 300
const MAX_ZOOMS = 6
/** Key lines on screen: a few, short, so they stay readable. */
const MAX_KEY_LINES = 4
const MAX_KEY_LINE_WORDS = 8
const MAX_NOTES = 5
const MAX_NOTE_LENGTH = 200
/** The plan's summary: two plain sentences, with room to finish them. */
const MAX_SUMMARY_LENGTH = 400
const MAX_TITLE_LENGTH = 60
/** A part of a brief, as the reply quotes it from the request. */

/**
 * The pictures, as they go to the server: one string, separated by spaces
 * (base64 has none), never an array of strings. Decoding a server action's
 * arguments, React counts every character of the strings inside an array
 * against a limit of 1,000,000 and rejects the request past it, before the
 * action runs; a few dozen busy pictures pass that. One long string, like a
 * transcript's audio, isn't counted that way.
 */
export const FRAME_SEPARATOR = ' '

/** The times the pictures are taken at, for a video `durationSeconds` long. */
export function frameTimes(durationSeconds: number): number[] {
	const count = Math.min(MAX_FRAMES, Math.ceil(durationSeconds / FRAME_EVERY_SECONDS))
	return Array.from({ length: count }, (_, index) =>
		Math.min(index * FRAME_EVERY_SECONDS + FRAME_EVERY_SECONDS / 2, durationSeconds - 0.05)
	)
}

/**
 * `text` at most `max` characters, cut at the last space before the limit
 * (an ellipsis marks the cut), never inside a word; a single word longer
 * than the limit is the only thing cut through.
 */
export function clipText(text: string, max: number): string {
	const trimmed = text.trim()
	if (trimmed.length <= max) return trimmed
	const head = trimmed.slice(0, max - 1)
	const space = head.search(/\s\S*$/)
	const cut = (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:.!?–—-]+$/u, '')
	return `${cut}…`
}

const noteOf = (max: number) =>
	z
		.string()
		.transform((text) => clipText(text, max))
		.pipe(z.string().min(1))
const note = noteOf(MAX_NOTE_LENGTH)

/** A part of a brief: the request's own words for it, or null when it gives none. */
const briefPart = z
	.string()
	.nullable()
	.transform((text) => (text === null ? null : clipText(text, MAX_BRIEF_PART_LENGTH) || null))

/**
 * How captions look, as the reply picks them: a line or two in a band, one
 * big word at a time, lines with the word being said picked out, or large
 * lines; or none.
 */
export const CAPTION_LOOKS = ['classic', 'bold_words', 'highlight', 'large', 'off'] as const
export type CaptionLook = (typeof CAPTION_LOOKS)[number]
/** How cuts are joined: a fade, a dissolve, a slide (overlapping), a zoom cut (a quick punch-in), or plain. */
export const MAKE_TRANSITIONS = ['none', 'fade', 'dissolve', 'slide', 'zoom_cut'] as const

/** What Gemini answers. Questions, when there are any, are asked before anything is planned. */
export const makeReplySchema = z.object({
	questions: z.array(note).max(MAX_QUESTIONS),
	style: z.enum(MAKE_STYLES),
	format: z.enum(MAKE_FORMATS),
	// A label outside the list is read as other: it never stops a plan, and
	// never earns a layout only a meeting gets.
	subject: z.enum(MAKE_SUBJECTS).catch('other'),
	summary: noteOf(MAX_SUMMARY_LENGTH),
	pictureMatters: z.boolean(),
	moments: z.array(z.object({ first: z.number().int(), last: z.number().int() })),
	removeSentences: z.array(z.number().int()),
	removeSpans: z.array(z.object({ startSeconds: z.number(), endSeconds: z.number() })),
	captions: z.enum(CAPTION_LOOKS),
	zoomSentences: z.array(z.number().int()),
	transition: z.enum(MAKE_TRANSITIONS),
	keyLines: z.array(z.object({ sentence: z.number().int(), text: z.string() })),
	shape: z.enum(MAKE_SHAPES),
	fit: z.enum(MAKE_FITS),
	/** The request (or a follow-up) named the fit: black bars, a blurred background, a zoom. */
	fitAsked: z.boolean(),
	/** A screen recording's treatment, when the request (or a follow-up) asked for one; null when not. */
	// A value outside the list is read as not asked: it never stops a plan.
	treatment: z.enum(SCREEN_TREATMENTS).nullable().catch(null),
	/** The most it may run, when a length was asked for; null when none was. */
	maxSeconds: z.number().positive().max(MAX_MAKE_SECONDS).nullable(),
	/** A request written as a brief: the parts it gives, in its own words. */
	brief: z.object({
		audience: briefPart,
		tone: briefPart,
		length: briefPart,
		show: briefPart,
		callToAction: briefPart
	}),
	faces: z.array(z.object({ frame: z.number().int(), x: z.number(), y: z.number() })),
	card: z.enum(['corner', 'hidden']),
	music: z.string().nullable(),
	title: z.string().nullable(),
	cannotDo: z.array(note).max(MAX_NOTES)
})
export type MakeReply = z.infer<typeof makeReplySchema>

/** The reply's shape, for Gemini's structured output. */
export const MAKE_REPLY_JSON_SCHEMA = {
	type: 'object',
	properties: {
		questions: { type: 'array', items: { type: 'string' } },
		style: { type: 'string', enum: [...MAKE_STYLES] },
		format: { type: 'string', enum: [...MAKE_FORMATS] },
		subject: { type: 'string', enum: [...MAKE_SUBJECTS] },
		summary: { type: 'string' },
		pictureMatters: { type: 'boolean' },
		moments: {
			type: 'array',
			items: {
				type: 'object',
				properties: { first: { type: 'integer' }, last: { type: 'integer' } },
				required: ['first', 'last']
			}
		},
		removeSentences: { type: 'array', items: { type: 'integer' } },
		removeSpans: {
			type: 'array',
			items: {
				type: 'object',
				properties: { startSeconds: { type: 'number' }, endSeconds: { type: 'number' } },
				required: ['startSeconds', 'endSeconds']
			}
		},
		captions: { type: 'string', enum: [...CAPTION_LOOKS] },
		zoomSentences: { type: 'array', items: { type: 'integer' } },
		transition: { type: 'string', enum: [...MAKE_TRANSITIONS] },
		keyLines: {
			type: 'array',
			items: {
				type: 'object',
				properties: { sentence: { type: 'integer' }, text: { type: 'string' } },
				required: ['sentence', 'text']
			}
		},
		shape: { type: 'string', enum: [...MAKE_SHAPES] },
		fit: { type: 'string', enum: [...MAKE_FITS] },
		fitAsked: { type: 'boolean' },
		treatment: { type: 'string', enum: [...SCREEN_TREATMENTS], nullable: true },
		maxSeconds: { type: 'number', nullable: true },
		brief: {
			type: 'object',
			properties: {
				audience: { type: 'string', nullable: true },
				tone: { type: 'string', nullable: true },
				length: { type: 'string', nullable: true },
				show: { type: 'string', nullable: true },
				callToAction: { type: 'string', nullable: true }
			},
			required: ['audience', 'tone', 'length', 'show', 'callToAction']
		},
		faces: {
			type: 'array',
			items: {
				type: 'object',
				properties: { frame: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' } },
				required: ['frame', 'x', 'y']
			}
		},
		card: { type: 'string', enum: ['corner', 'hidden'] },
		music: { type: 'string', nullable: true },
		title: { type: 'string', nullable: true },
		cannotDo: { type: 'array', items: { type: 'string' } }
	},
	required: [
		'questions',
		'style',
		'format',
		'subject',
		'summary',
		'pictureMatters',
		'moments',
		'removeSentences',
		'removeSpans',
		'captions',
		'zoomSentences',
		'transition',
		'keyLines',
		'shape',
		'fit',
		'fitAsked',
		'treatment',
		'maxSeconds',
		'brief',
		'faces',
		'card',
		'music',
		'title',
		'cannotDo'
	]
} as const

/** A question asked and what the user answered. */
export type MakeAnswer = { question: string; answer: string }

/**
 * A follow-up's plan as it is used: the whole plan again, as the follow-up
 * changed it (a follow-up answers in the plan's own shape), over what only
 * the pictures could tell (the subject, the faces, whether the picture
 * matters), which stay as the first plan saw them, since a follow-up
 * doesn't send the pictures again.
 */
export function followUpPlan(current: MakeReply, answer: MakeReply): MakeReply {
	return {
		...answer,
		subject: current.subject,
		faces: current.faces,
		pictureMatters: current.pictureMatters
	}
}

/** Room left around speech where a pause is cut: from the pause only, never a word. */
const SPEECH_PADDING_SECONDS = 0.25
/** A pause longer than this between kept sentences is cut down (talking videos only). */
const LONG_PAUSE_SECONDS = 0.8
/** Pieces shorter than this aren't worth keeping as a clip of their own. */
const MIN_PIECE_SECONDS = 0.3
/** At least this much removed between two clips makes a jump worth a transition. */
const TRANSITION_GAP_SECONDS = 1.5
const TRANSITION_SECONDS: Record<TransitionKind, number> = { fade: 0.5, dissolve: 0.4, slide: 0.4 }
/** Transitions used sparingly: at the few joins where the most was taken out. */
const MAX_TRANSITIONS = 3
/** A zoom cut: the clip after the join starts this much closer and settles over the time below. */
const ZOOM_CUT_AMOUNT = 1.15
const ZOOM_CUT_SECONDS = 0.4
/** A zoom on a sentence shorter than this would be a jolt, not a push-in. */
const MIN_ZOOM_SECONDS = 1
/** The face may drift this far from the crop's middle (a fraction of its width) before the crop moves. */
const FOLLOW_SLACK = 0.2
/** Background music, before it ducks under speech. */
const MUSIC_VOLUME = 0.35
/** A brief's call to action shows over the last seconds of the edit, at most this long. */
const CALL_TO_ACTION_SECONDS = 3
/** Less room than this at the end (after the title) and the call to action is left out. */
const MIN_CALL_TO_ACTION_SECONDS = 1.5

/** Each shape's width over height, and the crop preset it is. */
const SHAPE_RATIO: Record<Exclude<MakeShape, 'original'>, number> = {
	vertical: 9 / 16,
	square: 1,
	portrait: 4 / 5,
	horizontal: 16 / 9
}
const SHAPE_ASPECT: Record<Exclude<MakeShape, 'original'>, CropAspect> = {
	vertical: '9:16',
	square: '1:1',
	portrait: '4:5',
	horizontal: '16:9'
}
/** A video within this share of a shape already is that shape: nothing is cropped or barred. */
const SAME_SHAPE = 0.02

/** Where text sits: key lines (and a vertical edit's title) near the top, clear of the captions below. */
const TOP_TEXT = { x: 0.5, y: 0.18 }
const MIDDLE_TEXT = { x: 0.5, y: 0.4 }
/** A designed frame's title, this much bigger than the style's. */
const DESIGN_TITLE_SCALE = 1.25
/** Each caption look as the editor shows it: a mode (its colours and font are the preset's). */
const CAPTION_MODE: Record<Exclude<CaptionLook, 'off'>, CaptionMode> = {
	classic: 'lines',
	bold_words: 'words',
	highlight: 'highlight',
	large: 'lines'
}
/** A caption look's own size, when the user's words asked for it ("bigger captions"). */
const CAPTION_SIZE: Record<Exclude<CaptionLook, 'off'>, number> = {
	classic: 1.1,
	bold_words: 1.8,
	highlight: 1.3,
	large: 1.7
}
/** The user's own words about the captions: then the reply's caption look is theirs. */
const CAPTIONS_REQUEST = /\b(?:captions?|subtitles?)\b/i

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds

/** Sentence numbers (from 1) that exist, as indexes, each once. */
function sentenceIndexes(numbers: readonly number[], count: number): Set<number> {
	return new Set(numbers.map((n) => n - 1).filter((index) => index >= 0 && index < count))
}

/** Sentence `index` with room around it, into the pauses either side but never into the next words. */
function padded(
	sentence: TranscriptSegment,
	index: number,
	sentences: readonly TranscriptSegment[],
	duration: number
): SourceRange {
	const before = sentences[index - 1]?.endSeconds ?? 0
	const after = sentences[index + 1]?.startSeconds ?? duration
	return {
		startSeconds: Math.min(
			sentence.startSeconds,
			Math.max(before, sentence.startSeconds - SPEECH_PADDING_SECONDS)
		),
		endSeconds: Math.max(
			sentence.endSeconds,
			Math.min(after, sentence.endSeconds + SPEECH_PADDING_SECONDS)
		)
	}
}

/** Ranges joined where they touch or overlap, in order. */
function merged(ranges: SourceRange[]): SourceRange[] {
	const out: SourceRange[] = []
	for (const range of [...ranges].sort((a, b) => a.startSeconds - b.startSeconds)) {
		const last = out.at(-1)
		if (last && range.startSeconds <= last.endSeconds) {
			last.endSeconds = Math.max(last.endSeconds, range.endSeconds)
		} else out.push({ ...range })
	}
	return out
}

/** What's left of `whole` once `removed` is taken out. */
function without(whole: SourceRange, removed: SourceRange[]): SourceRange[] {
	const kept: SourceRange[] = []
	let from = whole.startSeconds
	for (const cut of merged(removed)) {
		if (cut.startSeconds >= whole.endSeconds) break
		if (cut.startSeconds > from) kept.push({ startSeconds: from, endSeconds: cut.startSeconds })
		from = Math.max(from, cut.endSeconds)
	}
	if (from < whole.endSeconds) kept.push({ startSeconds: from, endSeconds: whole.endSeconds })
	return kept
}

/**
 * The parts of the video kept, in order. A talking video (the picture
 * doesn't matter) keeps its kept sentences with a little room each side, so
 * dead air between them goes. A video whose picture matters keeps
 * everything except the sentences and stretches named as dead, a stretch
 * never cutting into a kept sentence's words. Removing everything removes
 * nothing.
 */
export function keptRanges(
	reply: Pick<MakeReply, 'pictureMatters' | 'removeSentences' | 'removeSpans'>,
	sentences: readonly TranscriptSegment[],
	durationSeconds: number
): SourceRange[] {
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	let removed = sentenceIndexes(reply.removeSentences, sentences.length)
	if (removed.size === sentences.length) removed = new Set()
	const all = sentences.map((sentence, index) => ({
		index,
		pause: sentence.startSeconds - (sentences[index - 1]?.endSeconds ?? 0),
		range: padded(sentence, index, sentences, durationSeconds)
	}))
	const keptOnes = all.filter(({ index }) => !removed.has(index))
	const keptSentences = keptOnes.map(({ range }) => range)
	let kept: SourceRange[] = []
	if (!reply.pictureMatters && keptOnes.length > 0) {
		// Sentences one after the other stay together across a short pause; a
		// long one, or a sentence taken out between them, starts a new piece.
		let previous = -1
		for (const { index, pause, range } of keptOnes) {
			const last = kept.at(-1)
			if (last && previous === index - 1 && pause <= LONG_PAUSE_SECONDS) {
				last.endSeconds = range.endSeconds
			} else kept.push({ ...range })
			previous = index
		}
	} else {
		const spans = reply.removeSpans
			.map((span) => ({
				startSeconds: clamp(Math.min(span.startSeconds, span.endSeconds), 0, durationSeconds),
				endSeconds: clamp(Math.max(span.startSeconds, span.endSeconds), 0, durationSeconds)
			}))
			.flatMap((span) => without(span, keptSentences))
		const removedSentences = all.filter(({ index }) => removed.has(index)).map(({ range }) => range)
		kept = without(whole, [...removedSentences, ...spans])
	}
	kept = kept.filter((range) => range.endSeconds - range.startSeconds >= MIN_PIECE_SECONDS)
	return kept.length > 0 ? kept : [whole]
}

/** A range split where it meets `part`: what's before it, the part, what's after (slivers dropped). */
function around(range: SourceRange, part: SourceRange): SourceRange[] {
	if (!overlaps(range, part)) return [range]
	const start = Math.max(range.startSeconds, part.startSeconds)
	const end = Math.min(range.endSeconds, part.endSeconds)
	return [
		{ startSeconds: range.startSeconds, endSeconds: start },
		{ startSeconds: start, endSeconds: end },
		{ startSeconds: end, endSeconds: range.endSeconds }
	].filter(
		(piece, index) => index === 1 || piece.endSeconds - piece.startSeconds >= MIN_PIECE_SECONDS
	)
}

/** The first `seconds` of the kept ranges, in play order: the last one cut short. */
function firstSeconds(kept: SourceRange[], seconds: number): SourceRange[] {
	const out: SourceRange[] = []
	let left = seconds
	for (const range of kept) {
		if (left < MIN_PIECE_SECONDS) break
		const length = Math.min(range.endSeconds - range.startSeconds, left)
		out.push({ startSeconds: range.startSeconds, endSeconds: range.startSeconds + length })
		left -= length
	}
	return out
}

/**
 * The sentences (indexes) a short-form edit is made of: whole moments, best
 * first, each taken only if it still fits under `fits`, then single
 * sentences in order, until `enough` says it's long enough. Dead sentences
 * never; a moment that overlaps one taken before, never. Starts from
 * `start` (none, unless an edit is being lengthened).
 */
export function chooseSentences(
	moments: MakeReply['moments'],
	count: number,
	dead: ReadonlySet<number>,
	fits: (chosen: ReadonlySet<number>) => { fits: boolean; enough: boolean },
	start: ReadonlySet<number> = new Set()
): Set<number> {
	const runs = moments
		.map(({ first, last }) => ({ from: Math.min(first, last) - 1, to: Math.max(first, last) - 1 }))
		.filter(({ from, to }) => from >= 0 && to < count)
		.map(({ from, to }) =>
			Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((i) => !dead.has(i))
		)
	const singles = Array.from({ length: count }, (_, i) => [i]).filter(([i]) => !dead.has(i ?? -1))
	let chosen = new Set(start)
	for (const run of [...runs, ...singles]) {
		if (run.length === 0 || run.some((i) => chosen.has(i))) continue
		const trial = new Set([...chosen, ...run])
		const result = fits(trial)
		if (!result.fits) continue
		chosen = trial
		if (result.enough) break
	}
	return chosen
}

/** A text's words, lower case, its punctuation aside. */
const wordsOf = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []

/**
 * Whether the user's own words give `part` of a brief: every word of it is
 * in the request or a follow-up (Gemini fills a brief in whether or not
 * anyone asked).
 */
export function saidInBrief(part: string, said: readonly string[]): boolean {
	const words = new Set(said.flatMap(wordsOf))
	const partWords = wordsOf(part)
	return partWords.length > 0 && partWords.every((word) => words.has(word))
}

/**
 * The words of a key line, if it quotes its sentence: every word of it is
 * in the sentence (case and punctuation aside), and it's short. Null
 * otherwise: Make it shows no words that weren't said.
 */
export function quotedLine(text: string, sentence: string): string | null {
	const said = new Set(wordsOf(sentence))
	const line = wordsOf(text)
	if (line.length === 0 || line.length > MAX_KEY_LINE_WORDS) return null
	return line.every((word) => said.has(word)) ? text.trim() : null
}

/** Where a moment of the main video plays in the edit, if it does. */
function editedTimeOf(seconds: number, segments: Segment[], starts: number[]): number | null {
	const index = segments.findIndex(
		(s) => !s.source && seconds >= s.startSeconds && seconds < s.endSeconds
	)
	const segment = segments[index]
	if (!segment) return null
	return (starts[index] ?? 0) + (seconds - segment.startSeconds) / (segment.rate ?? 1)
}

/**
 * A crop that follows the face across the frames: its left edge (a
 * fraction of the frame), moving only when the face drifts more than
 * FOLLOW_SLACK of the crop's width from its middle, held where no face is
 * found. Keys are at the frames' times; a run at one place keeps only its
 * ends, so the crop pans between them. Null with no face in any frame.
 */
export function faceFollow(
	faces: MakeReply['faces'],
	times: readonly number[],
	cropWidth: number
): CropKey[] | null {
	// Gemini places faces on a 0–1000 grid, its usual way of giving positions.
	const byFrame = new Map(
		faces
			.filter((face) => face.frame >= 1 && face.frame <= times.length)
			.map((face) => [face.frame - 1, clamp(face.x / 1000, 0, 1)])
	)
	if (byFrame.size === 0) return null
	const keys: CropKey[] = []
	let x: number | null = null
	for (const [index, seconds] of times.entries()) {
		const face = byFrame.get(index)
		if (face !== undefined) {
			const target = clamp(face - cropWidth / 2, 0, 1 - cropWidth)
			if (x === null || Math.abs(face - (x + cropWidth / 2)) > cropWidth * FOLLOW_SLACK) x = target
		}
		if (x !== null) keys.push({ seconds, x })
	}
	return keys.filter((key, index) => keys[index - 1]?.x !== key.x || keys[index + 1]?.x !== key.x)
}

/** Where the face is up and down at `seconds`, from the nearest frame with one; null with none. */
function faceHeightAt(faces: MakeReply['faces'], times: readonly number[], seconds: number) {
	let best: { distance: number; y: number } | null = null
	for (const face of faces) {
		const at = times[face.frame - 1]
		if (at === undefined) continue
		const distance = Math.abs(at - seconds)
		if (!best || distance < best.distance) best = { distance, y: clamp(face.y / 1000, 0, 1) }
	}
	return best?.y ?? null
}

/**
 * Words in on-screen text that look like a name or a handle (a capital
 * inside a sentence, an @ or #) and were never said in the video nor
 * written in the request. Make it puts no such text on screen.
 */
export function inventedNames(text: string, known: string): string[] {
	const knownWords = new Set(known.toLowerCase().match(/[@#]?[\p{L}\p{N}_']+/gu) ?? [])
	const out: string[] = []
	let sentenceStart = true
	for (const match of text.matchAll(/([@#]?[\p{L}\p{N}_']+)|([.!?])/gu)) {
		const word = match[1]
		if (!word) {
			sentenceStart = true
			continue
		}
		const handle = /^[@#]/.test(word)
		const capital = !sentenceStart && /^\p{Lu}/u.test(word) && word !== 'I'
		if ((handle || capital) && !knownWords.has(word.toLowerCase())) out.push(word)
		sentenceStart = false
	}
	return out
}

/** A length that is the result's: "to 55 seconds", "now 0:55", "a 55-second reel", "55 s long". */
const RESULT_LENGTH = new RegExp(
	String.raw`(\b(?:to|into|now|is|of|runs|running)\s+(?:(?:about|around|roughly|just|under|over|a|an)\s+)*)(?:${LENGTH})|(?:${LENGTH})(?=\s*(?:long|reels?|videos?|edits?|shorts?)\b)`,
	'giu'
)

/**
 * The summary with any length it gives the result put right. Gemini writes
 * the summary before the edit is cut to fit (and before the check's fixes),
 * so the length it names can be a plan's guess ("to 55 seconds" for an edit
 * of 50). Only a length said of the result changes, to the edit's own
 * rounded as the plan shows it; the original's length and the lengths of
 * parts cut are left as they are.
 */
export function summaryWithLength(summary: string, editedSeconds: number): string {
	const real = Math.round(editedSeconds)
	return summary.replace(RESULT_LENGTH, (whole, lead: string | undefined, ...groups: unknown[]) => {
		const [m1, s1, n1, gap1, unit1, m2, s2, n2, gap2, unit2] = groups as Array<string | undefined>
		const minutes = m1 ?? m2
		const seconds = s1 ?? s2
		const number = n1 ?? n2
		const gap = gap1 ?? gap2 ?? ' '
		const unit = (unit1 ?? unit2 ?? '').toLowerCase()
		const said =
			minutes !== undefined
				? Number(minutes) * 60 + Number(seconds)
				: Number(number) * (unit.startsWith('m') ? 60 : 1)
		if (Math.abs(said - editedSeconds) < 1) return whole
		const length =
			minutes !== undefined || unit.startsWith('m')
				? `${Math.floor(real / 60)}:${String(real % 60).padStart(2, '0')}`
				: `${real}${gap}${unit1 ?? unit2}`
		return `${lead ?? ''}${length}`
	})
}

/** Music the folder offers, decoded, to lay under the edit. */
export type MusicTrack<Sound> = { name: string; file: Blob; buffer: Sound; seconds: number }

/** The parts of a brief the plan card names. */
export type BriefPart = 'audience' | 'tone' | 'show' | 'lengthSeconds' | 'callToAction'

/** What the plan does, in words for the person deciding whether to apply it. */
export type MakeSummary = {
	style: MakeStyle
	/** What it is making, as the plan's first words say: a format named, else the style. */
	making: Exclude<MakeFormat, 'other'> | MakeStyle
	summary: string
	/** The most it may run (short-form, or asked), and whether sentences beyond the reply's were taken out to fit. */
	limitSeconds: number | null
	/** The most it may run as a follow-up asked ("make it 30 seconds", "shorter"); null when none was asked. */
	maxSeconds: number | null
	trimmedToFit: boolean
	/** The check found it too short, and sentences the plan had left out were put back. */
	lengthened: boolean
	/**
	 * Still short: a reel, TikTok or Short under 50 s of a video that runs
	 * longer (`short_form`), or shorter than the check says the request
	 * wants with nothing to add (`asked`); null when it isn't.
	 */
	short: 'short_form' | 'asked' | null
	/** Sentences kept of all the transcript's. */
	keptSentences: number
	totalSentences: number
	originalSeconds: number
	editedSeconds: number
	/** Parts taken out (dead air, dropped sentences, dead stretches) and filler words cut. */
	removedParts: number
	fillerCuts: number
	captions: CaptionLook
	/** Key lines shown, quoted from the transcript; and whether it opens with its strongest moment. */
	keyLines: number
	opensWith: string | null
	zooms: number
	transition: MakeReply['transition']
	transitions: number
	/** The track laid under it; null with none, `missing` when the folder has none to offer. */
	music: string | null
	musicMissing: boolean
	/**
	 * The shape it comes out, and how the video goes into it: `how` is why
	 * (`kept`: its own shape; `matches`: already the shape; `designed`: a
	 * frame designed around the speech; `face`: zoomed to follow one person;
	 * `centred`: zoomed in, centred; `whole`: all of it, with bars or a
	 * blur). `fit` is null when nothing had to fit. `asked`: the request
	 * named the fit.
	 */
	shape: {
		target: MakeShape
		fit: MakeFit | null
		how: 'kept' | 'matches' | 'designed' | 'face' | 'centred' | 'whole'
		asked: boolean
	}
	/**
	 * A screen recording's treatment and why: the default (whole), a request
	 * for an ad, promo, teaser or highlights (designed), asked for in so many
	 * words, or whole because the second check couldn't run. Null for any
	 * other video.
	 */
	screen: {
		treatment: ScreenTreatment
		why: 'default' | 'promo' | 'asked' | 'unchecked'
	} | null
	/**
	 * The parts of a brief the plan used: who it's for and its tone (in the
	 * style, captions and music), what to show (in what it keeps), a length
	 * (the most it runs), and the call to action shown at the end.
	 */
	brief: {
		audience: string | null
		tone: string | null
		show: string | null
		lengthSeconds: number | null
		callToAction: string | null
		/** Which of them the user's own words gave; the plan chose the rest. */
		said: Record<BriefPart, boolean>
		/** What the plan chose the rest for: a promo, when the request reads as one, else the user. */
		chosenFor: 'promo' | 'you'
	}
	/** A designed frame's picture: a small card in a corner, or hidden; null when not designed. */
	card: Design['picture'] | null
	title: string | null
	/** A title was asked for but named someone or something never said: left out. */
	titleDropped: boolean
	pictureMatters: boolean
	cannotDo: string[]
	/** The look (make-presets.ts), and whether the user's words or a click chose it. */
	look: { preset: Preset; said: boolean }
	/**
	 * The quick questions shown before planning (absent when none were):
	 * what it is and an ad's shape, as planned, and whether the user picked
	 * it (`said`) or left it to "You decide", so it was chosen for them.
	 */
	questions?: {
		kind?: { value: MakeKind | MakeSummary['making']; said: boolean }
		shape?: { value: MakeShape; said: boolean }
	}
}

/** The edit a plan makes, as the editor applies it. */
export type PlannedEdit<Sound> = Omit<EditSnapshot, 'audioItems'> & {
	audioItems: AudioItem<Sound>[]
}

/** A plan as applied: the reply it came from, what it said, and its edit. */
export type MadePlan<Sound> = {
	reply: MakeReply
	summary: MakeSummary
	edit: PlannedEdit<Sound>
	music: MusicTrack<Sound> | null
}

/**
 * Whether the editor's edit is still `plan`'s, as applied: the same values,
 * not copies (applying a plan puts its own in place; Undo puts them back).
 */
export function isPlanEdit<Sound>(
	plan: PlannedEdit<Sound>,
	edit: Pick<
		PlannedEdit<Sound>,
		| 'clips'
		| 'cuts'
		| 'title'
		| 'captionsOn'
		| 'captionMode'
		| 'captionStyle'
		| 'transform'
		| 'audioItems'
		| 'autoZooms'
		| 'autoTitles'
		| 'design'
	>
): boolean {
	return (
		plan.clips === edit.clips &&
		plan.cuts === edit.cuts &&
		plan.title === edit.title &&
		plan.captionsOn === edit.captionsOn &&
		plan.captionMode === edit.captionMode &&
		plan.captionStyle === edit.captionStyle &&
		plan.transform === edit.transform &&
		plan.audioItems === edit.audioItems &&
		plan.autoZooms === edit.autoZooms &&
		plan.autoTitles === edit.autoTitles &&
		plan.design === edit.design
	)
}

/** What every plan of one video is made from, besides its reply: handed to the editor for follow-ups. */
export type MakeBasis = {
	request: string
	/** The answers to the quick questions, when they were shown. */
	choices?: MakeChoices | null
	durationSeconds: number
	picture: Size
	fillerCuts: Cut[]
	musicAvailable: boolean
	/** The video's own colour (video-colours.ts), null when it has none. */
	videoColour?: string | null
}

export type MakeInput<Sound> = {
	reply: MakeReply
	request: string
	durationSeconds: number
	picture: Size
	transcript: Transcript | null
	/** Filler words with a clean pause either side (filler-cuts.ts): safe to cut. */
	fillerCuts: Cut[]
	/** The track Gemini picked, fetched and decoded; null when none was picked or none could be had. */
	music: MusicTrack<Sound> | null
	/** Whether the music folder offered any track at all. */
	musicAvailable: boolean
	/**
	 * The second check found the edit too short: sentences the plan left out
	 * may come back to fill it, except those the check itself dropped.
	 */
	tooShort?: { keepOut: number[] } | null
	/** The second check couldn't run: a screen recording then shows whole, never designed. */
	unchecked?: boolean
	/**
	 * What the user asked after the request (follow-ups, in order): read with
	 * it for what they asked of the treatment and the fit.
	 */
	followUps?: readonly string[]
	/** The answers to the quick questions, when they were shown: the user's own words too. */
	choices?: MakeChoices | null
	/** The video's own colour (video-colours.ts), for its look; null when it has none. */
	videoColour?: string | null
}

/** What every cut of one plan is made from: the reply, the transcript's sentences, the video. */
export type PlanContext = {
	reply: MakeReply
	sentences: readonly TranscriptSegment[]
	durationSeconds: number
	picture: Size
	/** The times the pictures Gemini saw were taken at. */
	times: readonly number[]
	/** Filler words with a clean pause either side: those in what's kept are cut. */
	fillerCuts: Cut[]
	/** The picture carries the video, or there's no speech to plan by. */
	pictureMatters: boolean
	/** A screen recording (a demo, a walkthrough, a shared screen): never zoomed into. */
	screen: boolean
	/** The transition, the look's: a screen recording gets no zoom cuts. */
	transition: MakeReply['transition']
	hasWords: boolean
	/** Every word said, with its time: where a key word starts, for its zoom. */
	words: readonly TranscriptWord[]
	/** How the plan looks: one preset, on this video's colours. */
	look: PresetLook
	/** The user's words or a click chose the look. */
	lookSaid: boolean
	/** The user's own words mention the captions: the reply's caption look is kept, in the look's colours. */
	captionsAsked: boolean
	/**
	 * The user's own words, the request and each follow-up: only they count
	 * as asking (Gemini fills its fields in whether or not anyone asked).
	 */
	said: readonly string[]
	/** The request reads as an ad, a promo, a teaser or a highlights reel. */
	promo: boolean
	/** Every word said in the video, and the request: all that words on screen may use. */
	known: string
}

/** What a cut is made from. */
export type CutBasis = Pick<
	PlanContext,
	| 'reply'
	| 'sentences'
	| 'durationSeconds'
	| 'fillerCuts'
	| 'pictureMatters'
	| 'transition'
	| 'look'
>

/** What every step of one plan reads, worked out once from its input. */
export function planContext(input: MakeInput<unknown>): PlanContext {
	const { reply, durationSeconds, picture, transcript } = input
	const sentences = transcript?.segments ?? []
	const words = transcript?.words ?? []
	const screen = reply.subject === 'screen'
	const chosen = choiceWords(input.choices)
	const said = [input.request, ...chosen, ...(input.followUps ?? [])]
	const preset = choosePreset(reply.style, input.request, input.choices?.style, input.followUps)
	const look = presetLook(preset.preset, input.videoColour ?? null)
	const transition = look.transition.kind
	return {
		reply,
		sentences,
		durationSeconds,
		picture,
		times: frameTimes(durationSeconds),
		fillerCuts: input.fillerCuts,
		pictureMatters: reply.pictureMatters || sentences.length === 0,
		screen,
		transition: screen && transition === 'zoom_cut' ? 'none' : transition,
		hasWords: words.length > 0,
		words,
		look,
		lookSaid: preset.said,
		captionsAsked: said.some((text) => CAPTIONS_REQUEST.test(text)),
		said,
		promo: said.some((text) => PROMO_REQUEST.test(text)),
		known: [...words.map((word) => word.text), input.request, ...chosen].join(' ')
	}
}

/** The sentences (indexes, first to last) of the moment a short-form edit opens with. */
export type Opener = { from: number; to: number }

/** A cut: what's kept, as clips, with the filler cuts in it, its joins and how long it plays. */
export type MadeCut = ReturnType<typeof cutEdit>

/**
 * The cut with these sentences (numbered from 1) taken out, at most `cap`
 * seconds of source, and the piece holding sentence `opener` (an index)
 * moved to the start.
 */
export function cutEdit(
	basis: CutBasis,
	removeSentences: number[],
	cap: number | null = null,
	opener: Opener | null = null
) {
	const { reply, sentences, durationSeconds, pictureMatters, transition } = basis
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	const ranges = keptRanges(
		{ ...reply, removeSentences, pictureMatters },
		sentences,
		durationSeconds
	)
	const timeOrder = cap === null ? ranges : firstSeconds(ranges, cap)
	// The opening moment, cut out of the piece it's in (at the pauses
	// around it) and moved to the start.
	const from = opener ? sentences[opener.from] : undefined
	const to = opener ? sentences[opener.to] : undefined
	const moment =
		opener && from && to
			? {
					startSeconds: padded(from, opener.from, sentences, durationSeconds).startSeconds,
					endSeconds: padded(to, opener.to, sentences, durationSeconds).endSeconds
				}
			: null
	const pieces = moment ? timeOrder.flatMap((range) => around(range, moment)) : timeOrder
	const opening = moment
		? pieces.find(
				(range) =>
					range.startSeconds >= moment.startSeconds && range.endSeconds <= moment.endSeconds
			)
		: undefined
	const kept = opening ? [opening, ...pieces.filter((range) => range !== opening)] : pieces
	const clips: Clip[] = kept.map((range, index) => ({ id: `make-${index + 1}`, ranges: [range] }))
	const cuts = basis.fillerCuts.filter((cut) => kept.some((range) => overlaps(range, cut)))
	const joins = transitionJoins(clips, transition, basis.look.transition.seconds, true)
	const segments = playableSegments(clips, { trim: whole, cuts })
	const transitions =
		transition === 'zoom_cut' ? joins.length : clips.filter((clip) => clip.transition).length
	return {
		kept,
		clips,
		cuts,
		joins,
		transitions,
		segments,
		editedSeconds: editedLength(segments)
	}
}

/**
 * Joins where a real stretch was taken out (or the order jumps), the most
 * taken out first: only the first few get a transition. A fade, dissolve or
 * slide is set on each (as long as both clips have room for half of it),
 * `seconds` long (each kind's own length when not given), a fade or
 * dissolve eased when `eased` (a slide eases already); returns the joins
 * (the index of the clip after), for zoom cuts too.
 */
export function transitionJoins(
	clips: Clip[],
	transition: MakeReply['transition'],
	seconds?: number,
	eased = false
): number[] {
	const joins = clips
		.flatMap((clip, index) => {
			const prior = clips[index - 1]?.ranges.at(-1)
			const [range] = clip.ranges
			if (!prior || !range) return []
			const gap = range.startSeconds - prior.endSeconds
			const jump = gap < 0 ? Number.POSITIVE_INFINITY : gap
			return jump >= TRANSITION_GAP_SECONDS ? [{ index, jump }] : []
		})
		.sort((a, b) => b.jump - a.jump)
		.slice(0, MAX_TRANSITIONS)
		.map(({ index }) => index)
	const kind = transition
	if (kind === 'fade' || kind === 'dissolve' || kind === 'slide') {
		for (const index of joins) {
			const clip = clips[index]
			const before = clips[index - 1]
			const range = clip?.ranges[0]
			const prior = before?.ranges.at(-1)
			if (!clip || !before || !range || !prior) continue
			const limit = transitionLimit(
				prior.endSeconds - prior.startSeconds,
				range.endSeconds - range.startSeconds
			)
			const wanted = seconds ?? TRANSITION_SECONDS[kind]
			const length = Math.min(wanted, limit)
			if (length >= wanted / 2) {
				clip.transition = {
					kind,
					seconds: length,
					after: before.id,
					...(eased && kind !== 'slide' && { eased: true })
				}
			}
		}
	}
	return joins
}

/** How long a plan may run, and what it fills towards. */
export type LengthLimits = {
	/** A reel, TikTok or Short: under a minute, vertical, opening with its strongest moment. */
	shortForm: boolean
	/** A length asked for (in the request, or a follow-up); null when none was. */
	asked: number | null
	/** The most it may run; null when nothing limits it. */
	limitSeconds: number | null
	/** What a cut to fit is filled towards. */
	target: number
}

/**
 * Short-form opens with its strongest moment, and, when it runs over a
 * minute, is made of whole moments (best first, then single sentences)
 * chosen to fill 50 to 59 seconds. Whatever still runs over (one long
 * sentence, a stretch with no speech) keeps only its first part. Filler
 * cuts and overlapping transitions only ever make it shorter. A length
 * asked for (in the request, or a follow-up) limits it further (any edit),
 * and is what it fills towards; it is never called short.
 */
export function lengthLimits(
	reply: Pick<MakeReply, 'format' | 'maxSeconds'>,
	request: string
): LengthLimits {
	const shortForm = isShortForm(reply.format, request)
	const asked = reply.maxSeconds
	const limitSeconds =
		asked !== null
			? Math.min(asked, shortForm ? SHORT_FORM_MAX_SECONDS : Number.POSITIVE_INFINITY)
			: shortForm
				? SHORT_FORM_MAX_SECONDS
				: null
	const target = asked !== null ? (limitSeconds ?? asked) * ASKED_FILL : SHORT_FORM_TARGET_SECONDS
	return { shortForm, asked, limitSeconds, target }
}

/** The most the plan may run, and whether the user's own words asked it. */
export type AskedLength = { seconds: number | null; said: boolean }

/**
 * The most the plan may run, from the user's own words only (Gemini fills a
 * length in whether or not anyone asked). The latest ask wins: a follow-up
 * naming a length, or asking it shorter or longer (Gemini's number for it);
 * else the length clicked; else one the request states (Gemini's reading of
 * it). Left to "You decide", an ad runs at most DEFAULT_AD_SECONDS and a
 * reel, TikTok or Short keeps its own under-a-minute rule, chosen for the
 * user. Nothing asked and no question shown: no length at all. It's only
 * ever a most: a shorter video stays as it is.
 */
export function askedLength(
	reply: Pick<MakeReply, 'maxSeconds' | 'style' | 'format'>,
	request: string,
	choices: MakeChoices | null | undefined,
	followUps: readonly string[] = []
): AskedLength {
	if (followUps.some((text) => namesLength(text) || namesLengthChange(text))) {
		return { seconds: reply.maxSeconds, said: true }
	}
	if (choices?.length) return { seconds: Number(choices.length), said: true }
	if (namesLength(request)) return { seconds: reply.maxSeconds, said: true }
	const decided = choices?.asked.includes('length') ?? false
	const ad = reply.style === 'ad' && !isShortForm(reply.format, request)
	return { seconds: decided && ad ? DEFAULT_AD_SECONDS : null, said: false }
}

/** The strongest moment (the reply's first), which a short-form edit opens with; null otherwise. */
export function openingMoment(
	moments: MakeReply['moments'],
	count: number,
	shortForm: boolean
): Opener | null {
	const strongest = moments[0]
	return shortForm && strongest
		? {
				from: Math.min(strongest.first, strongest.last) - 1,
				to: Math.min(Math.max(strongest.first, strongest.last), count) - 1
			}
		: null
}

/** The sentence numbers (from 1) to take out so only `chosen` (indexes) stay. */
const allBut = (sentences: readonly TranscriptSegment[], chosen: ReadonlySet<number>) =>
	sentences.flatMap((_, index) => (chosen.has(index) ? [] : [index + 1]))

/** A cut, and the sentences taken out to make it. */
export type FittedCut = {
	removeSentences: number[]
	cut: MadeCut
	trimmedToFit: boolean
}

/**
 * The reply's cut, and when it runs over the limit, the one made of whole
 * moments (then single sentences, never dead ones) that fits and fills
 * towards the target; still over, it keeps only its first part.
 */
export function fitToLimit(
	basis: CutBasis,
	limits: LengthLimits,
	opener: Opener | null
): FittedCut {
	const { reply, sentences } = basis
	const { limitSeconds, target } = limits
	const dead = sentenceIndexes(reply.removeSentences, sentences.length)
	let removeSentences = reply.removeSentences
	let cut = cutEdit(basis, removeSentences, null, opener)
	let trimmedToFit = false
	if (limitSeconds !== null && cut.editedSeconds > limitSeconds) {
		trimmedToFit = true
		const chosen = chooseSentences(reply.moments, sentences.length, dead, (trial) => {
			const length = cutEdit(basis, allBut(sentences, trial), null, opener).editedSeconds
			return { fits: length <= limitSeconds, enough: length >= target }
		})
		if (chosen.size > 0) removeSentences = allBut(sentences, chosen)
		cut = cutEdit(basis, removeSentences, null, opener)
		if (cut.editedSeconds > limitSeconds)
			cut = cutEdit(basis, removeSentences, limitSeconds, opener)
	}
	return { removeSentences, cut, trimmedToFit }
}

/**
 * Too short, the check said: a short-form edit takes back sentences the
 * plan had left out (its moments first, then in order, never the check's
 * own drops), until it fills 50 seconds or nothing more fits.
 */
export function lengthenForCheck(
	basis: CutBasis,
	fitted: FittedCut,
	limits: LengthLimits,
	tooShort: MakeInput<unknown>['tooShort'],
	opener: Opener | null
): FittedCut & { lengthened: boolean } {
	const { reply, sentences } = basis
	const { asked, limitSeconds } = limits
	let { removeSentences, cut } = fitted
	let lengthened = false
	if (
		asked === null &&
		limitSeconds !== null &&
		tooShort &&
		cut.editedSeconds < SHORT_FORM_TARGET_SECONDS &&
		sentences.length > 0
	) {
		const keepOut = sentenceIndexes(tooShort.keepOut, sentences.length)
		const removed = sentenceIndexes(removeSentences, sentences.length)
		const inIt = new Set(sentences.flatMap((_, index) => (removed.has(index) ? [] : [index])))
		const chosen = chooseSentences(
			reply.moments,
			sentences.length,
			keepOut,
			(trial) => {
				const length = cutEdit(basis, allBut(sentences, trial), null, opener).editedSeconds
				return { fits: length <= limitSeconds, enough: length >= SHORT_FORM_TARGET_SECONDS }
			},
			inIt
		)
		if (chosen.size > inIt.size) {
			const longer = cutEdit(basis, allBut(sentences, chosen), null, opener)
			if (longer.editedSeconds > cut.editedSeconds) {
				removeSentences = allBut(sentences, chosen)
				cut = longer
				lengthened = true
			}
		}
	}
	return { removeSentences, cut, trimmedToFit: fitted.trimmedToFit, lengthened }
}

/**
 * Whether the plan is still short: a reel, TikTok or Short under 50 s of a
 * video that runs longer, or (no limit) shorter than the check says the
 * request wants. Never with a length asked for. Rounded as the plan shows
 * it, so "50 seconds" is never called short.
 */
export function shortLabel(
	limits: Pick<LengthLimits, 'asked' | 'limitSeconds'>,
	editedSeconds: number,
	durationSeconds: number,
	tooShort: MakeInput<unknown>['tooShort']
): MakeSummary['short'] {
	const { asked, limitSeconds } = limits
	return asked !== null
		? null
		: limitSeconds !== null
			? Math.round(editedSeconds) < SHORT_FORM_TARGET_SECONDS &&
				durationSeconds >= SHORT_FORM_TARGET_SECONDS
				? 'short_form'
				: null
			: tooShort
				? 'asked'
				: null
}

/**
 * A screen recording's treatment, and why: exactly two, the whole screen
 * (the default), or designed around what's said with no picture of the
 * screen at all (the palette, captions and text), for an ad, promo, teaser
 * or highlights reel or when asked. Only the user's own words ask (text
 * only, or the screen shown), then a promo's wording, else the whole
 * screen. Whole whenever the second check couldn't run. Null for any other
 * video.
 */
export function screenTreatment(
	{ screen, said, promo }: Pick<PlanContext, 'screen' | 'said' | 'promo'>,
	unchecked: boolean | undefined
): MakeSummary['screen'] {
	if (!screen) return null
	const askedScreen = askedTreatment(said)
	const treatment: ScreenTreatment = unchecked
		? 'whole'
		: (askedScreen ?? (promo ? 'designed' : 'whole'))
	return {
		treatment,
		why: unchecked
			? 'unchecked'
			: askedScreen
				? 'asked'
				: treatment === 'designed'
					? 'promo'
					: 'default'
	}
}

/**
 * The shape (short-form is always vertical) and how the video goes into
 * it. Nothing is cut off unless a zoom is wanted: asked for, or to keep one
 * person on camera in a reel in view (never in an ad unless asked), with a
 * crop that follows their face. Otherwise the whole picture shows, with
 * bars or over a blur; or, only for a reel or an ad of a meeting whose
 * picture doesn't carry it, in a frame designed around the speech, the
 * picture a small card. Any other label (a screen recording, slides, one
 * person, other, one not on the list) shows whole, as wide as the frame:
 * the label is Gemini's guess, and a guess must never shrink the picture
 * to a corner. A video already the shape is kept. A screen recording
 * designed (its treatment) has no picture of the screen at all; one shown
 * whole is never zoomed into.
 */
export function shapeAndFit(
	context: Pick<
		PlanContext,
		'reply' | 'picture' | 'screen' | 'said' | 'pictureMatters' | 'hasWords' | 'times' | 'look'
	>,
	shortForm: boolean,
	treatment: ScreenTreatment | null
): { shape: MakeSummary['shape']; design: Design | null; transform: PictureTransform } {
	const { reply, picture, screen, said, pictureMatters, hasWords, times, look } = context
	// A fit is asked for only in the user's own words too.
	const fitAsked = reply.fitAsked && said.some((text) => FIT_REQUEST.test(text))
	const shape: MakeShape = shortForm ? 'vertical' : reply.shape
	const designable =
		(shortForm || reply.style === 'ad') &&
		reply.subject === 'meeting' &&
		!pictureMatters &&
		hasWords
	let fit: MakeFit | null = null
	let how: MakeSummary['shape']['how'] = 'kept'
	let design: Design | null = null
	let transform = ORIGINAL_EDIT.transform
	if (treatment === 'designed') {
		design = { palette: reply.style, picture: 'hidden', look: look.design }
		how = 'designed'
		if (shape !== 'original') {
			const crop = fittedCrop(SHAPE_RATIO[shape], picture)
			transform = { ...transform, crop: { aspect: SHAPE_ASPECT[shape], rect: crop, fit: true } }
		}
	} else if (shape !== 'original') {
		const ratio = SHAPE_RATIO[shape]
		const aspect = SHAPE_ASPECT[shape]
		if (Math.abs(picture.width / picture.height - ratio) / ratio <= SAME_SHAPE) how = 'matches'
		else {
			const rect = centredCrop(ratio, picture)
			// One person clearly the subject: said so, and a face in at least half the pictures.
			const faceFrames = new Set(
				reply.faces.map((face) => face.frame).filter((frame) => frame >= 1 && frame <= times.length)
			).size
			const clearly = reply.subject === 'one_person' && faceFrames >= times.length / 2
			const zoomed =
				!screen && reply.fit === 'fill' && (fitAsked || (clearly && reply.style !== 'ad'))
			// A face is followed across: only where the crop is narrower than the picture.
			const follow =
				zoomed && clearly && rect.width < 1 ? faceFollow(reply.faces, times, rect.width) : null
			const first = follow?.[0]
			if (zoomed) {
				fit = 'fill'
				how = first ? 'face' : 'centred'
				transform = {
					...transform,
					crop:
						follow && first
							? { aspect, rect: { ...rect, x: first.x }, ...(follow.length > 1 && { follow }) }
							: { aspect, rect }
				}
			} else if (shape === 'vertical' && designable && !fitAsked) {
				design = { palette: reply.style, picture: reply.card, look: look.design }
				how = 'designed'
				transform = { ...transform, crop: { aspect, rect: fittedCrop(ratio, picture), fit: true } }
			} else {
				fit = reply.fit === 'blur' ? 'blur' : 'bars'
				how = 'whole'
				transform = {
					...transform,
					crop: {
						aspect,
						rect: fittedCrop(ratio, picture),
						fit: true,
						...(fit === 'blur' && { blur: true })
					}
				}
			}
		}
	}
	return { shape: { target: shape, fit, how, asked: fitAsked && fit !== null }, design, transform }
}

/**
 * Zoom cuts at the chosen joins: the clip after starts a little closer and
 * settles. Then a push-in on each key line's key words: from the first word
 * it quotes to the end of its sentence, where it still plays, never
 * overlapping, at most MAX_ZOOMS, at the look's strength; none in a
 * designed frame, whose picture isn't what's being said, nor on a screen. A
 * followed face is zoomed towards.
 */
export function planZooms(
	context: Pick<
		PlanContext,
		'reply' | 'transition' | 'sentences' | 'screen' | 'times' | 'words' | 'look'
	>,
	cut: Pick<MadeCut, 'joins' | 'segments' | 'editedSeconds'>,
	/** Where each segment starts in the edit. */
	starts: number[],
	design: Design | null,
	how: MakeSummary['shape']['how']
): Zoom[] {
	const { reply, transition, sentences, screen, times, words, look } = context
	const { joins, segments, editedSeconds } = cut
	const autoZooms: Zoom[] =
		transition === 'zoom_cut'
			? joins.map((index) => {
					const at = starts[index] ?? 0
					return {
						startSeconds: at,
						endSeconds: Math.min(at + ZOOM_CUT_SECONDS, editedSeconds),
						direction: 'out',
						amount: ZOOM_CUT_AMOUNT
					}
				})
			: []
	// Each key line that quotes its sentence: where its first quoted word is said.
	const keyWords = (design || screen ? [] : reply.keyLines)
		.flatMap((line) => {
			const sentence = sentences[line.sentence - 1]
			if (!sentence || !quotedLine(line.text, sentence.text)) return []
			const first = wordsOf(line.text)[0]
			const word = words.find(
				(w) =>
					w.startSeconds >= sentence.startSeconds - 0.01 &&
					w.startSeconds < sentence.endSeconds &&
					wordsOf(w.text)[0] === first
			)
			return [{ sentence, from: word?.startSeconds ?? sentence.startSeconds }]
		})
		.sort((a, b) => a.from - b.from)
	for (const { sentence, from } of keyWords) {
		if (autoZooms.length >= MAX_ZOOMS) break
		const start = editedTimeOf(from, segments, starts)
		const end = editedTimeOf(sentence.endSeconds - 0.01, segments, starts)
		if (start === null || end === null || end - start < MIN_ZOOM_SECONDS) continue
		if (autoZooms.some((zoom) => start < zoom.endSeconds && end > zoom.startSeconds)) continue
		const faceY = how === 'face' ? faceHeightAt(reply.faces, times, sentence.startSeconds) : null
		autoZooms.push({
			startSeconds: start,
			endSeconds: end,
			direction: 'in',
			amount: look.zoom,
			...(faceY !== null && { focus: { x: 0.5, y: faceY } })
		})
	}
	return autoZooms
}

/** Music under the whole edit, repeated to fill it, ducking under speech; none without a track. */
export function musicBed<Sound>(
	music: MusicTrack<Sound> | null,
	editedSeconds: number
): AudioItem<Sound>[] {
	const audioItems: AudioItem<Sound>[] = []
	if (music && music.seconds > 0) {
		for (let at = 0, n = 1; at < editedSeconds - MIN_PIECE_SECONDS; at += music.seconds, n++) {
			const pieces = [{ startSeconds: 0, endSeconds: music.seconds }]
			audioItems.push({
				id: `make-music-${n}`,
				name: music.name,
				buffer: music.buffer,
				origin: { kind: 'file', file: music.file },
				pieces,
				skipSeconds: 0,
				seconds: Math.min(availableSeconds({ pieces }), editedSeconds - at),
				atSeconds: at,
				volume: MUSIC_VOLUME,
				muted: false,
				duck: true
			})
		}
	}
	return audioItems
}

/**
 * A title only with words the video or the request gave it (`known`); one
 * naming anyone or anything never said is dropped. Bigger in a designed
 * frame, and near the top of a tall frame or a designed one.
 */
export function planTitle(
	{ reply, known, look }: Pick<PlanContext, 'reply' | 'known' | 'look'>,
	editedSeconds: number,
	design: Design | null,
	/** The frame is taller than wide. */
	tall: boolean
): { title: TitleCard | null; titleDropped: boolean } {
	const titleText = reply.title?.trim().slice(0, MAX_TITLE_LENGTH) ?? ''
	const titleDropped = titleText !== '' && inventedNames(titleText, known).length > 0
	const title: TitleCard | null =
		titleText && !titleDropped
			? {
					text: titleText,
					startSeconds: 0,
					durationSeconds: Math.min(look.pacing.titleSeconds, editedSeconds),
					// Bigger in a designed frame: it's what the frame is about.
					style: design
						? { ...look.title.designed, size: look.title.designed.size * DESIGN_TITLE_SCALE }
						: look.title.picture,
					animation: look.title.animation,
					// Above the captions; near the top of a tall frame or a designed one.
					at: tall || design ? TOP_TEXT : MIDDLE_TEXT
				}
			: null
	return { title, titleDropped }
}

/**
 * Key lines: words quoted from their sentence, over it where it plays,
 * after the title and never two at once; at most MAX_KEY_LINES, held as
 * long as the look's pacing allows.
 */
export function keyLineTitles(
	{ reply, sentences, look }: Pick<PlanContext, 'reply' | 'sentences' | 'look'>,
	{ segments, editedSeconds }: Pick<MadeCut, 'segments' | 'editedSeconds'>,
	/** Where each segment starts in the edit. */
	starts: number[],
	title: TitleCard | null,
	design: Design | null = null
): TitleCard[] {
	const { keyLineMin, keyLineMax } = look.pacing
	const autoTitles: TitleCard[] = []
	for (const line of reply.keyLines) {
		if (autoTitles.length === MAX_KEY_LINES) break
		const sentence = sentences[line.sentence - 1]
		const text = sentence ? quotedLine(line.text, sentence.text) : null
		const start = sentence ? editedTimeOf(sentence.startSeconds, segments, starts) : null
		if (!sentence || !text || start === null) continue
		const end = editedTimeOf(sentence.endSeconds - 0.01, segments, starts) ?? start
		const length = Math.min(keyLineMax, Math.max(keyLineMin, end - start))
		const until = Math.min(start + length, editedSeconds)
		const titleEnd = title ? title.startSeconds + title.durationSeconds : 0
		const clash = autoTitles.some(
			(other) => start < other.startSeconds + other.durationSeconds && until > other.startSeconds
		)
		if (start < titleEnd || clash || until - start < keyLineMin / 2) continue
		autoTitles.push({
			text,
			startSeconds: start,
			durationSeconds: until - start,
			style: design ? look.title.designed : look.title.picture,
			animation: look.title.animation,
			at: TOP_TEXT
		})
	}
	return autoTitles
}

/**
 * A brief's call to action, over the last seconds: only with words the
 * video or the request gave it, after the title, any key line it would
 * meet left out. The words on screen, in the order they show.
 */
export function withCallToAction(
	{ reply, known, look }: Pick<PlanContext, 'reply' | 'known' | 'look'>,
	keyLines: readonly TitleCard[],
	editedSeconds: number,
	title: TitleCard | null,
	design: Design | null = null
): { autoTitles: TitleCard[]; callToAction: string | null } {
	const autoTitles = [...keyLines]
	const actionText = reply.brief.callToAction?.trim().slice(0, MAX_TITLE_LENGTH) ?? ''
	const actionFrom = Math.max(
		editedSeconds - CALL_TO_ACTION_SECONDS,
		title ? title.startSeconds + title.durationSeconds : 0
	)
	const callToAction =
		actionText &&
		inventedNames(actionText, known).length === 0 &&
		editedSeconds - actionFrom >= MIN_CALL_TO_ACTION_SECONDS
			? actionText
			: null
	if (callToAction) {
		for (let index = autoTitles.length - 1; index >= 0; index--) {
			const line = autoTitles[index]
			if (line && line.startSeconds + line.durationSeconds > actionFrom) autoTitles.splice(index, 1)
		}
		autoTitles.push({
			text: callToAction,
			startSeconds: actionFrom,
			durationSeconds: editedSeconds - actionFrom,
			style: design ? look.title.designed : look.title.picture,
			animation: look.title.animation,
			at: MIDDLE_TEXT
		})
	}
	autoTitles.sort((a, b) => a.startSeconds - b.startSeconds)
	return { autoTitles, callToAction }
}

/**
 * The look's captions, as the editor's caption settings: their style over
 * the picture, or on a designed background; off when the reply has them
 * off, or there are no words to caption. When the user's own words asked
 * about the captions ("make the captions bigger"), the reply's caption look
 * (Gemini's reading of those words) is kept, at its own size, in the look's
 * colours and font.
 */
export function captionSettings(
	look: PresetLook,
	reply: Pick<MakeReply, 'captions'>,
	hasWords: boolean,
	designed: boolean,
	asked = false
) {
	// Whether captions show is the reply's (a request for none is kept); how they look, the preset's.
	const captions: CaptionLook =
		!hasWords || reply.captions === 'off' ? 'off' : asked ? reply.captions : look.captionLook
	const style = designed ? look.captions.designed : look.captions.picture
	return {
		captions,
		captionsOn: captions !== 'off',
		captionMode: captions === 'off' ? 'lines' : CAPTION_MODE[captions],
		captionStyle:
			captions === 'off'
				? DEFAULT_TEXT_STYLE
				: asked
					? { ...style, size: CAPTION_SIZE[captions] }
					: style
	}
}

/**
 * What the plan does, in words for the person deciding whether to apply it:
 * its length and what was cut, its shape and treatment, what's on screen,
 * and which parts of a brief were the user's own words (Gemini fills a
 * brief in whether or not anyone asked).
 */
export function planSummary<Sound>(
	context: Pick<
		PlanContext,
		'reply' | 'durationSeconds' | 'sentences' | 'transition' | 'said' | 'promo' | 'pictureMatters'
	>,
	{
		limits,
		made,
		short,
		opener,
		captions,
		edit,
		callToAction,
		titleDropped,
		music,
		musicAvailable,
		shape,
		screen,
		choices,
		lengthSaid,
		look
	}: {
		limits: LengthLimits
		made: FittedCut & { lengthened: boolean }
		short: MakeSummary['short']
		opener: Opener | null
		captions: CaptionLook
		edit: Pick<PlannedEdit<Sound>, 'autoZooms' | 'autoTitles' | 'audioItems' | 'title' | 'design'>
		callToAction: string | null
		titleDropped: boolean
		music: MusicTrack<Sound> | null
		musicAvailable: boolean
		shape: MakeSummary['shape']
		screen: MakeSummary['screen']
		/** The answers to the quick questions, when they were shown. */
		choices?: MakeChoices | null
		/** The length came from the user's own words: typed, clicked, or a follow-up. */
		lengthSaid: boolean
		/** The look, and whether the user's words or a click chose it. */
		look: MakeSummary['look']
	}
): MakeSummary {
	const { reply, durationSeconds, sentences, transition, said, promo, pictureMatters } = context
	const { kept, cuts, joins, transitions, editedSeconds } = made.cut
	const { autoZooms, autoTitles, audioItems, title, design } = edit
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	const keptSentences = sentences.filter((sentence) =>
		kept.some((range) => overlaps(range, sentence))
	).length
	const opening = opener === null ? null : (sentences[opener.from]?.text ?? null)
	const making = reply.format === 'other' ? reply.style : reply.format
	const asked = new Set(choices?.asked ?? [])
	return {
		style: reply.style,
		making,
		summary: summaryWithLength(reply.summary, editedSeconds),
		limitSeconds: limits.limitSeconds,
		maxSeconds: limits.asked,
		trimmedToFit: made.trimmedToFit,
		lengthened: made.lengthened,
		short,
		keptSentences,
		totalSentences: sentences.length,
		originalSeconds: durationSeconds,
		editedSeconds,
		removedParts: without(whole, kept).length,
		fillerCuts: cuts.length,
		captions,
		keyLines: autoTitles.length - (callToAction ? 1 : 0),
		// Said when it moved: the strongest line opens, before what came first in the video.
		opensWith: (kept[0]?.startSeconds ?? 0) > (kept[1]?.startSeconds ?? Infinity) ? opening : null,
		zooms: autoZooms.length - (transition === 'zoom_cut' ? joins.length : 0),
		transition,
		transitions,
		music: audioItems.length > 0 ? (music?.name ?? null) : null,
		musicMissing: !musicAvailable,
		shape,
		screen,
		brief: {
			audience: reply.brief.audience,
			tone: reply.brief.tone,
			show: reply.brief.show,
			lengthSeconds: limits.asked,
			callToAction,
			// Like the treatment: only the user's own words make a part theirs.
			said: {
				audience: saidInBrief(reply.brief.audience ?? '', said),
				tone: saidInBrief(reply.brief.tone ?? '', said),
				show: saidInBrief(reply.brief.show ?? '', said),
				lengthSeconds: lengthSaid,
				callToAction: saidInBrief(callToAction ?? '', said)
			},
			chosenFor: promo ? 'promo' : 'you'
		},
		card: design?.picture ?? null,
		title: title?.text ?? null,
		titleDropped,
		pictureMatters,
		cannotDo: reply.cannotDo,
		look,
		// Only the questions shown, each the user's when picked, chosen for them when not.
		...(choices && {
			questions: {
				...(asked.has('kind') && {
					kind: { value: choices.kind === 'other' ? 'other' : making, said: choices.kind !== null }
				}),
				...(asked.has('adShape') && {
					shape: { value: shape.target, said: choices.adShape !== null }
				})
			}
		})
	}
}

/**
 * The edit a Make it reply describes, as a snapshot for the editor, and a
 * summary of it. Everything the reply names is checked: sentences and
 * frames that don't exist are ignored, a title naming anyone never
 * mentioned is left out. A short-form edit (a reel, TikTok or Short) is cut
 * to under a minute here, whatever the reply planned. Vertical follows a
 * face only when one person is the subject; anything else keeps the whole
 * picture, with black bars.
 */
export function planMake<Sound>(input: MakeInput<Sound>): {
	edit: PlannedEdit<Sound>
	summary: MakeSummary
	/** The reply as used: its sentences taken out as they were cut to fit or lengthened. */
	used: MakeReply
} {
	// What was clicked in place of Gemini's guess, then a length only the user asked.
	const applied = applyChoices(input.reply, input.choices, input.followUps)
	const length = askedLength(applied, input.request, input.choices, input.followUps)
	const context = planContext({ ...input, reply: { ...applied, maxSeconds: length.seconds } })
	const { reply, sentences, durationSeconds, picture } = context

	// What's kept, and how long it runs.
	const limits = lengthLimits(reply, input.request)
	const opener = openingMoment(reply.moments, sentences.length, limits.shortForm)
	const fitted = fitToLimit(context, limits, opener)
	const made = lengthenForCheck(context, fitted, limits, input.tooShort, opener)
	const { clips, cuts, segments, editedSeconds } = made.cut
	const starts = editedStarts(segments)

	// How it looks: the treatment, the shape, zooms, music, words on screen, captions.
	const screen = screenTreatment(context, input.unchecked)
	const { shape, design, transform } = shapeAndFit(
		context,
		limits.shortForm,
		screen?.treatment ?? null
	)
	// Text sits near the top of a frame taller than wide, clear of the captions.
	const tall =
		(shape.target === 'original' ? picture.width / picture.height : SHAPE_RATIO[shape.target]) < 1
	const autoZooms = planZooms(context, made.cut, starts, design, shape.how)
	const audioItems = musicBed(input.music, editedSeconds)
	const { title, titleDropped } = planTitle(context, editedSeconds, design, tall)
	const keyLines = keyLineTitles(context, made.cut, starts, title, design)
	const { autoTitles, callToAction } = withCallToAction(
		context,
		keyLines,
		editedSeconds,
		title,
		design
	)
	const { captions, ...captionFields } = captionSettings(
		context.look,
		reply,
		context.hasWords,
		design !== null,
		context.captionsAsked
	)

	const edit = {
		...ORIGINAL_EDIT,
		replacements: [],
		clips,
		cuts,
		title,
		...captionFields,
		transform,
		color: context.look.grade,
		audioItems,
		autoZooms,
		autoTitles,
		design
	}
	const summary = planSummary(context, {
		limits,
		made,
		short: shortLabel(limits, editedSeconds, durationSeconds, input.tooShort),
		opener,
		captions,
		edit,
		callToAction,
		titleDropped,
		music: input.music,
		musicAvailable: input.musicAvailable,
		shape,
		screen,
		choices: input.choices,
		lengthSaid: length.said,
		look: { preset: context.look.preset, said: context.lookSaid }
	})
	return { edit, used: { ...reply, removeSentences: made.removeSentences }, summary }
}

/** One way a follow-up's plan differs from the plan before it, for the chat to say. */
export type PlanChange =
	| {
			kind: 'length' | 'sentences' | 'keyLines' | 'zooms' | 'transitions'
			from: number
			to: number
	  }
	| { kind: 'captions'; from: CaptionLook; to: CaptionLook }
	| { kind: 'look'; from: Preset; to: Preset }
	| { kind: 'shape'; from: MakeShape; to: MakeShape }
	| { kind: 'fit'; from: FitLabel; to: FitLabel }
	| { kind: 'title' | 'music'; from: string | null; to: string | null }

/** How the video goes into its shape, as a follow-up's change says it. */
export type FitLabel = MakeFit | 'designed' | 'none'

const fitLabel = (shape: MakeSummary['shape']): FitLabel =>
	shape.how === 'designed' ? 'designed' : (shape.fit ?? 'none')

/**
 * What changed from plan `before` to plan `after`, in the plan card's order:
 * the length (in whole seconds, as the plan shows it) and the sentences
 * kept, then the shape, captions, text on screen, motion and music. Empty
 * when nothing a person would notice changed.
 */
export function planChanges(before: MakeSummary, after: MakeSummary): PlanChange[] {
	const changes: PlanChange[] = []
	// The look first, as the plan card shows it.
	if (before.look.preset !== after.look.preset) {
		changes.push({ kind: 'look', from: before.look.preset, to: after.look.preset })
	}
	const count = (
		kind: 'length' | 'sentences' | 'keyLines' | 'zooms' | 'transitions',
		from: number,
		to: number
	) => {
		if (from !== to) changes.push({ kind, from, to })
	}
	count('length', Math.round(before.editedSeconds), Math.round(after.editedSeconds))
	count('sentences', before.keptSentences, after.keptSentences)
	if (before.shape.target !== after.shape.target) {
		changes.push({ kind: 'shape', from: before.shape.target, to: after.shape.target })
	}
	if (fitLabel(before.shape) !== fitLabel(after.shape)) {
		changes.push({ kind: 'fit', from: fitLabel(before.shape), to: fitLabel(after.shape) })
	}
	if (before.captions !== after.captions) {
		changes.push({ kind: 'captions', from: before.captions, to: after.captions })
	}
	if (before.title !== after.title)
		changes.push({ kind: 'title', from: before.title, to: after.title })
	count('keyLines', before.keyLines, after.keyLines)
	count('zooms', before.zooms, after.zooms)
	count('transitions', before.transitions, after.transitions)
	if (before.music !== after.music)
		changes.push({ kind: 'music', from: before.music, to: after.music })
	return changes
}

/**
 * The second check's answer: what's wrong with the plan against the request
 * (empty when nothing is), and the plan's text, captions and transitions as
 * they should be, with any sentences to take out. Applied only when it
 * found a problem; the code's own rules (length, quotes, names) still hold.
 */
export const checkReplySchema = z.object({
	problems: z.array(note).max(MAX_NOTES),
	title: z.string().nullable(),
	keyLines: z.array(z.object({ sentence: z.number().int(), text: z.string() })),
	captions: z.enum(CAPTION_LOOKS),
	transition: z.enum(MAKE_TRANSITIONS),
	dropSentences: z.array(z.number().int()),
	/** Shorter than the request wants (a reel under 50 s with more worth keeping, a length asked for). */
	tooShort: z.boolean()
})
export type CheckReply = z.infer<typeof checkReplySchema>

export const CHECK_REPLY_JSON_SCHEMA = {
	type: 'object',
	properties: {
		problems: { type: 'array', items: { type: 'string' } },
		title: { type: 'string', nullable: true },
		keyLines: MAKE_REPLY_JSON_SCHEMA.properties.keyLines,
		captions: { type: 'string', enum: [...CAPTION_LOOKS] },
		transition: { type: 'string', enum: [...MAKE_TRANSITIONS] },
		dropSentences: { type: 'array', items: { type: 'integer' } },
		tooShort: { type: 'boolean' }
	},
	required: ['problems', 'title', 'keyLines', 'captions', 'transition', 'dropSentences', 'tooShort']
} as const

/**
 * A plan as the second check reads it: what was asked, what it makes, how
 * long, the sentences in the order they play (numbered as in the
 * transcript, marked when one is cut short), and its words on screen.
 */
export function describePlan(
	reply: MakeReply,
	summary: MakeSummary,
	clips: readonly Clip[],
	sentences: readonly TranscriptSegment[]
): string {
	const played = clips.flatMap((clip) =>
		clip.ranges.flatMap((range) =>
			sentences.flatMap((sentence, index) => {
				if (!overlaps(range, sentence)) return []
				const whole =
					range.startSeconds <= sentence.startSeconds + 0.01 &&
					range.endSeconds >= sentence.endSeconds - 0.01
				return [`[${index + 1}${whole ? '' : ', cut short'}] ${sentence.text}`]
			})
		)
	)
	return [
		`Making: ${summary.making} (style ${reply.style}), ${summary.editedSeconds.toFixed(1)} s long` +
			(summary.limitSeconds === null
				? '.'
				: `, must be under ${Math.ceil(summary.limitSeconds + 0.01)} s.`),
		'Plays, in order:',
		...(played.length > 0 ? played : ['(no speech)']),
		`Shape: ${summary.shape.target}${summary.shape.fit ? `, ${summary.shape.fit}` : ''}.`,
		`Title: ${summary.title === null ? 'none' : `"${summary.title}"`}`,
		`Key lines: ${reply.keyLines.map((line) => `[${line.sentence}] "${line.text}"`).join(', ') || 'none'}`,
		`Captions: ${summary.captions}. Transitions: ${reply.transition}.`
	].join('\n')
}

/** Whether the check asks for the plan to be made again: a problem found, or too short. */
export function checkFound(check: CheckReply): boolean {
	return check.problems.length > 0 || check.tooShort
}

/**
 * The reply with the check's fixes, when it found a problem; as it was
 * otherwise. Too short alone changes nothing here: planMake lengthens the
 * edit, told by `tooShort`.
 */
export function applyCheck(reply: MakeReply, check: CheckReply): MakeReply {
	if (check.problems.length === 0) return reply
	return {
		...reply,
		title: check.title,
		keyLines: check.keyLines,
		captions: check.captions,
		transition: check.transition,
		removeSentences: [...reply.removeSentences, ...check.dropSentences]
	}
}
