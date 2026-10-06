// How a project started on the home page reaches the editor: the video
// picked there, and the command typed (or spoken) with it. Held in memory
// for the client-side navigation between the two pages and taken once; a
// reload of the editor starts empty, as before.

/** `byHand`: started from "Edit by hand", so the editor opens on the transcript, not the assistant. */
export type EditorStart = { file: File; command: string | null; byHand?: boolean }

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
