import type { Edit } from './cleanup'
import { DEFAULT_CLIP_AUDIO, isDefaultAudio, type ClipAudio, type SegmentAudio } from './clip-audio'

// The take as an ordered sequence of clips. A clip is one or more ranges of
// the source file, played in order; clips are played in sequence order.
// Clips only arrange the take — between them they always cover the whole
// source exactly once — so splitting, reordering and merging never remove
// anything. Trim and cuts still decide what's removed, on top of this.

export type SourceRange = { startSeconds: number; endSeconds: number }
/**
 * `audio` is the clip's volume, mute and fades; `speed` how fast it really
 * plays (0.25 to 4, pitch kept). Absent means as recorded.
 */
export type Clip = { id: string; ranges: SourceRange[]; audio?: ClipAudio; speed?: number }

/** The slowest and fastest a clip may play: what the browser keeps sound and pitch for. */
export const MIN_CLIP_SPEED = 0.25
export const MAX_CLIP_SPEED = 4

export function clampSpeed(speed: number): number {
	return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed))
}

/** A clip with its sound and speed set, each left off when as recorded. */
export function withClipSettings(
	clip: Clip,
	audio: ClipAudio | undefined,
	speed: number | undefined
): Clip {
	return {
		id: clip.id,
		ranges: clip.ranges,
		...(audio && !isDefaultAudio(audio) && { audio }),
		...(speed !== undefined && speed !== 1 && { speed })
	}
}

/** Whether a re-recorded take plays inside the clip: its speed then can't change. */
export function clipHasTake(clip: Clip, replacements: readonly Replacement[]): boolean {
	return replacements.some(({ span }) =>
		clip.ranges.some(
			(range) => span.startSeconds < range.endSeconds && span.endSeconds > range.startSeconds
		)
	)
}

/**
 * A span of the source whose sound a re-recorded take replaces. The span's
 * picture keeps playing under the take: cut short where the take is
 * shorter, holding its last frame where the take runs longer.
 */
export type Replacement = { span: SourceRange; takeSeconds: number }

/** One stretch of what plays: a range of the source, possibly with a take heard over it. */
export type Segment<R extends Replacement = Replacement> = SourceRange & {
	/** The take heard instead of the source, and how long the last frame is held after the range. */
	voiceOver?: { replacement: R; holdSeconds: number }
	/** Its clip's volume and fades, and where in the clip it falls; absent at full, unfaded volume. */
	audio?: SegmentAudio
	/** How fast its clip plays; absent at 1. Its source plays (end - start) / rate seconds. */
	rate?: number
}

/** Shortest piece a split may leave on either side, so no clip is a sliver. */
const MIN_CLIP_SECONDS = 0.1
/** Gaps shorter than this between kept pieces are rounding, not content. */
const EPSILON_SECONDS = 1e-6

/** The take before any split: one clip covering the whole source. */
export function wholeTake(durationSeconds: number): Clip[] {
	return [{ id: 'take', ranges: [{ startSeconds: 0, endSeconds: durationSeconds }] }]
}

/**
 * The clip and range a split at `seconds` would divide, with room on both
 * sides — never inside a replaced span, which has to stay in one piece.
 */
