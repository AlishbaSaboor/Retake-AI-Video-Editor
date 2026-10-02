import type { FillerWord } from './filler-words'
import type { Loudness } from './take-audio'

// Turns a filler the transcriber found into a cut that is safe to make, or
// into "leave it for review". The transcriber's word timing is close but
// not cut-precise (25-105 ms off on an exact-timing benchmark, against
// fillers that last 170-315 ms), so the cut is placed by the audio itself:
// a filler is only removed when a measurable gap sits on BOTH sides of it,
// and the cut never leaves those gaps. A filler that runs straight into a
// word has no such gap and is never guessed at.

export type FillerPlan =
	| { kind: 'cut'; filler: FillerWord; startSeconds: number; endSeconds: number }
	| { kind: 'review'; filler: FillerWord; reason: 'no_gap_before' | 'no_gap_after' | 'unclear' }

/** Shortest quiet stretch that counts as a gap between words. */
const MIN_GAP_SECONDS = 0.04
// Where to look for the gaps, relative to the transcriber's edges: out past
// its worst measured error, and a little inward in case it ran long.
const SEARCH_OUT_SECONDS = 0.15
const SEARCH_IN_SECONDS = 0.1
// A filler's sound between the two gaps must be this long — shorter is a
// click or breath, longer means the gaps bracket more than one word.
const MIN_FILLER_SECONDS = 0.06
const MAX_FILLER_SECONDS = 1.2
// At least this much of the transcriber's span must be inside the sound the
// gaps bracket, or the gaps belong to some other word.
const MIN_OVERLAP = 0.5
/** The most of a gap a cut may take beyond the filler's own sound. */
const MAX_GAP_TRIM_SECONDS = 0.08

type Run = { startSeconds: number; endSeconds: number }

/** Every quiet run of at least MIN_GAP_SECONDS within [from, to], at full extent. */
function quietRuns(loudness: Loudness, fromSeconds: number, toSeconds: number): Run[] {
	const { db, windowSeconds, gapThresholdDb } = loudness
	const first = Math.max(0, Math.floor(fromSeconds / windowSeconds))
	const last = Math.min(db.length, Math.ceil(toSeconds / windowSeconds))
	const runs: Run[] = []
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

const closest = (runs: Run[], edge: (run: Run) => number, to: number) =>
	[...runs].sort((a, b) => Math.abs(edge(a) - to) - Math.abs(edge(b) - to))[0]

/** Where (and whether) to cut one filler word. */
export function planFillerCut(filler: FillerWord, loudness: Loudness): FillerPlan {
	const { startSeconds: start, endSeconds: end } = filler
	const runs = quietRuns(loudness, start - 1, end + 1)

	const before = closest(
		runs.filter(
			(r) => r.endSeconds >= start - SEARCH_OUT_SECONDS && r.endSeconds <= start + SEARCH_IN_SECONDS
		),
		(r) => r.endSeconds,
		start
	)
	if (!before) return { kind: 'review', filler, reason: 'no_gap_before' }
	const after = closest(
		runs.filter(
			(r) => r.startSeconds >= end - SEARCH_IN_SECONDS && r.startSeconds <= end + SEARCH_OUT_SECONDS
		),
		(r) => r.startSeconds,
		end
	)
	if (!after) return { kind: 'review', filler, reason: 'no_gap_after' }

	const soundStart = before.endSeconds
	const soundEnd = after.startSeconds
	const soundLength = soundEnd - soundStart
	const overlap = Math.min(end, soundEnd) - Math.max(start, soundStart)
	const splitByAnotherGap = runs.some((r) => r.startSeconds > soundStart && r.endSeconds < soundEnd)
	if (
		soundLength < MIN_FILLER_SECONDS ||
		soundLength > MAX_FILLER_SECONDS ||
		overlap < MIN_OVERLAP * (end - start) ||
		splitByAnotherGap
	) {
		return { kind: 'review', filler, reason: 'unclear' }
	}

	return {
		kind: 'cut',
		filler,
		startSeconds: Math.max(
			(before.startSeconds + before.endSeconds) / 2,
			soundStart - MAX_GAP_TRIM_SECONDS
		),
		endSeconds: Math.min(
			(after.startSeconds + after.endSeconds) / 2,
			soundEnd + MAX_GAP_TRIM_SECONDS
		)
	}
}
