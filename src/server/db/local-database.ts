/**
 * The tests that write to a real database (`*.db-test.mts`, `pnpm test:db`)
 * run only against one on this machine: CI's own throwaway Postgres, or the
 * local Supabase. Any other host (a hosted database) is refused, never
 * written to; so is no database at all, rather than the test passing unrun.
 */
export function assertLocalDatabase(url: string | undefined): void {
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set: these tests need a local Postgres with the migrations applied (pnpm exec prisma migrate deploy).'
		)
	}
	let host = ''
	try {
		host = new URL(url).hostname
	} catch {
		throw new Error('DATABASE_URL is not a valid URL.')
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
		throw new Error(
			`Refused: these tests write to the database, and ${host} isn't on this machine.`
		)
	}
}
