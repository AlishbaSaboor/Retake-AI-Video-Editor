import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ClosingBand } from '@/components/site/closing-band'
import { Eyebrow, PageHero, emphasis } from '@/components/site/display'
import { Link } from '@/i18n/routing'
import { DAILY_AI_LIMITS } from '@/lib/ai-limits'
import { cn } from '@/lib/cn'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.pricing')
	return { title: t('metaTitle') }
}

const FEATURE_COUNT = 8
const BULLETS = ['bg-brand-violet', 'bg-brand-purple', 'bg-brand-blue', 'bg-brand-lilac'] as const
const NOTES = ['after', 'limits'] as const
/** The daily AI limits, as the limits note says them (from the one place they're set). */
const LIMITS = {
	command: DAILY_AI_LIMITS.command.perDay,
	voice: DAILY_AI_LIMITS.voice.perDay,
	transcript: DAILY_AI_LIMITS.transcript.perDay,
	highlights: DAILY_AI_LIMITS.highlights.perDay,
	makeIt: DAILY_AI_LIMITS.make_it.perDay
}

/** Pricing: free while in beta, with everything in it, and what comes after. */
export default async function PricingPage() {
	const t = await getTranslations('Site.pricing')
	return (
		<main>
			<PageHero
				eyebrow={t('eyebrow')}
				title={t.rich('title', { em: emphasis('gradient') })}
				description={t('description')}
				className="[&_h1]:text-[clamp(56px,9vw,120px)]"
			/>
			<div className="mx-auto flex max-w-[724px] flex-col gap-4 px-5">
				<div className="rt-reveal bg-brand-wide rounded-[34px] p-0.5 shadow-(--shadow-card)">
					<section
						aria-labelledby="plan"
						className="bg-surface-raised flex flex-col gap-8 rounded-[32px] p-[clamp(24px,5vw,44px)]"
					>
						<div className="flex flex-wrap items-end justify-between gap-6">
							<div className="flex flex-col gap-1">
								<Eyebrow as="span">{t('plan')}</Eyebrow>
								<h2
									id="plan"
									className="text-text font-display text-[80px] leading-none font-medium"
								>
									{t('price')}
								</h2>
							</div>
							<Link
								href="/home"
								className="rt-btn bg-accent text-accent-ink focus-visible:outline-accent inline-flex min-h-[52px] items-center rounded-full px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
							>
								{t('start')}
							</Link>
						</div>
						<ul aria-label={t('included')} className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
							{Array.from({ length: FEATURE_COUNT }, (_, index) => (
								<li key={index} className="text-text flex items-center gap-3 text-base">
									<span
										aria-hidden
										className={cn('size-2 shrink-0 rounded-full', BULLETS[index % BULLETS.length])}
									/>
									{t(`features.${index}`)}
								</li>
							))}
						</ul>
					</section>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{NOTES.map((note) => (
						<section
							key={note}
							aria-labelledby={`pricing-${note}`}
							className="rt-reveal border-glass-border bg-glass flex flex-col gap-1.5 rounded-3xl border px-6 py-[22px]"
						>
							<h2 id={`pricing-${note}`} className="text-text text-[17px] font-extrabold">
								{t(`${note}.title`)}
							</h2>
							<p className="text-text-muted text-[15px] leading-6">{t(`${note}.body`, LIMITS)}</p>
						</section>
					))}
				</div>
			</div>
			<ClosingBand />
		</main>
	)
}
