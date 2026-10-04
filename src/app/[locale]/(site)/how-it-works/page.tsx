import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon } from '@/components/ui/icons'
import { PageIntro } from '@/components/site/page-intro'
import { Link } from '@/i18n/routing'

const STEPS = ['start', 'ask', 'hand', 'finish'] as const
const PRIVACY = ['browser', 'speech', 'commands'] as const

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.howItWorks')
	return { title: t('metaTitle') }
}

export default async function HowItWorksPage() {
	const t = await getTranslations('Site.howItWorks')
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-16 md:px-6 md:py-20">
			<PageIntro eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
			<ol className="grid gap-4 md:grid-cols-2">
				{STEPS.map((step, index) => (
					<li
						key={step}
						className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-6"
					>
						<span className="text-accent font-mono text-sm font-semibold">
							{String(index + 1).padStart(2, '0')}
						</span>
						<h2 className="font-display text-text text-xl font-semibold">
							{t(`steps.${step}.title`)}
						</h2>
						<p className="text-text-muted leading-relaxed">{t(`steps.${step}.body`)}</p>
					</li>
				))}
			</ol>
			<section aria-labelledby="privacy" className="flex flex-col gap-6">
				<h2 id="privacy" className="font-display text-text text-2xl font-bold tracking-tight">
					{t('privacy.title')}
				</h2>
				<dl className="grid gap-4 md:grid-cols-3">
					{PRIVACY.map((item) => (
						<div key={item} className="border-border flex flex-col gap-2 border-l-2 pl-4">
							<dt className="text-text font-semibold">{t(`privacy.${item}.title`)}</dt>
							<dd className="text-text-muted text-sm leading-relaxed">
								{t(`privacy.${item}.body`)}
							</dd>
						</div>
					))}
				</dl>
			</section>
			<Button asChild size="lg" className="self-start">
				<Link href="/home">
					{t('cta')}
					<ArrowRightIcon />
				</Link>
			</Button>
		</main>
	)
}
