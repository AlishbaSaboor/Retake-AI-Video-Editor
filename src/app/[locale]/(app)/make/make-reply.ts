import { z } from 'zod'
import { MAX_BRIEF_PART_LENGTH } from './make-questions'

// The contract with Gemini: what a Make it request may hold, and the shapes its reply and its check's reply must have.

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

/** What the picture shows: only one person as the clear subject gets a crop that follows a face. */
export const MAKE_SUBJECTS = ['one_person', 'screen', 'meeting', 'slides', 'other'] as const

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

const MAX_NOTES = 5
const MAX_NOTE_LENGTH = 200
/** The plan's summary: two plain sentences, with room to finish them. */
const MAX_SUMMARY_LENGTH = 400

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
