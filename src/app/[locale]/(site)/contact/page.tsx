import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MailIcon } from '@/components/ui/icons'
import { ClosingBand } from '@/components/site/closing-band'
import { DisplayHeading, Eyebrow, Lead, emphasis } from '@/components/site/display'
import { Questions } from '@/components/site/landing/landing-scenes'
import { ContactForm } from './contact-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.contact')
	return { title: t('metaTitle') }
}

const ALL_QUESTIONS = [
	'what',
	'free',
	'asking',
	'undo',
	'install',
	'videos',
	'vertical',
	'rerecord',
	'kept'
] as const

/** Contact us, then the questions people ask most. */
export default async function ContactPage() {
	const t = await getTranslations('Site.contact')
	const faq = await getTranslations('Site.faq')
	return (
		<main>
			<section className="px-[clamp(16px,4vw,48px)] pt-[clamp(70px,11vw,150px)] pb-[clamp(60px,9vw,120px)]">
				<div className="mx-auto grid max-w-[1144px] items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
					<div className="rt-rise flex flex-col items-start gap-[22px]">
						<Eyebrow>{t('eyebrow')}</Eyebrow>
						<DisplayHeading as="h1" size="page" className="max-w-[12ch]">
							{t.rich('title', { em: emphasis('accent') })}
						</DisplayHeading>
						<Lead>{t('description')}</Lead>
						<span className="border-border text-text-muted inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 text-[15px] font-medium">
							<MailIcon size={18} />
							{t('reply')}
						</span>
					</div>
					<div className="rt-rise [animation-delay:0.1s]">
						<ContactForm />
					</div>
				</div>
			</section>
			<Questions title={faq.rich('title', { em: emphasis('plain') })} keys={ALL_QUESTIONS} />
			<ClosingBand />
		</main>
	)
}
