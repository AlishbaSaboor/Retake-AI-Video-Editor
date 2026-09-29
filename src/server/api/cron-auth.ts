import { timingSafeEqual } from 'node:crypto'

export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
	if (!secret || !header) return false
	const expected = Buffer.from(`Bearer ${secret}`)
	const actual = Buffer.from(header)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}
