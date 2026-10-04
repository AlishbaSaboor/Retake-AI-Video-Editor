import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageIntro } from '@/components/site/page-intro'
import { ContactForm } from './contact-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.contact')
	return { title: t('metaTitle') }
}

export default async function ContactPage() {
	const t = await getTranslations('Site.contact')
	return (
		<main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 md:px-6 md:py-20 lg:grid-cols-[1fr_1.2fr]">
			<PageIntro eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
			<ContactForm />
		</main>
	)
}
