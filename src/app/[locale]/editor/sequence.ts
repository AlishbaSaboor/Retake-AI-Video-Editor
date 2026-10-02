import type { Edit } from './cleanup'

// The take as an ordered sequence of clips. A clip is one or more ranges of
// the source file, played in order; clips are played in sequence order.
// Clips only arrange the take — between them they always cover the whole
// source exactly once — so splitting, reordering and merging never remove
// anything. Trim and cuts still decide what's removed, on top of this.

export type SourceRange = { startSeconds: number; endSeconds: number }
export type Clip = { id: string; ranges: SourceRange[] }

/** Shortest piece a split may leave on either side, so no clip is a sliver. */
const MIN_CLIP_SECONDS = 0.1
/** Gaps shorter than this between kept pieces are rounding, not content. */
const EPSILON_SECONDS = 1e-6

/** The take before any split: one clip covering the whole source. */
export function wholeTake(durationSeconds: number): Clip[] {
	return [{ id: 'take', ranges: [{ startSeconds: 0, endSeconds: durationSeconds }] }]
}

/** The clip and range a split at `seconds` would divide, with room on both sides. */
function findSplit(clips: Clip[], seconds: number) {
	for (const [clipIndex, clip] of clips.entries()) {
		const rangeIndex = clip.ranges.findIndex(
			(r) =>
				seconds - r.startSeconds >= MIN_CLIP_SECONDS && r.endSeconds - seconds >= MIN_CLIP_SECONDS
		)
		const range = clip.ranges[rangeIndex]
		if (range) return { clipIndex, clip, rangeIndex, range }
	}
	return null
}

/** Whether a split at `seconds` would leave at least MIN_CLIP_SECONDS on both sides. */
export function canSplitAt(clips: Clip[], seconds: number): boolean {
	return findSplit(clips, seconds) !== null
}

/** Splits the clip containing `seconds` into two at that point; null where canSplitAt is false. */
export function splitClipAt(clips: Clip[], seconds: number, newId: () => string): Clip[] | null {
	const split = findSplit(clips, seconds)
	if (!split) return null
	const { clipIndex, clip, rangeIndex, range } = split
	const before: Clip = {
		id: newId(),
		ranges: [
			...clip.ranges.slice(0, rangeIndex),
			{ startSeconds: range.startSeconds, endSeconds: seconds }
		]
	}
	const after: Clip = {
		id: newId(),
		ranges: [
			{ startSeconds: seconds, endSeconds: range.endSeconds },
			...clip.ranges.slice(rangeIndex + 1)
		]
	}
	return [...clips.slice(0, clipIndex), before, after, ...clips.slice(clipIndex + 1)]
}

/**
 * Which clip a source time belongs to: the one with a range containing it,
 * or — at the very end of a range, where playback stops — the one it ends.
 */
export function clipIndexAt(clips: Clip[], seconds: number): number {
	const containing = clips.findIndex((c) =>
		c.ranges.some((r) => seconds >= r.startSeconds && seconds < r.endSeconds)
	)
	if (containing >= 0) return containing
	return clips.findIndex((c) =>
		c.ranges.some((r) => Math.abs(seconds - r.endSeconds) < EPSILON_SECONDS)
	)
}

/** What part of a source range survives the trim and the cuts, in order. */
function keptPieces(range: SourceRange, { trim, cuts }: Edit): SourceRange[] {
	let start = Math.max(range.startSeconds, trim.startSeconds)
	const end = Math.min(range.endSeconds, trim.endSeconds)
	const pieces: SourceRange[] = []
	for (const cut of [...cuts].sort((a, b) => a.startSeconds - b.startSeconds)) {
		if (cut.endSeconds <= start || cut.startSeconds >= end) continue
		if (cut.startSeconds - start > EPSILON_SECONDS) {
			pieces.push({ startSeconds: start, endSeconds: cut.startSeconds })
		}
		start = Math.max(start, cut.endSeconds)
	}
	if (end - start > EPSILON_SECONDS) pieces.push({ startSeconds: start, endSeconds: end })
	return pieces
}

/** Everything that plays, in playback order: each clip's ranges, trimmed and cut. */
export function playableSegments(clips: Clip[], edit: Edit): SourceRange[] {
	return clips.flatMap((clip) => clip.ranges.flatMap((range) => keptPieces(range, edit)))
}

/** How long one clip plays for, after trim and cuts. */
export function clipPlayedSeconds(clip: Clip, edit: Edit): number {
	return playableSegments([clip], edit).reduce((sum, s) => sum + s.endSeconds - s.startSeconds, 0)
}

/**
 * Where playback stands at a source time: the segment containing it, or —
 * when it falls in something removed — the start of the next segment in the
 * source, the same way a cut is skipped. Null past the last of them.
 */
export function playbackPosition(
	seconds: number,
	segments: SourceRange[]
): { index: number; seconds: number } | null {
	const inside = segments.findIndex((s) => seconds >= s.startSeconds && seconds < s.endSeconds)
	if (inside >= 0) return { index: inside, seconds }
	let next: { index: number; seconds: number } | null = null
	for (const [index, s] of segments.entries()) {
		if (s.startSeconds > seconds && (!next || s.startSeconds < next.seconds)) {
			next = { index, seconds: s.startSeconds }
		}
	}
	return next
}
