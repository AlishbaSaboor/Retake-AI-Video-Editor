import * as Sentry from '@sentry/nextjs'

export async function register() {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		// A production server without accounts would refuse every paid action:
		// it stops here, saying which settings to set, once that line is out.
		const { stopWithoutProductionSettings } = await import('./src/lib/production-settings')
		const { log } = await import('./src/server/lib/logger')
		const stopped = stopWithoutProductionSettings(process.env, {
			error: log.error,
			exit: (code) => process.stdout.write('', () => process.exit(code))
		})
		if (stopped) return

		await import('./sentry.server.config')

		// Sentry silently no-ops without a DSN, so a deployment that forgot to
		// set one reports nothing and looks healthy. Warn once at boot (Node
		// runtime only, so it's one line per instance, not one per runtime)
		// rather than discovering it the first time an error goes missing.
		if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
			log.warn('error reporting disabled: NEXT_PUBLIC_SENTRY_DSN is unset')
		}

		// Validates every env var declared in src/lib/env.ts and throws with a
		// clear message if one's missing/malformed — runs once per server
		// instance (register() fires on boot, not per-request), so a
		// misconfigured deployment fails immediately instead of surfacing as
		// an obscure runtime error three requests later.
		await import('./src/lib/env')
	}
	if (process.env.NEXT_RUNTIME === 'edge') {
		await import('./sentry.edge.config')
	}
}

export const onRequestError = Sentry.captureRequestError
