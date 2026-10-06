import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { FeaturesSection } from '@/components/site/landing-sections'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.features')
	return { title: t('metaTitle') }
}

/** Features on their own: the landing page's section, as the page. */
export default function FeaturesPage() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-16 md:px-6 md:py-20">
			<FeaturesSection level={1} />
		</main>
	)
}
