import { editEdges, gapAfter, gapBefore, quietRuns } from './audio-gaps'
import type { FillerWord } from './filler-words'
import type { Loudness } from './take-audio'
import { moveTrimEdge, type TrimEdge, type TrimRange } from './timeline-scale'

// Turns a filler the transcriber found into a cut that is safe to make, or
// into "leave it for review". The transcriber's timing isn't cut-precise
// against fillers that last 170-315 ms, so the cut is placed by the audio
// itself (audio-gaps.ts): a filler is only removed when a measurable gap
// sits on BOTH sides of it, and the cut never leaves those gaps. A filler
// that runs straight into a word has no such gap and is never guessed at.

export type FillerPlan =
	| { kind: 'cut'; filler: FillerWord; startSeconds: number; endSeconds: number }
	| { kind: 'review'; filler: FillerWord; reason: 'no_gap_before' | 'no_gap_after' | 'unclear' }

// A filler's sound between the two gaps must be this long — shorter is a
// click or breath, longer means the gaps bracket more than one word.
const MIN_FILLER_SECONDS = 0.06
const MAX_FILLER_SECONDS = 1.2
// At least this much of the transcriber's span must be inside the sound the
// gaps bracket, or the gaps belong to some other word.
const MIN_OVERLAP = 0.5

/** Where (and whether) to cut one filler word. */
export function planFillerCut(filler: FillerWord, loudness: Loudness): FillerPlan {
	const { startSeconds: start, endSeconds: end } = filler
	const runs = quietRuns(loudness, start - 1, end + 1)

	const before = gapBefore(runs, start)
	if (!before) return { kind: 'review', filler, reason: 'no_gap_before' }
	const after = gapAfter(runs, end)
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

	return { kind: 'cut', filler, ...editEdges(before, after) }
}

// --- the manual cut editor ---------------------------------------------------
// For fillers the gaps couldn't place (and any filler the user wants to
// adjust): a zoomed window around the filler with two handles, set by ear.

/** How much of the take either side of the filler the cut editor shows. */
const EDITOR_CONTEXT_SECONDS = 1

/** The span the cut editor zooms to: the filler plus context, inside the clip. */
export function cutEditorWindow(filler: FillerWord, durationSeconds: number): TrimRange {
	return {
		startSeconds: Math.max(0, filler.startSeconds - EDITOR_CONTEXT_SECONDS),
		endSeconds: Math.min(durationSeconds, filler.endSeconds + EDITOR_CONTEXT_SECONDS)
	}
}

/** Where the handles start: the gap-placed cut if there is one, else the transcriber's span. */
export function initialCutRange(plan: FillerPlan): TrimRange {
	return plan.kind === 'cut'
		? { startSeconds: plan.startSeconds, endSeconds: plan.endSeconds }
		: { startSeconds: plan.filler.startSeconds, endSeconds: plan.filler.endSeconds }
}

/** Moves one edge of the manual cut, like a trim handle, kept inside the editor's window. */
export function moveCutEdge(
	range: TrimRange,
	edge: TrimEdge,
	seconds: number,
	window: TrimRange
): TrimRange {
	const inWindow = Math.min(Math.max(seconds, window.startSeconds), window.endSeconds)
	return moveTrimEdge(range, edge, inWindow, window.endSeconds)
}
