import type { Silence } from './take-audio'
import { moveTrimEdge, type TrimRange } from './timeline-scale'

// One-click clean-up: turns flagged silences and filler words into edits, using the same
// non-destructive model as manual trim. A silence touching an edge of the
// clip moves that trim edge (through moveTrimEdge, like dragging a handle);
// one in the middle becomes a cut — a source range playback skips. The file
// itself is never changed, so undo is just restoring the previous edit.
//
// Filler words arrive already placed: filler-cuts.ts only produces a cut
// for a filler bracketed by real gaps in the audio, inside those gaps. Here
// they're just clipped to the trim and merged with the silence cuts.

/** A source range that playback skips over. */
export type Cut = { startSeconds: number; endSeconds: number }

/** Everything that decides what plays: the trim range plus the cuts inside it. */
export type Edit = { trim: TrimRange; cuts: Cut[] }

/**
 * Kept at each edge of a removed silence, so the end of the speech before it
 * and the start of the speech after it are never touched.
 */
export const SILENCE_PADDING_SECONDS = 0.3

// A silence is "at" a trim edge within this much — detection works in 50 ms
// windows, so an edge silence can start a hair after the edge.
const EDGE_TOLERANCE_SECONDS = 0.1

/** How much of the source plays under an edit. */
export function keptSeconds({ trim, cuts }: Edit): number {
	const cutInside = cuts.reduce((total, cut) => {
		const start = Math.max(cut.startSeconds, trim.startSeconds)
		const end = Math.min(cut.endSeconds, trim.endSeconds)
		return total + Math.max(0, end - start)
	}, 0)
	return trim.endSeconds - trim.startSeconds - cutInside
}

/** Sorts cuts and merges any that overlap or touch. */
export function mergeCuts(cuts: Cut[]): Cut[] {
	const sorted = [...cuts].sort((a, b) => a.startSeconds - b.startSeconds)
	const merged: Cut[] = []
	for (const cut of sorted) {
		const last = merged.at(-1)
		if (last && cut.startSeconds <= last.endSeconds) {
			last.endSeconds = Math.max(last.endSeconds, cut.endSeconds)
		} else {
			merged.push({ ...cut })
		}
	}
	return merged
}

/** What clean-up removes: measured silences, and filler cuts placed in their gaps. */
export type Flagged = { silences: Silence[]; fillerCuts: Cut[] }

/**
 * The edit after removing every flagged item from `current`. Anything
 * outside the trimmed clip is ignored; nothing outside a silence or a
 * filler cut is ever removed.
 */
export function planCleanup(
	current: Edit,
	{ silences, fillerCuts }: Flagged,
	durationSeconds: number
): Edit {
	let trim = current.trim
	const cuts = [...current.cuts]
	const ordered = [...silences].sort((a, b) => a.startSeconds - b.startSeconds)
	for (const silence of ordered) {
		const start = Math.max(silence.startSeconds, trim.startSeconds)
		const end = Math.min(silence.endSeconds, trim.endSeconds)
		if (end - start <= 2 * SILENCE_PADDING_SECONDS) continue
		if (start <= trim.startSeconds + EDGE_TOLERANCE_SECONDS) {
			trim = moveTrimEdge(trim, 'start', end - SILENCE_PADDING_SECONDS, durationSeconds)
		} else if (end >= trim.endSeconds - EDGE_TOLERANCE_SECONDS) {
			trim = moveTrimEdge(trim, 'end', start + SILENCE_PADDING_SECONDS, durationSeconds)
		} else {
			cuts.push({
				startSeconds: start + SILENCE_PADDING_SECONDS,
				endSeconds: end - SILENCE_PADDING_SECONDS
			})
		}
	}
	for (const cut of fillerCuts) {
		const start = Math.max(cut.startSeconds, trim.startSeconds)
		const end = Math.min(cut.endSeconds, trim.endSeconds)
		if (end > start) cuts.push({ startSeconds: start, endSeconds: end })
	}
	return { trim, cuts: mergeCuts(cuts) }
}

/** Where playback continues from: past the end of any cut `seconds` falls in. */
export function skipCuts(seconds: number, cuts: Cut[]): number {
	const inside = cuts.find((cut) => seconds >= cut.startSeconds && seconds < cut.endSeconds)
	return inside ? inside.endSeconds : seconds
}
