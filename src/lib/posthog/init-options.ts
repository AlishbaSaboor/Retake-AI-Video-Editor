import type { PostHogConfig } from 'posthog-js'

/**
 * How PostHog starts in the browser (instrumentation-client.ts), kept here so
 * it can be tested. Only the typed events in src/lib/analytics and page views
 * are sent: no autocapture (clicks, inputs and page text are never collected)
 * and no session recording, whatever PostHog's own project settings say.
 * Page views are captured by hand on each route change (AnalyticsProvider).
 */
export const POSTHOG_INIT_OPTIONS = {
	person_profiles: 'identified_only',
	capture_pageview: false,
	autocapture: false,
	disable_session_recording: true
} as const satisfies Partial<PostHogConfig>
