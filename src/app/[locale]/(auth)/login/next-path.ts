/** Where signing in lands when there's nowhere safe to go back to. */
export const AFTER_SIGN_IN = '/home'

/**
 * Where to go once signed in: `next`, only when it is a path on this site
 * (`origin`). It must start with a single "/" and resolve to the same origin;
 * "//evil.com", "/\evil.com" (a browser reads the backslash as a slash) and
 * any full URL elsewhere go to AFTER_SIGN_IN. The path is returned as the
 * browser would resolve it.
 */
export function safeNext(next: string | null, origin: string): string {
	if (!next?.startsWith('/') || next.startsWith('//')) return AFTER_SIGN_IN
	const url = new URL(next, origin)
	return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : AFTER_SIGN_IN
}
