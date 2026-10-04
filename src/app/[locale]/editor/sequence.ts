import type { Edit } from './cleanup'
import { DEFAULT_CLIP_AUDIO, isDefaultAudio, type ClipAudio, type SegmentAudio } from './clip-audio'
import { isNeutral, type ColorGrade } from './color-grade'
import {
	MIN_TRANSITION_SECONDS,
	transitionLimit,
	type Join,
	type SegmentTransition,
	type Transition
} from './transitions'

// The take as an ordered sequence of clips. A clip is one or more ranges of
// the source file, played in order; clips are played in sequence order.
// Splitting, reordering and merging only arrange the take. Deleting a clip
// leaves its part of the source unplayed, like a cut; duplicating one plays
// its part twice, so a source time can be in more than one clip — what
// plays is tracked by segment, never inferred from the time alone.
// Trim and cuts still decide what's removed, on top of this.

export type SourceRange = { startSeconds: number; endSeconds: number }
/**
 * `audio` is the clip's volume, mute and fades; `speed` how fast it really
 * plays (0.25 to 4, pitch kept); `transition` the fade or dissolve into it
 * from the clip before (transitions.ts); `color` its own color adjustments,
 * on top of the whole video's (color-grade.ts). Absent means as recorded.
 */
export type Clip = {
	id: string
	ranges: SourceRange[]
	audio?: ClipAudio
	speed?: number
	transition?: Transition
	color?: ColorGrade
	/** Its sound was taken out into the Audio lane (audio-lane.ts): the clip itself is silent. */
	soundInLane?: true
	/** Which video its ranges are of: an added one's id (sources.ts), absent for the main video. */
	source?: string
}

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
		...(speed !== undefined && speed !== 1 && { speed }),
		...(clip.transition && { transition: clip.transition }),
		...(clip.color && !isNeutral(clip.color) && { color: clip.color }),
		...(clip.soundInLane && { soundInLane: clip.soundInLane }),
		...(clip.source && { source: clip.source })
	}
}

/** A clip with its own color adjustments set, or taken off when neutral. */
export function withClipColor(clip: Clip, color: ColorGrade): Clip {
	const next: Clip = { ...clip }
	if (isNeutral(color)) delete next.color
	else next.color = color
	return next
}

/** Whether a re-recorded take plays inside the clip: its speed then can't change. */
export function clipHasTake(clip: Clip, replacements: readonly Replacement[]): boolean {
	// Re-recorded takes are the main video's: its transcript's sentences.
	if (clip.source) return false
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
	/** The fade or dissolve into it from the segment before: only on a clip's first segment. */
	transition?: SegmentTransition
	/** Its clip's own color adjustments (the whole video's go on under them); absent when none. */
	color?: ColorGrade
	/** Its clip's video: an added one's id, absent for the main video. */
	source?: string
}

/** Each added video's trim and cuts, by id; the main video's are the `edit` passed alongside. */
export type SourceEdits = Readonly<Record<string, Edit>>

/** An added video with no edit of its own plays whole. */
const WHOLE: Edit = { trim: { startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY }, cuts: [] }

/** Whether two clips or segments are of the same video. */
export function sameSource(a: { source?: string }, b: { source?: string }): boolean {
	return (a.source ?? '') === (b.source ?? '')
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
function findSplit(
	clips: Clip[],
	seconds: number,
	replacements: readonly Replacement[],
	preferred: number | null
) {
	// A time is in one video: the playing clip's (the main video's when none).
	const source = { source: preferred === null ? undefined : clips[preferred]?.source }
	if (
		!source.source &&
		replacements.some((r) => seconds > r.span.startSeconds && seconds < r.span.endSeconds)
	) {
		return null
	}
	// The clip playing first: with a duplicate, the same time is in two clips.
	const order = [...clips.keys()].sort((a, b) => Number(b === preferred) - Number(a === preferred))
	for (const clipIndex of order) {
		const clip = clips[clipIndex]
		if (!clip || !sameSource(clip, source)) continue
		const rangeIndex = clip.ranges.findIndex(
			(r) =>
				seconds - r.startSeconds >= MIN_CLIP_SECONDS && r.endSeconds - seconds >= MIN_CLIP_SECONDS
		)
		const range = clip.ranges[rangeIndex]
		if (range) return { clipIndex, clip, rangeIndex, range }
	}
	return null
}

/**
 * Whether a split at `seconds` would leave at least MIN_CLIP_SECONDS on both
 * sides. `preferred` is the clip playing, tried first.
 */
export function canSplitAt(
	clips: Clip[],
	seconds: number,
	replacements: readonly Replacement[] = [],
	preferred: number | null = null
): boolean {
	return findSplit(clips, seconds, replacements, preferred) !== null
}

/**
 * Splits the clip containing `seconds` (`preferred` first) into two at that
 * point; null where canSplitAt is false. The first half keeps the
 * transition into the clip; the clip after keeps its own.
 */
export function splitClipAt(
	clips: Clip[],
	seconds: number,
	newId: () => string,
	replacements: readonly Replacement[] = [],
	preferred: number | null = null
): Clip[] | null {
	const split = findSplit(clips, seconds, replacements, preferred)
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
		...(clip.speed !== undefined && { speed: clip.speed }),
		...(clip.transition && { transition: clip.transition }),
		...(clip.color && { color: clip.color }),
		...(clip.soundInLane && { soundInLane: clip.soundInLane }),
		...(clip.source && { source: clip.source })
	}
	const after: Clip = {
		id: newId(),
		ranges: [
			{ startSeconds: seconds, endSeconds: range.endSeconds },
			...clip.ranges.slice(rangeIndex + 1)
		],
		...(audio && { audio: { ...audio, fadeInSeconds: 0 } }),
		...(clip.speed !== undefined && { speed: clip.speed }),
		...(clip.color && { color: clip.color }),
		...(clip.soundInLane && { soundInLane: clip.soundInLane }),
		...(clip.source && { source: clip.source })
	}
	return [
		...clips.slice(0, clipIndex),
		before,
		after,
		...followedBy(clips.slice(clipIndex + 1), clip.id, after.id)
	]
}

