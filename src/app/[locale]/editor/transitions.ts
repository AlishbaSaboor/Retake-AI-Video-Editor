// Transitions between adjacent clips. A fade goes through black: the clip
// before fades its picture and sound out over the first half, the clip
// after fades in over the second, and the edit keeps its length. A
// dissolve overlaps the two clips by its length: the clip after starts
// while the one before is still playing, its picture blending in and the
// sounds crossfading, so the edit gets shorter by that much.
//
// A transition belongs to the join into a clip, and is stored on that clip
// with the id of the clip it follows: it applies only while that clip is
// still the one before it, so moving or deleting a clip drops the
// transitions at its joins without any bookkeeping. Its length is in the
// edited video's seconds, whatever the clips' speeds.

export const TRANSITION_KINDS = ['fade', 'dissolve', 'slide'] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

/**
 * Whether the clips overlap through it, the one after starting while the
 * one before still plays: a dissolve (blending in) and a slide (coming in
 * from the right, over it). A fade goes through black and keeps the length.
 */
export function overlapsClips(kind: TransitionKind): boolean {
	return kind !== 'fade'
}

/** How far a slide's incoming clip still has to come, as a fraction of the frame's width: easing to rest. */
export function slideOffset(progress: number): number {
	const p = Math.min(1, Math.max(0, progress))
	return (1 - p) ** 3
}

/** The join into a clip from the clip `after` names. */
export type Transition = { kind: TransitionKind; seconds: number; after: string }

/** What a segment carries: the transition into it, at the length it really plays. */
export type SegmentTransition = { kind: TransitionKind; seconds: number }

export const MIN_TRANSITION_SECONDS = 0.1
export const MAX_TRANSITION_SECONDS = 3
export const DEFAULT_TRANSITION_SECONDS = 1

/**
 * The longest a transition can be between two pieces of picture that play
 * `before` and `after` seconds: half of each, so one at each end of a clip
 * never meet. (None at all against a re-recorded take, whose sound and
 * length are its own: the caller passes 0 for it.) Below
 * MIN_TRANSITION_SECONDS it doesn't apply.
 */
export function transitionLimit(beforeSeconds: number, afterSeconds: number): number {
	return Math.min(MAX_TRANSITION_SECONDS, beforeSeconds / 2, afterSeconds / 2)
}

/** A transition in the edited video: into segment `index`, which starts at `at`. */
export type Join = { kind: TransitionKind; seconds: number; index: number; at: number }

/**
 * How much of the picture and sound comes through the fades at edited time
 * `seconds`: 1 away from them, 0 at the black between two clips.
 */
export function fadeLevelAt(joins: Join[], seconds: number): number {
	let level = 1
	for (const join of joins) {
		if (join.kind !== 'fade') continue
		const half = join.seconds / 2
		const from = Math.abs(seconds - join.at)
		if (from < half) level = Math.min(level, from / half)
	}
	return level
}

/** The dissolve or slide under way at edited time `seconds`, and how far through it is (0 to 1). */
export function dissolveAt(
	joins: Join[],
	seconds: number
): { join: Join; progress: number } | null {
	const join = joins.find(
		(j) => overlapsClips(j.kind) && seconds >= j.at && seconds < j.at + j.seconds
	)
	return join ? { join, progress: (seconds - join.at) / join.seconds } : null
}

/**
 * The two clips' sound levels through a dissolve: equal power, so two
 * unrelated sounds keep their loudness through the middle instead of dipping.
 */
export function crossfadeGains(progress: number): { out: number; in: number } {
	const p = Math.min(1, Math.max(0, progress))
	return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) }
}

/** A typed or entered transition length, kept to what's allowed. */
export function clampTransitionSeconds(seconds: number): number {
	return Math.min(MAX_TRANSITION_SECONDS, Math.max(MIN_TRANSITION_SECONDS, seconds))
}

/**
 * A segment's sound level from the transitions at edited time `seconds`:
 * through a fade, and rising (into segment `index`) or falling (out of it,
 * into the next) through a dissolve.
 */
export function transitionGainAt(joins: Join[], index: number, seconds: number): number {
	let gain = fadeLevelAt(joins, seconds)
	for (const join of joins) {
		if (!overlapsClips(join.kind) || seconds < join.at || seconds >= join.at + join.seconds) {
			continue
		}
		const gains = crossfadeGains((seconds - join.at) / join.seconds)
		if (join.index === index) gain *= gains.in
		else if (join.index === index + 1) gain *= gains.out
	}
	return gain
}

/** Steps a crossfade's curve is ramped in: within ~1% of equal power. */
const CURVE_STEPS = 16

type GainSchedule = Pick<AudioParam, 'setValueAtTime' | 'linearRampToValueAtTime'>

/**
 * Schedules segment `index`'s transition levels on `param`, for the edited
 * video's `from` to `to` seconds, starting at audio time `at`: flat away
 * from the transitions, straight ramps through a fade, and a crossfade's
 * curve in short ramps.
 */
export function scheduleTransitionGain(
	param: GainSchedule,
	joins: Join[],
	index: number,
	at: number,
	from: number,
	to: number
) {
	const level = (seconds: number) => transitionGainAt(joins, index, seconds)
	const when = (seconds: number) => at + seconds - from
	const corners = joins.flatMap((join) =>
		join.kind === 'fade'
			? [join.at - join.seconds / 2, join.at, join.at + join.seconds / 2]
			: [join.at, join.at + join.seconds]
	)
	const points = [...new Set([from, to, ...corners.filter((c) => c > from && c < to)])].sort(
		(a, b) => a - b
	)
	param.setValueAtTime(level(from), at)
	for (const [i, end] of points.entries()) {
		const start = points[i - 1]
		if (start === undefined) continue
		const curved = dissolveAt(joins, (start + end) / 2) !== null
		const steps = curved ? CURVE_STEPS : 1
		for (let step = 1; step <= steps; step++) {
			const seconds = start + ((end - start) * step) / steps
			// Just inside the end: at the end itself the next transition's level applies.
			const value = step === steps ? level(end - 1e-9) : level(seconds)
			param.linearRampToValueAtTime(value, when(seconds))
		}
	}
}
