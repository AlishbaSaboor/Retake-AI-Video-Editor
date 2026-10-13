// What a production server can't run without, and what each is for: the
// Supabase settings that turn accounts on (without them every paid AI
// action refuses: they require a signed-in user). A deployment missing one
// stops at boot instead of serving a broken app. Kept apart from env.ts so the boot
// check can run before env.ts loads (it throws on the same thing).

const PRODUCTION_SETTINGS: ReadonlyArray<{
	names: readonly string[]
	/** The sentence for the missing ones of `names`. */
	missing: (names: string) => string
}> = [
	{
		names: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
		missing: (names) =>
			`Accounts aren't set up: ${names} must be set in production, or every paid AI action refuses.`
	}
]

/**
 * The settings a production server is missing (unset or empty). None while
 * Next builds (the build never signs anyone in), in development or in tests.
 */
export function missingProductionSettings(vars: NodeJS.ProcessEnv): string[] {
	if (vars.NODE_ENV !== 'production' || vars.NEXT_PHASE === 'phase-production-build') return []
	return PRODUCTION_SETTINGS.flatMap(({ names }) => names.filter((name) => !vars[name]))
}

/** What to tell whoever starts it: exactly which settings to set, and what for. */
export function missingSettingsMessage(missing: readonly string[]): string {
	const sentences = PRODUCTION_SETTINGS.flatMap(({ names, missing: sentence }) => {
		const these = names.filter((name) => missing.includes(name))
		return these.length > 0 ? [sentence(these.join(' and '))] : []
	})
	return `${sentences.join(' ')} Set them, then start again.`
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
