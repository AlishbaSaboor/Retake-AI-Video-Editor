import type { MadePlan, MakeBasis } from '@/app/[locale]/(app)/make/make-plan'
import type { EditSnapshot } from '../model/edit-snapshot'
import type { Transcript } from '../audio/transcript'

// How a project started on the home page reaches the editor: the video
// picked there, and the command typed (or spoken) with it; or from Make it,
// the video with its transcript and the edit planned for it. Held in memory
// for the client-side navigation between the two pages and taken once; a
// reload of the editor starts empty, as before.

/**
 * `byHand`: started from "Edit by hand", so the editor opens on the
 * transcript, not the assistant. `edit`: Make it's plan, applied as one
 * undo step over the untouched video; `transcript` saves a second one.
 * `studio`: open on the edited video and the chat only (the full editor is
 * a click away).
 */
/** What Make it applied, shown over the chat when the editor opens on it. */
export type MadeWith = {
	request: string
	/** The plan in plain words, a line each, as the Make it page showed it. */
	lines: string[]
	editedSeconds: number
	originalSeconds: number
	/** The plan as applied, and what it was made from: a follow-up in the chat changes it. */
	plan: MadePlan<AudioBuffer>
	basis: MakeBasis
}

export type EditorStart = {
	file: File
	command: string | null
	byHand?: boolean
	transcript?: Transcript | null
	edit?: EditSnapshot
	/** Make it's Apply: open on the edited video with only the chat beside it. */
	studio?: MadeWith
}

let pending: EditorStart | null = null

export function handOffStart(start: EditorStart) {
	pending = start
}

/** The start handed over, once: a second call (or a later visit) gets null. */
export function takeStart(): EditorStart | null {
	const start = pending
	pending = null
	return start
}
