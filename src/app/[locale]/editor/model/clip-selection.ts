import type { Clip } from './sequence'

/**
 * Selection is a run from an anchor clip to a focus clip, kept by id so it
 * survives a reorder or split elsewhere — and always contiguous, so whatever
 * is selected can be merged.
 */
export type ClipSelection = { anchorId: string; focusId: string }

/** The selected run, as clip indexes; null when nothing (still there) is selected. */
export function selectedRun(clips: readonly Clip[], selection: ClipSelection | null) {
	const anchor = clips.findIndex((c) => c.id === selection?.anchorId)
	const focus = clips.findIndex((c) => c.id === selection?.focusId)
	return anchor >= 0 && focus >= 0
		? { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
		: null
}
