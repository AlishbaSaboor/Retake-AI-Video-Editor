'use client'

import posthog from 'posthog-js'

// Common user attributes (rule 6). Most are already attached by PostHog's own
// autocapture and don't need re-implementing here:
//   os        -> $os
//   device    -> $device_type
//   country   -> $geoip_country_code
// What PostHog doesn't infer, we set explicitly below: first-touch UTM
// attribution, whether the visit was internal vs external, and the app version.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

function readUtmParams(search: string): Record<string, string> {
	const params = new URLSearchParams(search)
	const utm: Record<string, string> = {}
	for (const key of UTM_KEYS) {
		const value = params.get(key)
		if (value) utm[key] = value
	}
	return utm
}

// External if the visit carries UTM params or arrived from another origin;
// internal (direct/in-app navigation) otherwise. user_source is the
// internal-nav dimension in the spec, user_utm_* the external one.
function resolveUserSource(utm: Record<string, string>): 'internal' | 'external' {
	if (Object.keys(utm).length > 0) return 'external'
	const referrer = document.referrer
	if (referrer && !referrer.startsWith(window.location.origin)) return 'external'
	return 'internal'
}

// Call once on first client load (AnalyticsProvider does this). Registers the
// current UTM/source/app_version as super properties (attached to every event
// this session) and pins the UTM values as first-touch person properties via
// set-once, so later visits don't overwrite the original acquisition source.
export function captureAttribution(): void {
	if (typeof window === 'undefined') return
	try {
		const utm = readUtmParams(window.location.search)
		const userSource = resolveUserSource(utm)
		const appVersion = process.env.NEXT_PUBLIC_APP_VERSION

		posthog.register({
			...utm,
			user_source: userSource,
			...(appVersion ? { app_version: appVersion } : {})
		})

		// Second arg is set-once: first-touch attribution, never overwritten.
		const firstTouch: Record<string, string> = { user_source: userSource }
		for (const key of UTM_KEYS) {
			if (utm[key]) firstTouch[`user_${key}`] = utm[key]
		}
		posthog.setPersonProperties(undefined, firstTouch)
	} catch {
		// Attribution can never break the app it's measuring.
	}
}
