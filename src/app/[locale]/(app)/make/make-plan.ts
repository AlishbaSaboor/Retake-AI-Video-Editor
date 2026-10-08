import { z } from 'zod'
import { availableSeconds, type AudioItem } from '../../editor/audio-lane'
import type { Cut } from '../../editor/cleanup'
import type { Design } from '../../editor/design'
import { ORIGINAL_EDIT, type EditSnapshot } from '../../editor/edit-snapshot'
import type { CaptionMode } from '../../editor/captions'
import type { Animation, Zoom } from '../../editor/motion'
import type { TitleCard } from '../../editor/overlays'
import {
	editedLength,
	editedStarts,
	playableSegments,
	type Clip,
	type Segment,
	type SourceRange
} from '../../editor/sequence'
import { DEFAULT_TEXT_STYLE, type TextStyle } from '../../editor/text-style'
import { centredCrop, fittedCrop, type CropKey, type Size } from '../../editor/transform'
import type { Transcript, TranscriptSegment } from '../../editor/transcript'
import { transitionLimit, type TransitionKind } from '../../editor/transitions'

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
export const MAX_REQUEST_LENGTH = 300
const MAX_ZOOMS = 6
/** Key lines on screen: a few, short, so they stay readable. */
const MAX_KEY_LINES = 4
const MAX_KEY_LINE_WORDS = 8
const MAX_NOTES = 5
const MAX_NOTE_LENGTH = 200
const MAX_TITLE_LENGTH = 60

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

const note = z
	.string()
	.transform((text) => text.trim().slice(0, MAX_NOTE_LENGTH))
	.pipe(z.string().min(1))

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
	subject: z.enum(MAKE_SUBJECTS),
	summary: note,
	pictureMatters: z.boolean(),
	moments: z.array(z.object({ first: z.number().int(), last: z.number().int() })),
	removeSentences: z.array(z.number().int()),
	removeSpans: z.array(z.object({ startSeconds: z.number(), endSeconds: z.number() })),
	captions: z.enum(CAPTION_LOOKS),
	zoomSentences: z.array(z.number().int()),
	transition: z.enum(MAKE_TRANSITIONS),
	keyLines: z.array(z.object({ sentence: z.number().int(), text: z.string() })),
	vertical: z.boolean(),
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
		vertical: { type: 'boolean' },
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
		'vertical',
		'faces',
		'card',
		'music',
		'title',
		'cannotDo'
	]
} as const

/** A question asked and what the user answered. */
export type MakeAnswer = { question: string; answer: string }

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
const ZOOM_AMOUNT: Record<MakeStyle, number> = {
	reel: 1.25,
	professional: 1.12,
	funny: 1.4,
	ad: 1.25
}
/** The face may drift this far from the crop's middle (a fraction of its width) before the crop moves. */
const FOLLOW_SLACK = 0.2
/** Background music, before it ducks under speech. */
const MUSIC_VOLUME = 0.35
const TITLE_SECONDS = 3

/** The title's and key lines' look, by style: bold and quick, calm, playful, punchy. */
const TEXT_STYLE: Record<MakeStyle, TextStyle> = {
	reel: { ...DEFAULT_TEXT_STYLE, size: 1.3 },
	professional: { ...DEFAULT_TEXT_STYLE, font: 'serif' },
	funny: { ...DEFAULT_TEXT_STYLE, size: 1.3, color: '#ffff00' },
	ad: { ...DEFAULT_TEXT_STYLE, size: 1.4 }
}
/** How the title and key lines come in and go out, by style. */
const TEXT_MOTION: Record<MakeStyle, Animation> = {
	reel: {
		in: { kind: 'words', side: 'left', seconds: 0.6 },
		out: { kind: 'fade', side: 'left', seconds: 0.25 }
	},
	professional: {
		in: { kind: 'fade', side: 'left', seconds: 0.7 },
		out: { kind: 'fade', side: 'left', seconds: 0.5 }
	},
	funny: {
		in: { kind: 'pop', side: 'left', seconds: 0.45 },
		out: { kind: 'pop', side: 'left', seconds: 0.3 }
	},
	ad: {
		in: { kind: 'slide', side: 'left', seconds: 0.35 },
		out: { kind: 'fade', side: 'left', seconds: 0.25 }
	}
}
/** Where text sits: key lines (and a vertical edit's title) near the top, clear of the captions below. */
const TOP_TEXT = { x: 0.5, y: 0.18 }
const MIDDLE_TEXT = { x: 0.5, y: 0.4 }
/** A designed frame's title, this much bigger than the style's. */
const DESIGN_TITLE_SCALE = 1.25
/** How long a key line stays: through its sentence, within these. */
const MIN_KEY_LINE_SECONDS = 1.5
const MAX_KEY_LINE_SECONDS = 4

