import type { Metadata } from 'next'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
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
	description: 'Fix the flaws in a recording without starting over.'
}

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' })

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
			className={cn(geist.variable, geistMono.variable, grotesk.variable)}
		>
			<head>
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
