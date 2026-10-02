// Undo and redo as two stacks of snapshots of the edit. Every edit here is
// plain immutable state (the source is never touched), so a snapshot is
// just references to those values — restoring one can't drift the way
// replaying inverse actions could. A re-recorded take is retained by the
// snapshots that hold it, so undo then redo brings back the same recording.

/**
 * How many steps Undo can go back. Far more than a session needs to undo
 * through, and it bounds what history keeps alive: every snapshot is a few
 * numbers, except a re-recorded take's audio, a few MB each.
 */
export const HISTORY_LIMIT = 50

/** `past` ends with the step Undo returns to; `future` with the one Redo does. */
export type History<T> = { past: T[]; future: T[] }

/** What Undo or Redo returns: the snapshot to restore, and the history after it. */
export type Step<T> = { history: History<T>; restore: T }

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] })

/** Records `present` as the step before a new edit, which ends any redo branch. */
export function record<T>(history: History<T>, present: T): History<T> {
	return { past: [...history.past, present].slice(-HISTORY_LIMIT), future: [] }
}

/** Null with nothing to undo. */
export function undo<T>(history: History<T>, present: T): Step<T> | null {
	const restore = history.past.at(-1)
	if (restore === undefined) return null
	return {
		history: { past: history.past.slice(0, -1), future: [...history.future, present] },
		restore
	}
}

/** Null with nothing to redo. */
export function redo<T>(history: History<T>, present: T): Step<T> | null {
	const restore = history.future.at(-1)
	if (restore === undefined) return null
	return {
		history: { past: [...history.past, present], future: history.future.slice(0, -1) },
		restore
	}
}
