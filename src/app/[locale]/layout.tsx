import type { Metadata } from 'next'
import { Funnel_Display, Funnel_Sans, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { QueryProvider } from '@/components/query-provider'
import { AnalyticsProvider } from '@/lib/analytics/analytics-provider'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { THEME_SCRIPT } from '@/lib/theme'
import '../globals.css'

export const metadata: Metadata = {
	title: { default: 'Retake', template: '%s · Retake' },
	description: 'A video editor for the web. Keep the moment, lose the mess.'
}

// Funnel Sans for reading, Funnel Display for headlines, JetBrains Mono for
// timecodes and labels (the design's three), self-hosted at build.
const funnelSans = Funnel_Sans({ subsets: ['latin'], variable: '--font-funnel-sans' })
const funnelDisplay = Funnel_Display({ subsets: ['latin'], variable: '--font-funnel-display' })
const jetbrainsMono = JetBrains_Mono({
	subsets: ['latin'],
	weight: ['400', '500'],
	variable: '--font-jetbrains-mono'
})

export default async function LocaleLayout({
	children,
	params
}: {
	children: React.ReactNode
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	if (!hasLocale(routing.locales, locale)) {
		notFound()
	}

	return (
		// Browser extensions (Cap, Grammarly, ...) add attributes to <html>
		// before React hydrates. This silences only attribute mismatches on
		// this one element — not its children — so real hydration bugs in the
		// app still surface.
		// The theme script sets data-theme on <html> before first paint, which
		// is one more reason React mustn't compare that element's attributes.
		<html
			lang={locale}
			suppressHydrationWarning
			className={cn(funnelSans.variable, funnelDisplay.variable, jetbrainsMono.variable)}
		>
			<head>
				{/* A plain <script>, run by the browser as it reads the page, so a
				    light-mode visitor never sees dark first. React warns about it in
				    development (it never runs it on the client); next/script would
				    run it only once Next's own code loads: measured, a dark flash. */}
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
			</head>
			<body className="min-h-screen">
				<AnalyticsProvider />
				<NextIntlClientProvider>
					<QueryProvider>{children}</QueryProvider>
				</NextIntlClientProvider>
				<Toaster />
			</body>
		</html>
	)
}
