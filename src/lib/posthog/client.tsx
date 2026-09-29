'use client'

import posthog from 'posthog-js'

// The one low-level posthog-js wrapper. Everything above it — the typed
// track()/capture() API, the convenience wrappers, attribution, identify —
// lives in @/lib/analytics and calls through this. Don't call posthog.capture
// directly from feature code; use @/lib/analytics/track so events stay typed
// against the taxonomy (events.ts, docs/rules/analytics.md).
//
// This exists as its own function (rather than inlining the try/catch in
// track.ts) so there is exactly one place that touches posthog-js's capture:
// an ad-blocker or PostHog outage must never throw into application code.
// Pageview capture moved to @/lib/analytics/analytics-provider (AnalyticsProvider),
// which emits both $pageview and the taxonomy's page_viewed on route change.
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
	try {
		posthog.capture(name, properties)
	} catch {
		// Analytics can never break the feature it's instrumenting.
	}
}
