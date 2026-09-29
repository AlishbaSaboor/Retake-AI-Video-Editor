'use client'

import { Suspense, useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { usePathname, useSearchParams } from 'next/navigation'
import { ANALYTICS_EVENTS } from './events'
import { captureAttribution } from './attribution'
import { track } from './track'

// Deliberately next/navigation, not the locale-aware @/i18n/routing versions
// — those strip the locale prefix (by design, for building links), but a
// pageview should record the real browser URL, locale included.
function AnalyticsProviderInner() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const started = useRef(false)

	// Once per session: attribution + app_opened. app_opened marks the start
	// of a session regardless of which page opened it, so it's guarded by
	// PostHog's session id (not just this component mounting) to survive a
	// client-side remount within the same session.
	useEffect(() => {
		if (started.current) return
		started.current = true
		captureAttribution()

		let sessionId: string | undefined
		try {
			sessionId = posthog.get_session_id()
		} catch {
			sessionId = undefined
		}
		const marker = sessionId ? `app_opened:${sessionId}` : undefined
		if (marker && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(marker)) return
		if (marker && typeof sessionStorage !== 'undefined') sessionStorage.setItem(marker, '1')
		track(ANALYTICS_EVENTS.APP_OPENED, {})
	}, [])

	// On every route change: PostHog's native $pageview (its funnels/replay
	// rely on this exact event) plus the taxonomy's page_viewed. Pairs with
	// capture_pageview: false in instrumentation-client.ts — this is the only
	// source of both.
	useEffect(() => {
		if (!pathname) return
		const url = searchParams?.size ? `${pathname}?${searchParams.toString()}` : pathname
		try {
			posthog.capture('$pageview', { $current_url: url })
		} catch {
			// Analytics can never break navigation.
		}
		track(ANALYTICS_EVENTS.PAGE_VIEWED, { page_name: pathname })
	}, [pathname, searchParams])

	return null
}

// Mount once, near the root layout's providers. useSearchParams requires a
// Suspense boundary; wrapped internally so callers drop it in with no ceremony.
export function AnalyticsProvider() {
	return (
		<Suspense fallback={null}>
			<AnalyticsProviderInner />
		</Suspense>
	)
}
