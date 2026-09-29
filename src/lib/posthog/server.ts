import 'server-only'
import { PostHog } from 'posthog-node'

// One client per server process, flushed eagerly since serverless functions
// can freeze/exit before a batched flush would fire otherwise.
let client: PostHog | undefined

export function getPostHogServerClient() {
	if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return undefined

	client ??= new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
		host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
		flushAt: 1,
		flushInterval: 0,
		// Enables LOCAL feature-flag evaluation: with this set, evaluateFlags()
		// computes flags from polled definitions in-process instead of a network
		// call per request, and only falls back to the remote /flags endpoint for
		// flags it can't evaluate locally (e.g. some experiments). Accepts a
		// personal (phx_) or project-secret (phs_) key; without it, flag reads
		// still work, just always over the network. Server-only — never the
		// client bundle. See docs/rules/feature-flags.md.
		secretKey: process.env.POSTHOG_PERSONAL_API_KEY
	})

	return client
}
