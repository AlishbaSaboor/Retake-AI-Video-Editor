// What a production server can't run without: the Supabase settings that
// turn accounts on. Without them every paid AI action refuses (they require
// a signed-in user), so a deployment missing them stops at boot instead of
// serving an app nobody can use. Kept apart from env.ts so the boot check
// can run before env.ts loads (it throws on the same thing).

/** The settings accounts need, by name. */
const PRODUCTION_AUTH = [
	'NEXT_PUBLIC_SUPABASE_URL',
	'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
] as const

/**
 * The settings a production server is missing (unset or empty). None while
 * Next builds (the build never signs anyone in), in development or in tests.
 */
export function missingProductionSettings(vars: NodeJS.ProcessEnv): string[] {
	if (vars.NODE_ENV !== 'production' || vars.NEXT_PHASE === 'phase-production-build') return []
	return PRODUCTION_AUTH.filter((name) => !vars[name])
}

/** What to tell whoever starts it: exactly which settings to set. */
export function missingSettingsMessage(missing: readonly string[]): string {
	return `Accounts aren't set up: ${missing.join(' and ')} must be set in production, or every paid AI action refuses. Set them, then start again.`
}

/**
 * At boot: when settings are missing, logs which ones and exits with a
 * non-zero code, so the host sees a failed start rather than a server
 * answering every request with an error. Says whether it stopped.
 */
export function stopWithoutProductionSettings(
	vars: NodeJS.ProcessEnv,
	stop: {
		error: (message: string, fields: { missing: string[] }) => void
		exit: (code: number) => void
	}
): boolean {
	const missing = missingProductionSettings(vars)
	if (missing.length === 0) return false
	stop.error(missingSettingsMessage(missing), { missing })
	stop.exit(1)
	return true
}
