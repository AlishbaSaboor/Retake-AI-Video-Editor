import { z } from 'zod'
import { TimeoutError } from './with-timeout'

// What went wrong with an AI call, when it's something the person can act
// on: it didn't answer in time, its key was refused, its usage limit was
// reached, or it's overloaded. Anything else is a bug, reported as one.

export type AiFailure = 'timeout' | 'key' | 'quota' | 'busy'

/** The status (and message) an SDK error carries: Gemini's ApiError, our DeepgramError. */
const statusError = z.object({ status: z.number(), message: z.string().optional() })

/** A refused key: 401 or 403, or Gemini's 400 "API key not valid". */
const KEY_MESSAGE = /api[ _]?key/i

export function aiFailureOf(error: unknown): AiFailure | null {
	if (error instanceof TimeoutError) return 'timeout'
	const parsed = statusError.safeParse(error)
	if (!parsed.success) return null
	const { status, message = '' } = parsed.data
	if (status === 401 || status === 403 || (status === 400 && KEY_MESSAGE.test(message))) {
		return 'key'
	}
	if (status === 429) return 'quota'
	if (status === 503) return 'busy'
	return null
}

/** The HTTP status each comes back to the page with: the page tells them apart by it. */
export const AI_FAILURE_STATUS: Record<AiFailure, number> = {
	timeout: 504,
	key: 401,
	quota: 429,
	busy: 503
}

/**
 * The statuses whose message is written for people (a refused key, a usage
 * limit, a busy AI): a page shows those words. A time-out (504) gets the
 * page's own words for what didn't happen; anything else is never shown.
 */
const PLAIN_STATUSES: readonly number[] = [
	AI_FAILURE_STATUS.key,
	AI_FAILURE_STATUS.quota,
	AI_FAILURE_STATUS.busy
]
export function isPlainAiStatus(status: number): boolean {
	return PLAIN_STATUSES.includes(status)
}

/** A server action's failure as the browser gets it: its message and status. */
export class ActionFailure extends Error {
	readonly status: number
	constructor(message: string, status: number) {
		super(message)
		this.name = 'ActionFailure'
		this.status = status
	}
}
