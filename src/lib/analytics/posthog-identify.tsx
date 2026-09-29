'use client'

import { useEffect } from 'react'
import { identifyUser, resetAnalytics } from './identify'

// Ties the current PostHog session to the signed-in person and stamps their
// "tags" (person properties) on it — the seam that was missing. Rendered by a
// Server Component that already knows the user (the admin layout), so the
// distinctId + traits arrive as serializable props and no client fetch is
// needed. distinctId must be the same stable id the server flag context uses
// (server.ts), so client + server events and flag evaluations land on one
// person.
//
// Why this is the bootstrap: posthog.identify(distinctId, traits) not only sets
// the person + properties, it makes posthog-js RE-EVALUATE feature flags for
// that person. So the flag values posthog-js attaches to events (and uses to gate
// session replay) line up with the properties the server resolved against — the
// server↔client consistency init-time bootstrap would give, without forcing
// app-wide flag resolution. When signed out (null id) it resets, so the next
// person on a shared device isn't merged into the previous one.
//
// Mount this wherever your app knows the authenticated user. It's wired in the
// admin layout here; for end-user surfaces, render it at your authed root with
// that user's traits.
type PostHogIdentifyProps = {
	distinctId: string | null
	traits?: Record<string, string | number | boolean>
}

export function PostHogIdentify({ distinctId, traits }: PostHogIdentifyProps): null {
	// Serialize so the effect depends on primitive values (a fresh traits object
	// each render would otherwise re-fire it, and churn the React Compiler's
	// dependency analysis).
	const traitsKey = JSON.stringify(traits ?? {})

	useEffect(() => {
		if (!distinctId) {
			resetAnalytics()
			return
		}
		const parsed: Record<string, string | number | boolean> = JSON.parse(traitsKey)
		identifyUser({ distinctId, traits: parsed })
	}, [distinctId, traitsKey])

	return null
}
