import { useSyncExternalStore } from 'react'

// Whether the editor's side panels are shown, remembered in this browser. An
// external store, not state read in an initializer: the server (and the
// first render, which must match it) has no storage, so both start open and
// the remembered choice applies right after.

export type Side = 'panels'

const KEY = 'retake-editor-layout'
const listeners = new Set<() => void>()

function read(side: Side): boolean {
	try {
		return localStorage.getItem(`${KEY}-${side}`) !== 'closed'
	} catch {
		return true
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** Opens or closes a side column, and remembers it. */
export function setSideOpen(side: Side, open: boolean) {
	try {
		localStorage.setItem(`${KEY}-${side}`, open ? 'open' : 'closed')
	} catch {
		// Storage blocked (a private window): it still opens and closes, below.
	}
	memory[side] = open
	for (const listener of listeners) listener()
}

// What's shown when storage can't be written: the last choice this visit.
const memory: Record<Side, boolean | null> = { panels: null }

export function useSideOpen(side: Side): boolean {
	return useSyncExternalStore(
		subscribe,
		() => memory[side] ?? read(side),
		() => true
	)
}
