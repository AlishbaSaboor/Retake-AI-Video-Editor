'use client'

import posthog from 'posthog-js'

// Common user attributes that link an anonymous session to a known user.
// Keep these to non-PII, low-cardinality traits — a plan tier, a role, a
// signup source. Never an email or a name: PostHog persons are queryable and
// exportable, so PII here is PII everywhere (rule 5, docs/rules/analytics.md).
type UserTraits = {
	plan?: string
	role?: string
	[key: string]: string | number | boolean | undefined
}

// Call right after login (or on first load for an already-authenticated
// session). posthog.init uses person_profiles: 'identified_only', so a person
// profile only exists once this runs — anonymous events stay anonymous until
// then. distinctId must be the same stable id the server uses (server.ts), so
// client and server events land on one person.
export function identifyUser({
	distinctId,
	traits
}: {
	distinctId: string
	traits?: UserTraits
}): void {
	try {
		posthog.identify(distinctId, traits)
	} catch {
		// Identity can never break the login it's recording.
	}
}

// Call on logout. Clears the identified person and starts a fresh anonymous
// id, so the next user on a shared device isn't merged into the previous one.
export function resetAnalytics(): void {
	try {
		posthog.reset()
	} catch {
		// Reset can never break the logout it's recording.
	}
}
