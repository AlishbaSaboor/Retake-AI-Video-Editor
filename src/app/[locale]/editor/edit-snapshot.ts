import type { Annotation } from './annotations'
import type { AudioItem } from './audio-lane'
import type { AddedVideo } from './sources'
import type { LowerThird, Zoom } from './motion'
import type { Cut } from './cleanup'
import type { TitleCard, Watermark } from './overlays'
import type { ReplacementTake } from './re-record'
import type { Clip, SourceRange } from './sequence'
import { IDENTITY_TRANSFORM, isIdentity, type PictureTransform } from './transform'
import { isDefaultAudio } from './clip-audio'
import { isNeutral, NEUTRAL_GRADE, type ColorGrade } from './color-grade'
import { DEFAULT_TEXT_STYLE, isDefaultStyle, type TextStyle } from './text-style'
import type { TrimRange } from './timeline-scale'

/** One step of Undo/Redo: what's trimmed, cut, arranged, re-recorded and laid over. */
export type EditSnapshot<R = ReplacementTake> = {
	trim: TrimRange | null
	cuts: Cut[]
	clips: Clip[] | null
	replacements: R[]
	title: TitleCard | null
	watermark: Watermark | null
	captionsOn: boolean
	annotations: Annotation[]
	/** Flip, rotation and crop of the whole picture. */
	transform: PictureTransform
	/** The whole video's color adjustments (a clip's own are on the clip). */
	color: ColorGrade
	captionStyle: TextStyle
	/** The Audio lane's sounds. */
	audioItems: AudioItem[]
	/** Videos added after the main one, and each one's trim, by id. */
	addedVideos: AddedVideo[]
	sourceTrims: Readonly<Record<string, TrimRange>>
	/** The lower third and the zoom (motion.ts). */
	lowerThird: LowerThird | null
	zoom: Zoom | null
}

/** The edit right after upload: the whole take, untouched. */
export const ORIGINAL_EDIT: EditSnapshot = {
	trim: null,
	cuts: [],
	clips: null,
	replacements: [],
	title: null,
	watermark: null,
	captionsOn: false,
	annotations: [],
	transform: IDENTITY_TRANSFORM,
	color: NEUTRAL_GRADE,
	captionStyle: DEFAULT_TEXT_STYLE,
	audioItems: [],
	addedVideos: [],
	sourceTrims: {},
	lowerThird: null,
	zoom: null
}

/**
 * Whether an edit is the original take, by what it does rather than how it
 * got there: a trim dragged back to the edges, or a split merged again,
 * leaves nothing to reset.
 */
export function isOriginalEdit<R>(edit: EditSnapshot<R>, durationSeconds: number): boolean {
	const isWhole = (range: SourceRange) =>
		range.startSeconds === 0 && range.endSeconds === durationSeconds
	const [onlyClip, ...otherClips] = edit.clips ?? []
	const [onlyRange, ...otherRanges] = onlyClip?.ranges ?? []
	return (
		(edit.trim === null || isWhole(edit.trim)) &&
		edit.cuts.length === 0 &&
		edit.replacements.length === 0 &&
		edit.title === null &&
		edit.watermark === null &&
		!edit.captionsOn &&
		edit.annotations.length === 0 &&
		isIdentity(edit.transform) &&
		isNeutral(edit.color) &&
		isDefaultStyle(edit.captionStyle) &&
		edit.audioItems.length === 0 &&
		edit.addedVideos.length === 0 &&
		!edit.lowerThird &&
		!edit.zoom &&
		(edit.clips === null ||
			(otherClips.length === 0 &&
				otherRanges.length === 0 &&
				onlyRange !== undefined &&
				isWhole(onlyRange) &&
				isDefaultAudio(onlyClip?.audio) &&
				(onlyClip?.speed ?? 1) === 1 &&
				isNeutral(onlyClip?.color) &&
				!onlyClip?.soundInLane))
	)
}
