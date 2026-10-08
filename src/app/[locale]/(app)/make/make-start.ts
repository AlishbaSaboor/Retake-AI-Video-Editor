// How a video picked on the home page's Make it card reaches the Make it
// page, with whatever was typed there: held in memory for the client-side
// navigation between the two, read when the page first renders and then
// let go. A reload of the Make it page starts empty.

export type MakeStart = { file: File; request: string }

let pending: MakeStart | null = null

export function handOffMake(start: MakeStart) {
	pending = start
}

/** What was handed over, if anything; it stays until `clearMakeStart`. */
export function peekMakeStart(): MakeStart | null {
	return pending
}

export function clearMakeStart() {
	pending = null
}
