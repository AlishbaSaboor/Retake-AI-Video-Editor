import {
	editEdges,
	gapAfter,
	gapBefore,
	gapContaining,
	MAX_GAP_TRIM_SECONDS,
	quietRuns,
	type Gap
} from './audio-gaps'
import type { SourceRange } from '../model/sequence'
import type { Loudness } from './take-audio'
import type { TranscriptSegment } from './transcript'

// Where a re-recorded sentence replaces the original: from inside the real
// gap before its first word to inside the gap after its last word, so both
// joins land in quiet rather than on the transcriber's timestamps. A
// sentence that runs straight into the speech beside it has no such gap,
// and its splice is never guessed at.
//
// The transcriber often stretches a sentence's first or last word up to
// ~0.4 s into the pause beside it (measured on a real take), past where
// the filler search looks — so a measured pause that contains the reported
// edge counts too, after that search finds nothing.

export type SplicePlan =
	| {
			kind: 'splice'
			startSeconds: number
			endSeconds: number
			/** The sentence's own sound, between the two pauses: the span minus their quiet. */
			speech: { startSeconds: number; endSeconds: number }
			/** Joins the user set by listening, not found in pauses: not guaranteed clean. */
			byEar?: true
	  }
	| { kind: 'review'; reason: 'no_gap_before' | 'no_gap_after' }

/** Where (and whether) a replacement for one transcript sentence can be spliced in. */
export function planSentenceSplice(sentence: TranscriptSegment, loudness: Loudness): SplicePlan {
	const { startSeconds: start, endSeconds: end } = sentence
	const runs = quietRuns(loudness, start - 1, end + 1)
	const before = gapBefore(runs, start) ?? gapContaining(runs, start)
	if (!before) return { kind: 'review', reason: 'no_gap_before' }
	const after = gapAfter(runs, end) ?? gapContaining(runs, end)
	if (!after) return { kind: 'review', reason: 'no_gap_after' }
	return {
		kind: 'splice',
		...editEdges(before, after),
		speech: { startSeconds: before.endSeconds, endSeconds: after.startSeconds }
	}
}

// --- joins set by ear ---------------------------------------------------------
// For a sentence with no clean pause on a side, the user sets each join by
// listening, on a zoomed waveform. The take then replaces exactly what lies
// between the joins: there's no pause to keep either side of it, so the
// take is trimmed to its own speech. Nothing here promises a clean join.

/** How much either side of the sentence the by-ear editor shows and lets a join move into. */
export const JOIN_CONTEXT_SECONDS = 1
/** The closest the joins may come: anything shorter isn't a sentence. */
export const MIN_JOIN_SPAN_SECONDS = 0.2
/** Where a join with no pause beside it starts: the quietest moment this close to the transcriber's edge. */
const QUIET_SEARCH_SECONDS = 0.25

export type Joins = { startSeconds: number; endSeconds: number }

/**
 * How far the joins may go: within JOIN_CONTEXT_SECONDS of the sentence,
 * inside the stretch of the take the edit plays around it (its clip range,
 * trimmed), and clear of cuts and other re-recorded spans beside it. Those
 * inside the sentence don't limit it: a take wins over a cut in its span.
 */
export function joinBounds(
	sentence: SourceRange,
	playing: SourceRange,
	obstacles: SourceRange[]
): SourceRange {
	let low = Math.max(sentence.startSeconds - JOIN_CONTEXT_SECONDS, playing.startSeconds)
	let high = Math.min(sentence.endSeconds + JOIN_CONTEXT_SECONDS, playing.endSeconds)
	for (const obstacle of obstacles) {
		if (
			obstacle.startSeconds < sentence.startSeconds &&
			obstacle.endSeconds <= sentence.endSeconds
		) {
			low = Math.max(low, obstacle.endSeconds)
		}
		if (
			obstacle.endSeconds > sentence.endSeconds &&
			obstacle.startSeconds >= sentence.startSeconds
		) {
			high = Math.min(high, obstacle.startSeconds)
		}
	}
	return { startSeconds: low, endSeconds: high }
}