/** Each caption look as the editor shows it: a mode, and a size on the request's colours. */
const CAPTION_LOOK: Record<Exclude<CaptionLook, 'off'>, { mode: CaptionMode; size: number }> = {
	classic: { mode: 'lines', size: 1.1 },
	bold_words: { mode: 'words', size: 1.8 },
	highlight: { mode: 'highlight', size: 1.3 },
	large: { mode: 'lines', size: 1.7 }
}

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
 * never; a moment that overlaps one taken before, never.
 */
export function chooseSentences(
	moments: MakeReply['moments'],
	count: number,
	dead: ReadonlySet<number>,
	fits: (chosen: ReadonlySet<number>) => { fits: boolean; enough: boolean }
): Set<number> {
	const runs = moments
		.map(({ first, last }) => ({ from: Math.min(first, last) - 1, to: Math.max(first, last) - 1 }))
		.filter(({ from, to }) => from >= 0 && to < count)
		.map(({ from, to }) =>
			Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((i) => !dead.has(i))
		)
	const singles = Array.from({ length: count }, (_, i) => [i]).filter(([i]) => !dead.has(i ?? -1))
	let chosen = new Set<number>()
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

/**
 * The words of a key line, if it quotes its sentence: every word of it is
 * in the sentence (case and punctuation aside), and it's short. Null
 * otherwise: Make it shows no words that weren't said.
 */
export function quotedLine(text: string, sentence: string): string | null {
	const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
	const said = new Set(words(sentence))
	const line = words(text)
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

/** Music the folder offers, decoded, to lay under the edit. */
export type MusicTrack<Sound> = { name: string; file: Blob; buffer: Sound; seconds: number }

/** What the plan does, in words for the person deciding whether to apply it. */
export type MakeSummary = {
	style: MakeStyle
	/** What it is making, as the plan's first words say: a format named, else the style. */
	making: Exclude<MakeFormat, 'other'> | MakeStyle
	summary: string
	/** The most it may run (short-form), and whether sentences beyond the reply's were taken out to fit. */
	limitSeconds: number | null
	trimmedToFit: boolean
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
	/** Vertical: following one person's face, or the whole picture fitted with black bars. */
	vertical: 'face' | 'fit' | 'designed' | 'already' | null
	/** A designed frame's picture: a small card in a corner, or hidden; null when not designed. */
	card: Design['picture'] | null
	title: string | null
	/** A title was asked for but named someone or something never said: left out. */
	titleDropped: boolean
	pictureMatters: boolean
	cannotDo: string[]
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
	edit: Omit<EditSnapshot, 'audioItems'> & { audioItems: AudioItem<Sound>[] }
	summary: MakeSummary
} {
	const { reply, durationSeconds, picture, transcript, music } = input
	const sentences = transcript?.segments ?? []
	const words = transcript?.words ?? []
	const times = frameTimes(durationSeconds)
	const whole = { startSeconds: 0, endSeconds: durationSeconds }
	const pictureMatters = reply.pictureMatters || sentences.length === 0

	/**
	 * The cut with these sentences (numbered from 1) taken out, at most `cap`
	 * seconds of source, and the piece holding sentence `opener` (an index)
	 * moved to the start.
	 */
	const cutWith = (
		removeSentences: number[],
		cap: number | null = null,
		opener: { from: number; to: number } | null = null
	) => {
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
		const cuts = input.fillerCuts.filter((cut) => kept.some((range) => overlaps(range, cut)))
		// Joins where a real stretch was taken out (or the order jumps), the
		// most taken out first: only the first few get a transition.
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
		const kind = reply.transition
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
				const seconds = Math.min(TRANSITION_SECONDS[kind], limit)
				if (seconds >= TRANSITION_SECONDS[kind] / 2) {
					clip.transition = { kind, seconds, after: before.id }
				}
			}
		}
		const segments = playableSegments(clips, { trim: whole, cuts })
		const transitions =
			kind === 'zoom_cut' ? joins.length : clips.filter((clip) => clip.transition).length
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

	// Short-form opens with its strongest moment, and, when it runs over a
	// minute, is made of whole moments (best first, then single sentences)
	// chosen to fill 50 to 59 seconds. Whatever still runs over (one long
	// sentence, a stretch with no speech) keeps only its first part. Filler
	// cuts and overlapping transitions only ever make it shorter.
	const shortForm = isShortForm(reply.format, input.request)
	const limitSeconds = shortForm ? SHORT_FORM_MAX_SECONDS : null
	const dead = sentenceIndexes(reply.removeSentences, sentences.length)
	const strongest = reply.moments[0]
	const opener =
		shortForm && strongest
			? {
					from: Math.min(strongest.first, strongest.last) - 1,
					to: Math.min(Math.max(strongest.first, strongest.last), sentences.length) - 1
				}
			: null
	let removeSentences = reply.removeSentences
	let cut = cutWith(removeSentences, null, opener)
	let trimmedToFit = false
	if (limitSeconds !== null && cut.editedSeconds > limitSeconds) {
		trimmedToFit = true
		const keepOnly = (chosen: ReadonlySet<number>) =>
			sentences.flatMap((_, index) => (chosen.has(index) ? [] : [index + 1]))
		const chosen = chooseSentences(reply.moments, sentences.length, dead, (trial) => {
			const length = cutWith(keepOnly(trial), null, opener).editedSeconds
			return { fits: length <= limitSeconds, enough: length >= SHORT_FORM_TARGET_SECONDS }
		})
		if (chosen.size > 0) removeSentences = keepOnly(chosen)
		cut = cutWith(removeSentences, null, opener)
		if (cut.editedSeconds > limitSeconds) cut = cutWith(removeSentences, limitSeconds, opener)
	}
	const { kept, clips, cuts, joins, transitions, segments, editedSeconds } = cut
	const starts = editedStarts(segments)
	const keptSentences = sentences.filter((sentence) =>
		kept.some((range) => overlaps(range, sentence))
	).length

	// Vertical (short-form always is): a crop following the face only when
	// one person is the subject and a face was found; anything else keeps the
	// whole picture, never cut off: fitted inside with black bars, or, for a
	// reel or an ad whose picture doesn't carry it (a static meeting, a still
	// screen), a frame designed around the speech, the picture a small card.
	const ratio = 9 / 16
	const alreadyVertical = picture.width / picture.height <= ratio + 0.01
	const wantsVertical = reply.vertical || shortForm
	const designable = (shortForm || reply.style === 'ad') && !pictureMatters && words.length > 0
	let vertical: MakeSummary['vertical'] = null
	let design: Design | null = null
	let transform = ORIGINAL_EDIT.transform
	if (wantsVertical && alreadyVertical) vertical = 'already'
	else if (wantsVertical) {
		const rect = centredCrop(ratio, picture)
		// One person clearly the subject: said so, and a face in at least half the pictures.
		const faceFrames = new Set(
			reply.faces.map((face) => face.frame).filter((frame) => frame >= 1 && frame <= times.length)
		).size
		const clearly = reply.subject === 'one_person' && faceFrames >= times.length / 2
		const follow = clearly ? faceFollow(reply.faces, times, rect.width) : null
		const first = follow?.[0]
		if (!first && designable) {
			design = { palette: reply.style, picture: reply.card }
			vertical = 'designed'
		} else vertical = first ? 'face' : 'fit'
		transform = {
			...transform,
			crop:
				follow && first
					? {
							aspect: '9:16',
							rect: { ...rect, x: first.x },
							...(follow.length > 1 && { follow })
						}
					: { aspect: '9:16', rect: fittedCrop(ratio, picture), fit: true }
		}
	}

	// Zoom cuts at the chosen joins: the clip after starts a little closer and settles.
	const autoZooms: Zoom[] =
		reply.transition === 'zoom_cut'
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
	// Zooms on the sentences named, where they still play, never overlapping;
	// none in a designed frame, whose picture isn't what's being said.
	for (const index of [
		...sentenceIndexes(design ? [] : reply.zoomSentences, sentences.length)
	].sort((a, b) => a - b)) {
		if (autoZooms.length >= MAX_ZOOMS) break
		const sentence = sentences[index]
		if (!sentence) continue
		const start = editedTimeOf(sentence.startSeconds, segments, starts)
		const end = editedTimeOf(sentence.endSeconds - 0.01, segments, starts)
		if (start === null || end === null || end - start < MIN_ZOOM_SECONDS) continue
		if (autoZooms.some((zoom) => start < zoom.endSeconds && end > zoom.startSeconds)) continue
		const faceY =
			vertical === 'face' ? faceHeightAt(reply.faces, times, sentence.startSeconds) : null
		autoZooms.push({
			startSeconds: start,
			endSeconds: end,
			direction: 'in',
			amount: ZOOM_AMOUNT[reply.style],
			...(faceY !== null && { focus: { x: 0.5, y: faceY } })
		})
	}

	// Music under the whole edit, repeated to fill it, ducking under speech.
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

	// A title only with words the video or the request gave it.
	const titleText = reply.title?.trim().slice(0, MAX_TITLE_LENGTH) ?? ''
	const known = `${words.map((word) => word.text).join(' ')} ${input.request}`
	const titleDropped = titleText !== '' && inventedNames(titleText, known).length > 0
	const title: TitleCard | null =
		titleText && !titleDropped
			? {
					text: titleText,
					startSeconds: 0,
					durationSeconds: Math.min(TITLE_SECONDS, editedSeconds),
					// Bigger in a designed frame: it's what the frame is about.
					style: design
						? {
								...TEXT_STYLE[reply.style],
								size: TEXT_STYLE[reply.style].size * DESIGN_TITLE_SCALE
							}
						: TEXT_STYLE[reply.style],
					animation: TEXT_MOTION[reply.style],
					// Above the captions; near the top of a vertical frame.
					at: vertical === null ? MIDDLE_TEXT : TOP_TEXT
				}
			: null

	// Key lines: words quoted from their sentence, over it where it plays,
	// after the title and never two at once.
	const autoTitles: TitleCard[] = []
	for (const line of reply.keyLines) {
		if (autoTitles.length === MAX_KEY_LINES) break
		const sentence = sentences[line.sentence - 1]
		const text = sentence ? quotedLine(line.text, sentence.text) : null
		const start = sentence ? editedTimeOf(sentence.startSeconds, segments, starts) : null
		if (!sentence || !text || start === null) continue
		const end = editedTimeOf(sentence.endSeconds - 0.01, segments, starts) ?? start
		const length = Math.min(MAX_KEY_LINE_SECONDS, Math.max(MIN_KEY_LINE_SECONDS, end - start))
		const until = Math.min(start + length, editedSeconds)
		const titleEnd = title ? title.startSeconds + title.durationSeconds : 0
		const clash = autoTitles.some(
			(other) => start < other.startSeconds + other.durationSeconds && until > other.startSeconds
		)
		if (start < titleEnd || clash || until - start < MIN_KEY_LINE_SECONDS / 2) continue
		autoTitles.push({
			text,
			startSeconds: start,
			durationSeconds: until - start,
			style: TEXT_STYLE[reply.style],
			animation: TEXT_MOTION[reply.style],
			at: TOP_TEXT
		})
	}
	autoTitles.sort((a, b) => a.startSeconds - b.startSeconds)

	const captions = words.length > 0 ? reply.captions : 'off'
	const look = captions === 'off' ? null : CAPTION_LOOK[captions]
	const opening = opener === null ? null : (sentences[opener.from]?.text ?? null)
	const edit = {
		...ORIGINAL_EDIT,
		replacements: [],
		clips,
		cuts,
		title,
		captionsOn: look !== null,
		captionMode: look?.mode ?? 'lines',
		captionStyle: look
			? { ...DEFAULT_TEXT_STYLE, color: TEXT_STYLE[reply.style].color, size: look.size }
			: DEFAULT_TEXT_STYLE,
		transform,
		audioItems,
		autoZooms,
		autoTitles,
		design
	}
	return {
		edit,
		summary: {
			style: reply.style,
			making: reply.format === 'other' ? reply.style : reply.format,
			summary: reply.summary,
			limitSeconds,
			trimmedToFit,
			keptSentences,
			totalSentences: sentences.length,
			originalSeconds: durationSeconds,
			editedSeconds,
			removedParts: without(whole, kept).length,
			fillerCuts: cuts.length,
			captions,
			keyLines: autoTitles.length,
			// Said when it moved: the strongest line opens, before what came first in the video.
			opensWith:
				(kept[0]?.startSeconds ?? 0) > (kept[1]?.startSeconds ?? Infinity) ? opening : null,
			zooms: autoZooms.length - (reply.transition === 'zoom_cut' ? joins.length : 0),
			transition: reply.transition,
			transitions,
			music: audioItems.length > 0 ? (music?.name ?? null) : null,
			musicMissing: !input.musicAvailable,
			vertical,
			card: design?.picture ?? null,
			title: title?.text ?? null,
			titleDropped,
			pictureMatters,
			cannotDo: reply.cannotDo
		}
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
	dropSentences: z.array(z.number().int())
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
		dropSentences: { type: 'array', items: { type: 'integer' } }
	},
	required: ['problems', 'title', 'keyLines', 'captions', 'transition', 'dropSentences']
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
			(summary.limitSeconds === null ? '.' : `, must be under 60 s.`),
		'Plays, in order:',
		...(played.length > 0 ? played : ['(no speech)']),
		`Title: ${summary.title === null ? 'none' : `"${summary.title}"`}`,
		`Key lines: ${reply.keyLines.map((line) => `[${line.sentence}] "${line.text}"`).join(', ') || 'none'}`,
		`Captions: ${summary.captions}. Transitions: ${reply.transition}.`
	].join('\n')
}

/** The reply with the check's fixes, when it found anything to fix; as it was otherwise. */
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