/** `clips`, with a transition that followed clip `from` now following clip `to`: the same join. */
function followedBy(clips: Clip[], from: string, to: string): Clip[] {
	return clips.map((clip) =>
		clip.transition?.after === from
			? { ...clip, transition: { ...clip.transition, after: to } }
			: clip
	)
}

/**
 * Removes clips `from` through `to` (inclusive): what they played no longer
 * plays. Never all of them; the transitions at their joins go with them.
 */
export function deleteClips(clips: Clip[], from: number, to: number = from): Clip[] {
	if (from < 0 || to < from || to >= clips.length || to - from + 1 >= clips.length) return clips
	return [...clips.slice(0, from), ...clips.slice(to + 1)]
}

/**
 * Copies clips `from` through `to` (inclusive) and puts the copies right
 * after them, with the same sound, speed and transitions between them; the
 * first copy starts with a plain cut, and the clip that followed the
 * originals follows the copies, its transition kept.
 */
export function duplicateClips(
	clips: Clip[],
	from: number,
	to: number,
	newId: () => string
): Clip[] {
	const originals = clips.slice(from, to + 1)
	if (from < 0 || to < from || to >= clips.length) return clips
	const ids = new Map(originals.map((clip) => [clip.id, newId()]))
	const copies = originals.map((clip, index) => {
		const { transition, ...rest } = clip
		const after = transition && ids.get(transition.after)
		return {
			...rest,
			id: ids.get(clip.id) ?? newId(),
			...(index > 0 && transition && after && { transition: { ...transition, after } })
		}
	})
	const last = originals.at(-1)
	const copyOfLast = copies.at(-1)
	const rest = clips.slice(to + 1)
	return [
		...clips.slice(0, to + 1),
		...copies,
		...(last && copyOfLast ? followedBy(rest, last.id, copyOfLast.id) : rest)
	]
}

/** Sets or removes (null) the transition into clip `index` from the clip before it. */
export function setTransition(
	clips: Clip[],
	index: number,
	transition: Omit<Transition, 'after'> | null
): Clip[] {
	const before = clips[index - 1]
	const clip = clips[index]
	if (!before || !clip) return clips
	const next: Clip = { ...clip }
	if (transition) next.transition = { ...transition, after: before.id }
	else delete next.transition
	return clips.map((c, i) => (i === index ? next : c))
}

/** The transition into clip `index` that applies now: one set while the same clip is before it. */
export function transitionInto(clips: Clip[], index: number): Transition | null {
	const transition = clips[index]?.transition
	return transition && transition.after === clips[index - 1]?.id ? transition : null
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
	// One clip is of one video.
	if (!clips.slice(from, to + 1).every((clip) => sameSource(clip, first))) return clips
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
			...(first.speed !== undefined && { speed: first.speed }),
			...(first.transition && { transition: first.transition }),
			// The first clip's colors: the merged clip has one look.
			...(first.color && { color: first.color }),
			...(first.soundInLane && { soundInLane: first.soundInLane }),
			...(first.source && { source: first.source })
		},
		...(last ? followedBy(clips.slice(to + 1), last.id, first.id) : clips.slice(to + 1))
	]
}

/**
 * Which clip a source time belongs to: the one with a range containing it,
 * or — at the very end of a range, where playback stops — the one it ends.
 */
