import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon } from '@/components/ui/icons'
import { EditorPreview } from '@/components/site/editor-preview'
import { FaqSection, FeaturesSection, HowItWorksSection } from '@/components/site/landing-sections'
import { Link } from '@/i18n/routing'
import { ContactForm } from './contact/contact-form'

export default async function LandingPage() {
	const t = await getTranslations('Site.landing')
	const tc = await getTranslations('Site.contact')
	return (
		<main>
			<section className="relative overflow-hidden">
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-soft),transparent)]"
				/>
				<div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1fr_1.1fr]">
					<div className="flex flex-col gap-6">
						<p className="border-border bg-surface text-text-muted inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-medium">
							<span className="bg-accent size-1.5 rounded-full" />
							{t('badge')}
						</p>
						<h1 className="font-display text-text text-5xl leading-[1.05] font-bold tracking-tight text-balance md:text-6xl">
							{t('title')}
						</h1>
						<p className="text-text-muted max-w-xl text-lg leading-relaxed text-pretty">
							{t('description')}
						</p>
						<div className="flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link href="/home">
									{t('start')}
									<ArrowRightIcon />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<a href="#how-it-works">{t('howItWorks')}</a>
							</Button>
						</div>
					</div>
					<EditorPreview />
				</div>
			</section>

			<div className="mx-auto flex max-w-6xl flex-col gap-24 px-4 py-20 md:px-6">
				<HowItWorksSection />
				<FeaturesSection />
				<section aria-labelledby="contact" className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
					<div className="flex max-w-xl flex-col gap-3">
						<p className="text-accent font-mono text-xs font-medium tracking-widest uppercase">
							{tc('eyebrow')}
						</p>
						<h2
							id="contact"
							className="font-display text-text text-3xl font-bold tracking-tight md:text-4xl"
						>
							{tc('title')}
						</h2>
						<p className="text-text-muted leading-relaxed">{tc('description')}</p>
					</div>
					<ContactForm />
				</section>
				<FaqSection />
			</div>
		</main>
	)
}
