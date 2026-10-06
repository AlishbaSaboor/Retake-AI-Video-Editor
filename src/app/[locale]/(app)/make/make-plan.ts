import { z } from 'zod'
import { availableSeconds, type AudioItem } from '../../editor/audio-lane'
import type { Cut } from '../../editor/cleanup'
import { ORIGINAL_EDIT, type EditSnapshot } from '../../editor/edit-snapshot'
import type { Zoom } from '../../editor/motion'
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
import { centredCrop, type CropKey, type Size } from '../../editor/transform'
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

/** One picture every this many seconds, from the middle of each stretch. */
export const FRAME_EVERY_SECONDS = 2
/** Make it reads at most 5 minutes, like the transcript: one picture every 2 s of it. */
export const MAX_MAKE_SECONDS = 300
export const MAX_FRAMES = MAX_MAKE_SECONDS / FRAME_EVERY_SECONDS
export const MAX_QUESTIONS = 3
export const MAX_REQUEST_LENGTH = 300
const MAX_ZOOMS = 6
const MAX_NOTES = 5
const MAX_NOTE_LENGTH = 200
const MAX_TITLE_LENGTH = 60

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

/** What Gemini answers. Questions, when there are any, are asked before anything is planned. */
export const makeReplySchema = z.object({
	questions: z.array(note).max(MAX_QUESTIONS),
	style: z.enum(MAKE_STYLES),
	summary: note,
	pictureMatters: z.boolean(),
	removeSentences: z.array(z.number().int()),
	removeSpans: z.array(z.object({ startSeconds: z.number(), endSeconds: z.number() })),
	captions: z.enum(['words', 'lines', 'off']),
	zoomSentences: z.array(z.number().int()),
	transition: z.enum(['none', 'fade', 'dissolve']),
	vertical: z.boolean(),
	faces: z.array(z.object({ frame: z.number().int(), x: z.number(), y: z.number() })),
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
		summary: { type: 'string' },
		pictureMatters: { type: 'boolean' },
		removeSentences: { type: 'array', items: { type: 'integer' } },
		removeSpans: {
			type: 'array',
			items: {
				type: 'object',
				properties: { startSeconds: { type: 'number' }, endSeconds: { type: 'number' } },
				required: ['startSeconds', 'endSeconds']
			}
		},
		captions: { type: 'string', enum: ['words', 'lines', 'off'] },
		zoomSentences: { type: 'array', items: { type: 'integer' } },
		transition: { type: 'string', enum: ['none', 'fade', 'dissolve'] },
		vertical: { type: 'boolean' },
		faces: {
			type: 'array',
			items: {
				type: 'object',
				properties: { frame: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' } },
				required: ['frame', 'x', 'y']
			}
		},
		music: { type: 'string', nullable: true },
		title: { type: 'string', nullable: true },
		cannotDo: { type: 'array', items: { type: 'string' } }
	},
	required: [
		'questions',
		'style',
		'summary',
		'pictureMatters',
		'removeSentences',
		'removeSpans',
		'captions',
		'zoomSentences',
		'transition',
		'vertical',
		'faces',
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
const TRANSITION_SECONDS: Record<TransitionKind, number> = { fade: 0.5, dissolve: 0.4 }
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

const CAPTION_STYLE: Record<MakeStyle, TextStyle> = {
	reel: { ...DEFAULT_TEXT_STYLE, size: 1.5 },
	professional: DEFAULT_TEXT_STYLE,
	funny: { ...DEFAULT_TEXT_STYLE, size: 1.5, color: '#ffff00' },
	ad: { ...DEFAULT_TEXT_STYLE, size: 1.5 }
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
	summary: string
	originalSeconds: number
	editedSeconds: number
	/** Parts taken out (dead air, dropped sentences, dead stretches) and filler words cut. */
	removedParts: number
	fillerCuts: number
	captions: MakeReply['captions']
	zooms: number
	transition: MakeReply['transition']
	transitions: number
	/** The track laid under it; null with none, `missing` when the folder has none to offer. */
	music: string | null
	musicMissing: boolean
	vertical: 'face' | 'centre' | 'already' | null
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
 * mentioned is left out, a crop with no face found is centred.
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

	const kept = keptRanges({ ...reply, pictureMatters }, sentences, durationSeconds)
	const clips: Clip[] = kept.map((range, index) => ({ id: `make-${index + 1}`, ranges: [range] }))
	const cuts = input.fillerCuts.filter((cut) => kept.some((range) => overlaps(range, cut)))

	// A transition only where a real stretch was taken out between two clips.
	let transitions = 0
	if (reply.transition !== 'none') {
		const kind = reply.transition
		for (const [index, clip] of clips.entries()) {
			const before = clips[index - 1]
			const [range] = clip.ranges
			const prior = before?.ranges.at(-1)
			if (
				!before ||
				!prior ||
				!range ||
				range.startSeconds - prior.endSeconds < TRANSITION_GAP_SECONDS
			)
				continue
			const limit = transitionLimit(
				prior.endSeconds - prior.startSeconds,
				range.endSeconds - range.startSeconds
			)
			const seconds = Math.min(TRANSITION_SECONDS[kind], limit)
			if (seconds < TRANSITION_SECONDS[kind] / 2) continue
			clip.transition = { kind, seconds, after: before.id }
			transitions++
		}
	}

	const segments = playableSegments(clips, { trim: whole, cuts })
	const starts = editedStarts(segments)
	const editedSeconds = editedLength(segments)

	// The vertical crop: following the face where one is seen, else centred.
	const ratio = 9 / 16
	const alreadyVertical = picture.width / picture.height <= ratio + 0.01
	let vertical: MakeSummary['vertical'] = null
	let transform = ORIGINAL_EDIT.transform
	if (reply.vertical && alreadyVertical) vertical = 'already'
	else if (reply.vertical) {
		const rect = centredCrop(ratio, picture)
		const follow = faceFollow(reply.faces, times, rect.width)
		const first = follow?.[0]
		vertical = follow && first ? 'face' : 'centre'
		transform = {
			...transform,
			crop: {
				aspect: '9:16',
				rect: first ? { ...rect, x: first.x } : rect,
				...(follow && first && follow.length > 1 && { follow })
			}
		}
	}

	// Zooms on the sentences named, where they still play, never overlapping.
	const autoZooms: Zoom[] = []
	for (const index of [...sentenceIndexes(reply.zoomSentences, sentences.length)].sort(
		(a, b) => a - b
	)) {
		if (autoZooms.length === MAX_ZOOMS) break
		const sentence = sentences[index]
		if (!sentence) continue
		const start = editedTimeOf(sentence.startSeconds, segments, starts)
		const end = editedTimeOf(sentence.endSeconds - 0.01, segments, starts)
		if (start === null || end === null || end - start < MIN_ZOOM_SECONDS) continue
		if (autoZooms.some((zoom) => start < zoom.endSeconds)) continue
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
					style: CAPTION_STYLE[reply.style],
					animation: {
						in: { kind: 'pop', side: 'left', seconds: 0.4 },
						out: { kind: 'fade', side: 'left', seconds: 0.4 }
					}
				}
			: null

	const captions = words.length > 0 ? reply.captions : 'off'
	const edit = {
		...ORIGINAL_EDIT,
		replacements: [],
		clips,
		cuts,
		title,
		captionsOn: captions !== 'off',
		captionWords: captions === 'words',
		captionStyle: captions === 'off' ? DEFAULT_TEXT_STYLE : CAPTION_STYLE[reply.style],
		transform,
		audioItems,
		autoZooms
	}
	return {
		edit,
		summary: {
			style: reply.style,
			summary: reply.summary,
			originalSeconds: durationSeconds,
			editedSeconds,
			removedParts: without(whole, kept).length,
			fillerCuts: cuts.length,
			captions,
			zooms: autoZooms.length,
			transition: reply.transition,
			transitions,
			music: audioItems.length > 0 ? (music?.name ?? null) : null,
			musicMissing: !input.musicAvailable,
			vertical,
			title: title?.text ?? null,
			titleDropped,
			pictureMatters,
			cannotDo: reply.cannotDo
		}
	}
}
