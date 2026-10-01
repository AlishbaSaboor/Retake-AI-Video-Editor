import type { Silence } from './take-audio'
import { moveTrimEdge, type TrimRange } from './timeline-scale'

// One-click clean-up: turns flagged silences into edits, using the same
// non-destructive model as manual trim. A silence touching an edge of the
// clip moves that trim edge (through moveTrimEdge, like dragging a handle);
// one in the middle becomes a cut — a source range playback skips. The file
// itself is never changed, so undo is just restoring the previous edit.
//
// Filler words aren't cut: their times are estimated from transcript text,
// typically within a second, and an "um" lasts a fraction of that — a cut
// there would clip the words around it. Silences are measured from the
// audio, so their edges are exact.

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

/**
 * The edit after removing every silence from `current`. Silences outside
 * the trimmed clip are ignored; nothing outside a silence is ever removed.
 */
export function planCleanup(current: Edit, silences: Silence[], durationSeconds: number): Edit {
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
	return { trim, cuts: mergeCuts(cuts) }
}

/** Where playback continues from: past the end of any cut `seconds` falls in. */
export function skipCuts(seconds: number, cuts: Cut[]): number {
	const inside = cuts.find((cut) => seconds >= cut.startSeconds && seconds < cut.endSeconds)
	return inside ? inside.endSeconds : seconds
}
