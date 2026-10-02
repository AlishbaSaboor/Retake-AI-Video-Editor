import type { Cut } from './cleanup'
import type { TitleCard, Watermark } from './overlays'
import type { ReplacementTake } from './re-record'
import type { Clip, SourceRange } from './sequence'
import type { TrimRange } from './timeline-scale'

/** One step of Undo/Redo: what's trimmed, cut, arranged, re-recorded and laid over. */
export type EditSnapshot<R = ReplacementTake> = {
	trim: TrimRange | null
	cuts: Cut[]
	clips: Clip[] | null
	replacements: R[]
	title: TitleCard | null
	watermark: Watermark | null
}

/** The edit right after upload: the whole take, untouched. */
export const ORIGINAL_EDIT: EditSnapshot = {
	trim: null,
	cuts: [],
	clips: null,
	replacements: [],
	title: null,
	watermark: null
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
		(edit.clips === null ||
			(otherClips.length === 0 &&
				otherRanges.length === 0 &&
				onlyRange !== undefined &&
				isWhole(onlyRange)))
	)
}
