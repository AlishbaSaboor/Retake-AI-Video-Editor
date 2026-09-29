// A stale JS chunk after a redeploy: the user has an old bundle open and
// navigates to a route whose chunk no longer exists at the old build's URL.
// Reloading once fetches the current bundle and fixes it — this isn't a
// real error, so it should never reach Sentry or the generic error UI.
const RELOAD_STORAGE_KEY = 'chunk-load-error-reloaded-at'
const RELOAD_THROTTLE_MS = 30_000

export function isChunkLoadError(error: Error): boolean {
	return /ChunkLoadError|Loading chunk [\d]+ failed|Importing a module script failed/.test(
		`${error.name} ${error.message}`
	)
}

// Reloads at most once per throttle window — if reloading didn't help last
// time, looping forever is worse than falling through to the normal error
// UI, so the caller should treat "already reloaded recently" as a signal to
// stop retrying and show the fallback instead.
export function reloadOnceForChunkError(): void {
	if (typeof window === 'undefined') return
	const last = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY) ?? 0)
	if (Date.now() - last < RELOAD_THROTTLE_MS) return
	window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()))
	window.location.reload()
}
