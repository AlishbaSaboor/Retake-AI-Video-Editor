import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { withSentryConfig } from '@sentry/nextjs'
import { TRANSCRIBE_REQUEST_LIMIT_BYTES } from './src/app/[locale]/editor/audio/take-audio'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * Pages that became sections of the landing page, and pages removed: each
 * old URL goes to the section it became (or the landing page), never a 404.
 * With and without the locale prefix (the default locale is unprefixed).
 */
const MOVED_PAGES = [
	{ from: '/features', to: '/#features' },
	{ from: '/how-it-works', to: '/#how-it-works' },
	{ from: '/faq', to: '/#faq' },
	{ from: '/contact', to: '/#faq' },
	{ from: '/pricing', to: '/' }
] as const

const nextConfig: NextConfig = {
	reactStrictMode: true,
	async redirects() {
		return MOVED_PAGES.flatMap(({ from, to }) => [
			{ source: from, destination: to, permanent: true },
			{ source: `/:locale(en)${from}`, destination: to, permanent: true }
		])
	},
	// Top-level as of Next.js 16, not under `experimental`. Strictest
	// setting: any Compiler bailout fails the build instead of silently
	// skipping optimization for that component. Matches 8x-core and
	// 8x-brands — catch Compiler-incompatible code at build time, not as a
	// silent perf regression in prod.
	reactCompiler: {
		panicThreshold: 'all_errors'
	},
	// The landing page's stills of its footage go at 85 (the default 75
	// softens sky gradients); every other image keeps the default.
	images: {
		qualities: [75, 85]
	},
	experimental: {
		// The transcript action receives a take's audio: up to 5 minutes of
		// 16 kHz mono WAV, base64-encoded (~12.8 MB). Both limits below sit in
		// its path and both default too low — 1 MB for Server Actions, 10 MB
		// for the proxy's body buffer (src/proxy.ts runs on /editor), which
		// truncates silently rather than rejecting. One constant drives both,
		// derived from MAX_TRANSCRIBE_SECONDS, so they can't drift apart.
		serverActions: {
			bodySizeLimit: TRANSCRIBE_REQUEST_LIMIT_BYTES
		},
		proxyClientMaxBodySize: TRANSCRIBE_REQUEST_LIMIT_BYTES
	}
}

export default withSentryConfig(withNextIntl(nextConfig), {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	silent: !process.env.CI,
	widenClientFileUpload: true
	// disableLogger is deprecated and unsupported under Turbopack (our
	// default bundler) — Sentry's tree-shaking of its own debug logging
	// happens automatically now, nothing to configure here.
})
