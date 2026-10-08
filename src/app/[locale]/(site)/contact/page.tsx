import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MailIcon } from '@/components/ui/icons'
import { ClosingBand } from '@/components/site/closing-band'
import { DisplayHeading, Eyebrow, emphasis } from '@/components/site/display'
import { FaqSection } from '@/components/site/landing-sections'
import { ContactForm } from './contact-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.contact')
	return { title: t('metaTitle') }
}

/** Contact us, then the questions people ask most. */
export default async function ContactPage() {
	const t = await getTranslations('Site.contact')
	return (
		<main>
			<section className="bg-glow -mt-[76px] px-5 pt-[clamp(130px,13vw,196px)]">
				<div className="mx-auto grid max-w-[1160px] items-start gap-12 lg:grid-cols-[minmax(0,544px)_minmax(0,1fr)] lg:gap-16">
					<div className="rt-rise flex flex-col gap-4">
						<Eyebrow>{t('eyebrow')}</Eyebrow>
						<DisplayHeading as="h1" className="text-[clamp(52px,6.4vw,84px)] leading-[0.98]">
							{t.rich('title', { em: emphasis('accent') })}
						</DisplayHeading>
						<p className="text-text-muted max-w-[440px] text-lg leading-[1.6]">
							{t('description')}
						</p>
						<span className="border-glass-border bg-glass text-text mt-3 inline-flex h-[54px] items-center gap-3 self-start rounded-full border px-5 text-base font-bold">
							<MailIcon size={18} />
							{t('reply')}
						</span>
					</div>
					<div className="rt-rise [animation-delay:0.1s]">
						<ContactForm />
					</div>
				</div>
			</section>
			<FaqSection />
			<ClosingBand />
		</main>
	)
}
