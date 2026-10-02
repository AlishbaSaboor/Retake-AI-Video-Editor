import type { Loudness } from './take-audio'

// The quiet gaps between words, found in the audio itself. Shared by filler
// cuts and sentence splices: the transcriber's word timing is close but not
// cut-precise (25-105 ms off on an exact-timing benchmark), so an edit edge
// is only placed inside a real gap next to the word, never at the timestamp.

export type Gap = { startSeconds: number; endSeconds: number }

/** Shortest quiet stretch that counts as a gap between words. */
const MIN_GAP_SECONDS = 0.04
// Where to look for a word's gap, relative to the transcriber's edge: out
// past its worst measured error, and a little inward in case it ran long.
const SEARCH_OUT_SECONDS = 0.15
const SEARCH_IN_SECONDS = 0.1
/** The most of a gap an edit may take beyond the speech it removes. */
export const MAX_GAP_TRIM_SECONDS = 0.08

/** Every quiet run of at least MIN_GAP_SECONDS within [from, to], at full extent. */
export function quietRuns(loudness: Loudness, fromSeconds: number, toSeconds: number): Gap[] {
	const { db, windowSeconds, gapThresholdDb } = loudness
	const first = Math.max(0, Math.floor(fromSeconds / windowSeconds))
	const last = Math.min(db.length, Math.ceil(toSeconds / windowSeconds))
	const runs: Gap[] = []
	let runStart: number | null = null
	for (let w = first; w <= last; w++) {
		const quiet = w < last && (db[w] ?? Infinity) < gapThresholdDb
		if (quiet && runStart === null) runStart = w
		if (!quiet && runStart !== null) {
			if ((w - runStart) * windowSeconds >= MIN_GAP_SECONDS) {
				runs.push({ startSeconds: runStart * windowSeconds, endSeconds: w * windowSeconds })
			}
			runStart = null
		}
	}
	return runs
}

const closest = (runs: Gap[], edge: (run: Gap) => number, to: number) =>
	[...runs].sort((a, b) => Math.abs(edge(a) - to) - Math.abs(edge(b) - to))[0]

/** The gap just before a word the transcriber says starts at `seconds`. */
export function gapBefore(runs: Gap[], seconds: number): Gap | undefined {
	return closest(
		runs.filter(
			(r) =>
				r.endSeconds >= seconds - SEARCH_OUT_SECONDS && r.endSeconds <= seconds + SEARCH_IN_SECONDS
		),
		(r) => r.endSeconds,
		seconds
	)
}

/** The gap just after a word the transcriber says ends at `seconds`. */
export function gapAfter(runs: Gap[], seconds: number): Gap | undefined {
	return closest(
		runs.filter(
			(r) =>
				r.startSeconds >= seconds - SEARCH_IN_SECONDS &&
				r.startSeconds <= seconds + SEARCH_OUT_SECONDS
		),
		(r) => r.startSeconds,
		seconds
	)
}

/**
 * Where an edit removing the speech between two gaps should start and end:
 * inside each gap, at its middle or MAX_GAP_TRIM_SECONDS from the speech,
 * whichever is closer to the speech — so a long pause is only nibbled.
 */
export function editEdges(before: Gap, after: Gap): Gap {
	return {
		startSeconds: Math.max(
			(before.startSeconds + before.endSeconds) / 2,
			before.endSeconds - MAX_GAP_TRIM_SECONDS
		),
		endSeconds: Math.min(
			(after.startSeconds + after.endSeconds) / 2,
			after.startSeconds + MAX_GAP_TRIM_SECONDS
		)
	}
}