/** The middle of the quietest 10 ms window within QUIET_SEARCH_SECONDS of `seconds`, inside `bounds`. */
function quietestNear(loudness: Loudness, seconds: number, bounds: SourceRange): number {
	const { db, windowSeconds } = loudness
	const first = Math.ceil(
		Math.max(seconds - QUIET_SEARCH_SECONDS, bounds.startSeconds) / windowSeconds
	)
	const last = Math.floor(
		Math.min(seconds + QUIET_SEARCH_SECONDS, bounds.endSeconds) / windowSeconds
	)
	let best: number | null = null
	for (let w = first; w < last; w++) {
		const level = db[w] ?? Infinity
		const bestLevel = best === null ? Infinity : (db[best] ?? Infinity)
		const closer =
			best !== null &&
			Math.abs(w - seconds / windowSeconds) < Math.abs(best - seconds / windowSeconds)
		if (level < bestLevel || (level === bestLevel && closer)) best = w
	}
	return best === null ? seconds : (best + 0.5) * windowSeconds
}

/** Moves one join to `seconds`, inside `bounds` and never closer than MIN_JOIN_SPAN_SECONDS to the other. */
export function moveJoin(
	joins: Joins,
	edge: 'start' | 'end',
	seconds: number,
	bounds: SourceRange
): Joins {
	return edge === 'start'
		? {
				...joins,
				startSeconds: Math.min(
					Math.max(seconds, bounds.startSeconds),
					joins.endSeconds - MIN_JOIN_SPAN_SECONDS
				)
			}
		: {
				...joins,
				endSeconds: Math.max(
					Math.min(seconds, bounds.endSeconds),
					joins.startSeconds + MIN_JOIN_SPAN_SECONDS
				)
			}
}

/**
 * Where the joins start: in the pause on a side that has one, placed as an
 * automatic splice would be; otherwise at the quietest moment near the
 * transcriber's edge, the likeliest place between two words.
 */
export function initialJoins(
	sentence: SourceRange,
	loudness: Loudness,
	bounds: SourceRange
): Joins {
	const { startSeconds: start, endSeconds: end } = sentence
	const runs = quietRuns(loudness, start - 1, end + 1)
	const before: Gap | undefined = gapBefore(runs, start) ?? gapContaining(runs, start)
	const after: Gap | undefined = gapAfter(runs, end) ?? gapContaining(runs, end)
	const wanted = {
		startSeconds: before
			? Math.max(
					(before.startSeconds + before.endSeconds) / 2,
					before.endSeconds - MAX_GAP_TRIM_SECONDS
				)
			: quietestNear(loudness, start, bounds),
		endSeconds: after
			? Math.min(
					(after.startSeconds + after.endSeconds) / 2,
					after.startSeconds + MAX_GAP_TRIM_SECONDS
				)
			: quietestNear(loudness, end, bounds)
	}
	const withStart = moveJoin(
		{ startSeconds: bounds.startSeconds, endSeconds: bounds.endSeconds },
		'start',
		wanted.startSeconds,
		bounds
	)
	return moveJoin(withStart, 'end', wanted.endSeconds, bounds)
}

/** The splice a pair of by-ear joins makes: the take replaces exactly what's between them. */
export function byEarPlan(joins: Joins): Extract<SplicePlan, { kind: 'splice' }> {
	return { kind: 'splice', ...joins, speech: { ...joins }, byEar: true }
}

/** What each join's waveform shows: the sentence's edge with its context, inside the bounds. */
export function joinViews(sentence: SourceRange, bounds: SourceRange) {
	return {
		start: {
			startSeconds: bounds.startSeconds,
			endSeconds: Math.min(bounds.endSeconds, sentence.startSeconds + JOIN_CONTEXT_SECONDS)
		},
		end: {
			startSeconds: Math.max(bounds.startSeconds, sentence.endSeconds - JOIN_CONTEXT_SECONDS),
			endSeconds: bounds.endSeconds
		}
	}
}
