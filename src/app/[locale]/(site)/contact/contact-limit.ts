import { createHmac } from 'node:crypto'

// How many Contact us messages are kept, so anyone (signed in or not) can't
// fill the table. Counted from the messages themselves, by a keyed hash of
// the sender's IP: no counter to lose on a restart, the same on every server.

/** One sender's messages in the window: room for a retry or a follow-up, not a flood. */
export const SENDER_LIMIT = 5
/**
 * Every sender whose IP (or the key) isn't known, together: never in the way
 * of development, tests or a demo (a handful an hour), yet a flood stops here.
 */
export const SHARED_LIMIT = 30
/** The window both limits count over: the last hour, rolling. */
export const LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * The client's IP: the last entry of `x-forwarded-for`, the one the host (or
 * the proxy in front) wrote. Vercel replaces the header with the client's
 * IP, and a proxy appends to it; a client can only put entries before it.
 * Null when there is none.
 */
export function clientIp(forwardedFor: string | null): string | null {
	return forwardedFor?.split(',').at(-1)?.trim() || null
}

/**
 * The sender as stored and counted: an HMAC-SHA256 of the IP with `key`,
 * so the IP itself is never kept and can't be worked back from the hash
 * without the key. Null without an IP or a key: the shared limit applies.
 */
export function senderHash(ip: string | null, key: string | undefined): string | null {
	return ip && key ? createHmac('sha256', key).update(ip).digest('hex') : null
}

/** How many messages the window allows this sender: SENDER_LIMIT, or SHARED_LIMIT when unknown. */
export function limitFor(hash: string | null): number {
	return hash ? SENDER_LIMIT : SHARED_LIMIT
}
