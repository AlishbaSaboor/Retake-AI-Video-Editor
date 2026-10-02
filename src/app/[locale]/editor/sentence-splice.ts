import { editEdges, gapAfter, gapBefore, gapContaining, quietRuns } from './audio-gaps'
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
	| { kind: 'splice'; startSeconds: number; endSeconds: number }
	| { kind: 'review'; reason: 'no_gap_before' | 'no_gap_after' }

/** Where (and whether) a replacement for one transcript sentence can be spliced in. */
export function planSentenceSplice(sentence: TranscriptSegment, loudness: Loudness): SplicePlan {
	const { startSeconds: start, endSeconds: end } = sentence
	const runs = quietRuns(loudness, start - 1, end + 1)
	const before = gapBefore(runs, start) ?? gapContaining(runs, start)
	if (!before) return { kind: 'review', reason: 'no_gap_before' }
	const after = gapAfter(runs, end) ?? gapContaining(runs, end)
	if (!after) return { kind: 'review', reason: 'no_gap_after' }
	return { kind: 'splice', ...editEdges(before, after) }
}
