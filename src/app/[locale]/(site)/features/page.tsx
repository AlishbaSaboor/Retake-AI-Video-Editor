import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ClosingBand } from '@/components/site/closing-band'
import { Eyebrow, PageHero, emphasis } from '@/components/site/display'
import { Device, ZoomShot } from '@/components/site/shot'
import { cn } from '@/lib/cn'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.features')
	return { title: t('metaTitle') }
}

const BULLETS = ['bg-brand-violet', 'bg-brand-blue', 'bg-brand-lilac', 'bg-brand-purple'] as const

const SECTIONS = [
	{ key: 'ai', points: ['plans', 'shows', 'builds'] },
	{ key: 'hand', points: ['tracks', 'finish', 'place', 'assistant', 'rerecord'] },
	{ key: 'tidy', points: ['cleanup', 'byHand', 'highlights', 'compare'] }
] as const

/** Features: three parts, each with what it covers beside a picture of it. */
export default async function FeaturesPage() {
	const t = await getTranslations('Site.features')
	const shots = await getTranslations('Site.shots')
	// The real screen each part describes: Make it's plan, the assistant on
	// the timeline, Clean up.
	const picture = (name: 'plan' | 'assistant' | 'tidy') => (
		<ZoomShot
			name={name}
			alt={shots(name)}
			label={shots('zoom')}
			className="overflow-hidden rounded-[18px]"
		/>
	)
	const pictures = { ai: picture('plan'), hand: picture('assistant'), tidy: picture('tidy') }
	return (
		<main>
			<PageHero eyebrow={t('eyebrow')} title={t.rich('title', { em: emphasis('accent') })} />
			<div className="mx-auto flex max-w-[1160px] flex-col gap-28 px-5 pt-10 xl:px-0">
				{SECTIONS.map(({ key, points }) => (
					<section
						key={key}
						aria-labelledby={`feature-${key}`}
						className="rt-reveal grid items-center gap-12 lg:grid-cols-[minmax(0,470px)_minmax(0,1fr)] lg:gap-14"
					>
						<div className="flex flex-col gap-4">
							<Eyebrow>{t(`sections.${key}.eyebrow`)}</Eyebrow>
							<h2
								id={`feature-${key}`}
								className="text-text font-serif text-[clamp(38px,4.4vw,54px)] leading-[1.02] tracking-[-0.01em]"
							>
								{t(`sections.${key}.title`)}
							</h2>
							<ul className="border-border mt-4 border-t">
								{points.map((point, index) => (
									<li key={point} className="border-border flex gap-4 border-b py-[18px]">
										<span
											aria-hidden
											className={cn(
												'mt-2 size-2 shrink-0 rounded-full',
												BULLETS[index % BULLETS.length]
											)}
										/>
										<span className="flex flex-col gap-0.5">
											<span className="text-text text-[17px] font-bold">
												{t(`sections.${key}.points.${point}.title`)}
											</span>
											<span className="text-text-muted text-base">
												{t(`sections.${key}.points.${point}.body`)}
											</span>
										</span>
									</li>
								))}
							</ul>
						</div>
						<Device>{pictures[key]}</Device>
					</section>
				))}
			</div>
			<ClosingBand />
		</main>
	)
}
