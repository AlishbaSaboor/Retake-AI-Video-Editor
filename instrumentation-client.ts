import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

// A direct-to-storage upload is an XHR/fetch to a presigned URL, and Sentry's
// breadcrumb records that URL verbatim — including the signature and access-key
// id the query string carries. Drop the whole breadcrumb rather than trim it:
// once the credential is gone there's nothing left worth keeping. Covers the
// presigned-URL params of the common providers (S3/R2, GCS, Azure SAS).
const PRESIGNED_CREDENTIAL =
	/[?&](x-amz-(signature|credential|security-token)|x-goog-signature|googleaccessid|signature|sig)=/i

function leaksPresignedCredential(breadcrumb: Sentry.Breadcrumb): boolean {
	const url: unknown = breadcrumb.data?.url
	return typeof url === 'string' && PRESIGNED_CREDENTIAL.test(url)
}

// Next.js 15.3+ auto-detects this file — no manual import needed anywhere.
// Replaces the old sentry.client.config.ts pattern.
Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
	tracesSampleRate: 0.1,
	enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
	beforeBreadcrumb: (breadcrumb) => (leaksPresignedCredential(breadcrumb) ? null : breadcrumb)
})

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
	posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
		person_profiles: 'identified_only',
		capture_pageview: false // captured manually on route change — see AnalyticsProvider in src/lib/analytics
	})
}

// Required for Sentry to instrument client-side route transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