function findSplit(clips: Clip[], seconds: number, replacements: readonly Replacement[]) {
	if (replacements.some((r) => seconds > r.span.startSeconds && seconds < r.span.endSeconds)) {
		return null
	}
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
export function canSplitAt(
	clips: Clip[],
	seconds: number,
	replacements: readonly Replacement[] = []
): boolean {
	return findSplit(clips, seconds, replacements) !== null
}

/** Splits the clip containing `seconds` into two at that point; null where canSplitAt is false. */
export function splitClipAt(
	clips: Clip[],
	seconds: number,
	newId: () => string,
	replacements: readonly Replacement[] = []
): Clip[] | null {
	const split = findSplit(clips, seconds, replacements)
	if (!split) return null
	const { clipIndex, clip, rangeIndex, range } = split
	// Both halves keep the volume and mute; the fade in stays with the
	// first half, the fade out with the second.
	const audio = clip.audio
	const before: Clip = {
		id: newId(),
		ranges: [
			...clip.ranges.slice(0, rangeIndex),
			{ startSeconds: range.startSeconds, endSeconds: seconds }
		],
		...(audio && { audio: { ...audio, fadeOutSeconds: 0 } }),
		...(clip.speed !== undefined && { speed: clip.speed })
	}
	const after: Clip = {
		id: newId(),
		ranges: [
			{ startSeconds: seconds, endSeconds: range.endSeconds },
			...clip.ranges.slice(rangeIndex + 1)
		],
		...(audio && { audio: { ...audio, fadeInSeconds: 0 } }),
		...(clip.speed !== undefined && { speed: clip.speed })
	}
	return [...clips.slice(0, clipIndex), before, after, ...clips.slice(clipIndex + 1)]
}

/** Moves the clip at `from` to sit at `to`, shifting the clips between them. */
export function moveClip(clips: Clip[], from: number, to: number): Clip[] {
	const clip = clips[from]
	if (!clip || to < 0 || to >= clips.length || to === from) return clips
	const rest = clips.filter((_, index) => index !== from)
	return [...rest.slice(0, to), clip, ...rest.slice(to)]
}

/**
 * Joins clips `from` through `to` (inclusive, from < to) into one, keeping
 * the first one's id. Ranges that touch in the source become one again, so
 * merging what a split divided restores the original clip exactly.
 */
export function mergeClips(clips: Clip[], from: number, to: number): Clip[] {
	const first = clips[from]
	if (!first || from >= to || to >= clips.length) return clips
	const ranges: SourceRange[] = []
	for (const range of clips.slice(from, to + 1).flatMap((c) => c.ranges)) {
		const last = ranges.at(-1)
		if (last && Math.abs(last.endSeconds - range.startSeconds) < EPSILON_SECONDS) {
			ranges[ranges.length - 1] = { ...last, endSeconds: range.endSeconds }
		} else {
			ranges.push(range)
		}
	}
	// The merged clip keeps the first one's volume and mute and fade in,
	// and the last one's fade out.
	const last = clips[to]
	const fadeOutSeconds = last?.audio?.fadeOutSeconds ?? 0
	const audio =
		first.audio || fadeOutSeconds
			? { ...(first.audio ?? DEFAULT_CLIP_AUDIO), fadeOutSeconds }
			: undefined
	return [
		...clips.slice(0, from),
		{
			id: first.id,
			ranges,
			...(audio && !isDefaultAudio(audio) && { audio }),
			// The first clip's speed: the merged clip plays at one.
			...(first.speed !== undefined && { speed: first.speed })
		},
		...clips.slice(to + 1)
	]
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

/**
 * What part of a source range survives the trim and the cuts, in order. A
 * replacement plays where its whole span is inside this range and the
 * trim — then it wins over any cut inside the span — and nowhere else.
 */
function keptPieces<R extends Replacement>(
	range: SourceRange,
	{ trim, cuts }: Edit,
	replacements: readonly R[]
): Segment<R>[] {
	let start = Math.max(range.startSeconds, trim.startSeconds)
	const end = Math.min(range.endSeconds, trim.endSeconds)
	const active = replacements.filter(
		(r) => r.span.startSeconds >= start && r.span.endSeconds <= end
	)
	const removed = [...cuts, ...active.map((r) => r.span)]
	const pieces: Segment<R>[] = []
	for (const cut of removed.sort((a, b) => a.startSeconds - b.startSeconds)) {
		if (cut.endSeconds <= start || cut.startSeconds >= end) continue
		if (cut.startSeconds - start > EPSILON_SECONDS) {
			pieces.push({ startSeconds: start, endSeconds: cut.startSeconds })
		}
		start = Math.max(start, cut.endSeconds)
	}
	if (end - start > EPSILON_SECONDS) pieces.push({ startSeconds: start, endSeconds: end })
	for (const replacement of active) {
		const { startSeconds, endSeconds } = replacement.span
		const spanSeconds = endSeconds - startSeconds
		pieces.push({
			startSeconds,
			endSeconds: startSeconds + Math.min(replacement.takeSeconds, spanSeconds),
			voiceOver: { replacement, holdSeconds: Math.max(0, replacement.takeSeconds - spanSeconds) }
		})
	}
	return pieces.sort((a, b) => a.startSeconds - b.startSeconds)
}

/**
 * Everything that plays, in playback order: each clip's ranges, trimmed, cut
 * and re-recorded. A clip with its own volume or fades marks each of its
 * segments with them and where in the clip the segment falls.
 */
export function playableSegments<R extends Replacement>(
	clips: Clip[],
	edit: Edit,
	replacements: readonly R[] = []
): Segment<R>[] {
	return clips.flatMap((clip) => {
		const kept = clip.ranges.flatMap((range) => keptPieces(range, edit, replacements))
		const rate = clip.speed
		// A take always plays at 1×, its pitch and length as recorded, even if a
		// merge has put it in a sped clip.
		const pieces =
			rate === undefined || rate === 1
				? kept
				: kept.map((piece) => (piece.voiceOver ? piece : { ...piece, rate }))
		const audio = clip.audio
		if (!audio || isDefaultAudio(audio)) return pieces
		const clipSeconds = pieces.reduce((sum, piece) => sum + segmentSeconds(piece), 0)
		let offsetSeconds = 0
		return pieces.map((piece) => {
			const marked = { ...piece, audio: { ...audio, clipSeconds, offsetSeconds } }
			offsetSeconds += segmentSeconds(piece)
			return marked
		})
	})
}

/** How long a segment plays for, including any frame held under a longer take. */
export function segmentSeconds(segment: Segment): number {
	return (
		(segment.endSeconds - segment.startSeconds) / (segment.rate ?? 1) +
		(segment.voiceOver?.holdSeconds ?? 0)
	)
}

/** How long one clip plays for, after trim, cuts and replacements. */
export function clipPlayedSeconds(
	clip: Clip,
	edit: Edit,
	replacements: readonly Replacement[] = []
): number {
	return playableSegments([clip], edit, replacements).reduce((sum, s) => sum + segmentSeconds(s), 0)
}

/**
 * How far before a segment's start a time still counts as in it. A video
 * sought to a computed start reports it to the microsecond (sought to
 * 29.080000000000002, Chrome reports 29.08 for an MP4): read exactly, that is
 * before the segment, and playback sought back to its start, froze there, or
 * looped restarting a take.
 */
export const SEEK_TOLERANCE_SECONDS = 0.001

/** Whether a source time is in a segment, counting a hair before its start as in it. */
export function isInSegment(seconds: number, segment: SourceRange): boolean {
	return seconds >= segment.startSeconds - SEEK_TOLERANCE_SECONDS && seconds < segment.endSeconds
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
	const inside = segments.findIndex((s) => isInSegment(seconds, s))
	if (inside >= 0) return { index: inside, seconds }
	let next: { index: number; seconds: number } | null = null
	for (const [index, s] of segments.entries()) {
		if (s.startSeconds > seconds && (!next || s.startSeconds < next.seconds)) {
			next = { index, seconds: s.startSeconds }
		}
	}
	return next
}
