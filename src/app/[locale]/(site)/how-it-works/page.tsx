import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { HowItWorksSection } from '@/components/site/landing-sections'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.howItWorks')
	return { title: t('metaTitle') }
}

/** How it works on its own: the landing page's section, as the page. */
export default function HowItWorksPage() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-16 md:px-6 md:py-20">
			<HowItWorksSection level={1} />
		</main>
	)
}
