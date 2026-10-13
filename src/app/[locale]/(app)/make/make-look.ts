import { type AudioItem, availableSeconds } from '../../editor/model/audio-lane'
import { ORIGINAL_EDIT } from '../../editor/model/edit-snapshot'
import type { Segment } from '../../editor/model/sequence'
import {
	centredCrop,
	type CropAspect,
	type CropKey,
	fittedCrop,
	type PictureTransform
} from '../../editor/model/transform'
import type { CaptionMode } from '../../editor/overlays/captions'
import type { Design } from '../../editor/overlays/design'
import type { Zoom } from '../../editor/overlays/motion'
import type { TitleCard } from '../../editor/overlays/overlays'
import { DEFAULT_TEXT_STYLE } from '../../editor/overlays/text-style'
import type { PresetLook } from './make-presets'
import type { CaptionLook, MakeFit, MakeReply, MakeShape, ScreenTreatment } from './make-reply'
import { askedTreatment, FIT_REQUEST, inventedNames, quotedLine, wordsOf } from './make-request'
import type { MakeSummary, MusicTrack, PlanContext } from './make-context'
import { clamp, type MadeCut, MIN_PIECE_SECONDS } from './make-cut'

// How a Make it plan looks: its shape and fit, a screen recording's treatment, zooms, the music bed, titles, key lines, the call to action and captions.

const MAX_ZOOMS = 6
/** Key lines on screen: a few, short, so they stay readable. */
const MAX_KEY_LINES = 4
const MAX_TITLE_LENGTH = 60

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
export const SHAPE_RATIO: Record<Exclude<MakeShape, 'original'>, number> = {
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
