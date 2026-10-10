// A time limit on a call that might never answer (an AI under load). The
// signal lets the call stop its own request; the deadline rejects at the
// limit whether it does or not, so whoever waits is never left waiting.

/** A call that went past its time limit. */
export class TimeoutError extends Error {
	readonly ms: number
	constructor(ms: number) {
		super(`no answer within ${ms} ms`)
		this.name = 'TimeoutError'
		this.ms = ms
	}
}

/**
 * Runs `work` with a signal that aborts after `ms`, and rejects with
 * TimeoutError then, even if `work` ignores the signal.
 */
export async function withTimeout<T>(
	ms: number,
	work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			// Settled first, so the time-out is what's reported even when the
			// call fails at once on being aborted (an AbortError of its own).
			reject(new TimeoutError(ms))
			controller.abort()
		}, ms)
	})
	try {
		return await Promise.race([work(controller.signal), deadline])
	} finally {
		clearTimeout(timer)
	}
}