export function clipIndexAt(clips: Clip[], seconds: number, source?: string): number {
	const video = { source }
	const containing = clips.findIndex(
		(c) =>
			sameSource(c, video) &&
			c.ranges.some((r) => seconds >= r.startSeconds && seconds < r.endSeconds)
	)
	if (containing >= 0) return containing
	return clips.findIndex(
		(c) =>
			sameSource(c, video) &&
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
	replacements: readonly R[] = [],
	sourceEdits: SourceEdits = {}
): Segment<R>[] {
	const byClip = clipSegments(clips, edit, replacements, sourceEdits)
	// The transition into each clip, as long as the picture either side allows.
	for (const [index, segments] of byClip.entries()) {
		const transition = transitionInto(clips, index)
		const before = byClip[index - 1]?.at(-1)
		const first = segments[0]
		if (!transition || !before || !first) continue
		const limit =
			before.voiceOver || first.voiceOver
				? 0
				: transitionLimit(segmentSeconds(before), segmentSeconds(first))
		const seconds = Math.min(transition.seconds, limit)
		if (seconds >= MIN_TRANSITION_SECONDS) {
			segments[0] = { ...first, transition: { kind: transition.kind, seconds } }
		}
	}
	return byClip.flat()
}

/** Which clip each of playableSegments' segments belongs to, by index. */
export function segmentClips(
	clips: Clip[],
	edit: Edit,
	replacements: readonly Replacement[] = [],
	sourceEdits: SourceEdits = {}
): number[] {
	return clipSegments(clips, edit, replacements, sourceEdits).flatMap((segments, index) =>
		segments.map(() => index)
	)
}

/**
 * How long the transition into clip `index` could be at most: half the
 * picture either side of the join, none against a re-recorded take or a
 * clip that doesn't play. Null when there's no clip before it.
 */
export function joinLimit(
	clips: Clip[],
	index: number,
	edit: Edit,
	replacements: readonly Replacement[] = [],
	sourceEdits: SourceEdits = {}
): number | null {
	if (index < 1 || index >= clips.length) return null
	const byClip = clipSegments(clips, edit, replacements, sourceEdits)
	const before = byClip[index - 1]?.at(-1)
	const first = byClip[index]?.[0]
	if (!before || !first || before.voiceOver || first.voiceOver) return 0
	return transitionLimit(segmentSeconds(before), segmentSeconds(first))
}

/** Each clip's segments, as playableSegments lays them out, before transitions. */
function clipSegments<R extends Replacement>(
	clips: Clip[],
	edit: Edit,
	replacements: readonly R[],
	sourceEdits: SourceEdits
): Segment<R>[][] {
	return clips.map((clip) => {
		// An added video's clip: its own trim and cuts, and no takes (they're the main video's).
		const own = clip.source ? (sourceEdits[clip.source] ?? WHOLE) : edit
		const kept = clip.ranges.flatMap((range) =>
			keptPieces(range, own, clip.source ? [] : replacements)
		)
		const rate = clip.speed
		// A take always plays at 1×, its pitch and length as recorded, even if a
		// merge has put it in a sped clip.
		const color = clip.color && !isNeutral(clip.color) ? clip.color : undefined
		const pieces = kept.map((piece) => ({
			...piece,
			...(rate !== undefined && rate !== 1 && !piece.voiceOver && { rate }),
			...(color && { color }),
			...(clip.source && { source: clip.source })
		}))
		// A clip whose sound is in the Audio lane plays silent, through the same mute.
		const audio = clip.soundInLane
			? { ...(clip.audio ?? DEFAULT_CLIP_AUDIO), muted: true }
			: clip.audio
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

/** How much of a segment's start plays over the end of the one before it: a dissolve. */
export function overlapSeconds(segment: Segment): number {
	return segment.transition?.kind === 'dissolve' ? segment.transition.seconds : 0
}

/** Where each segment starts in the edited video: those before laid end to end, less the dissolves. */
export function editedStarts(segments: Segment[]): number[] {
	const starts: number[] = []
	let at = 0
	for (const segment of segments) {
		at -= overlapSeconds(segment)
		starts.push(at)
		at += segmentSeconds(segment)
	}
	return starts
}

/** How long the edited video plays for. */
export function editedLength(segments: Segment[]): number {
	return segments.reduce((sum, s) => sum + segmentSeconds(s) - overlapSeconds(s), 0)
}

/** The transitions in the edited video, each where the segment it leads into starts. */
export function joinsOf(segments: Segment[]): Join[] {
	const starts = editedStarts(segments)
	return segments.flatMap((segment, index) =>
		segment.transition ? [{ ...segment.transition, index, at: starts[index] ?? 0 }] : []
	)
}

/** How long one clip plays for, after trim, cuts and replacements. */
export function clipPlayedSeconds(
	clip: Clip,
	edit: Edit,
	replacements: readonly Replacement[] = [],
	sourceEdits: SourceEdits = {}
): number {
	return playableSegments([clip], edit, replacements, sourceEdits).reduce(
		(sum, s) => sum + segmentSeconds(s),
		0
	)
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
	segments: Array<SourceRange & { source?: string }>,
	source?: string
): { index: number; seconds: number } | null {
	// A time is in one video: `source`'s (the main video's when absent).
	const video = { source }
	const inside = segments.findIndex((s) => sameSource(s, video) && isInSegment(seconds, s))
	if (inside >= 0) return { index: inside, seconds }
	let next: { index: number; seconds: number } | null = null
	for (const [index, s] of segments.entries()) {
		if (!sameSource(s, video)) continue
		if (s.startSeconds > seconds && (!next || s.startSeconds < next.seconds)) {
			next = { index, seconds: s.startSeconds }
		}
	}
	return next
}
