import type { Metadata } from 'next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { QueryProvider } from '@/components/query-provider'
import { AnalyticsProvider } from '@/lib/analytics/analytics-provider'
import { Toaster } from '@/components/ui/toaster'
import '../globals.css'

export const metadata: Metadata = {
	title: 'Retake'
}

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
		<html lang={locale} suppressHydrationWarning>
			<body>
				<AnalyticsProvider />
				<NextIntlClientProvider>
					<QueryProvider>{children}</QueryProvider>
				</NextIntlClientProvider>
				<Toaster />
			</body>
		</html>
	)
}
