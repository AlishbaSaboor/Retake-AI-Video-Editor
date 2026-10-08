import { getTranslations } from 'next-intl/server'
import { ArrowRightIcon } from '@/components/ui/icons'
import { ClosingBand } from '@/components/site/closing-band'
import { DisplayHeading } from '@/components/site/display'
import { HeroDemo } from '@/components/site/hero-demo'
import {
	DayNightSection,
	MakeSection,
	PromisesSection,
	StorySection
} from '@/components/site/landing-sections'
import { Link } from '@/i18n/routing'

export default async function LandingPage() {
	const t = await getTranslations('Site.landing')
	return (
		<main>
			<section className="relative -mt-[76px] overflow-hidden px-5 pt-[clamp(130px,14vw,200px)]">
				{/* The glow, the two coloured lights and a faint grid behind the heading. */}
				<div aria-hidden className="pointer-events-none absolute inset-0">
					<div className="absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--glow-violet),transparent_70%)]" />
					<div className="bg-orb-violet absolute top-[30%] -left-40 size-[520px] rounded-full opacity-60 blur-[110px]" />
					<div className="bg-orb-blue absolute top-[45%] -right-40 size-[480px] rounded-full opacity-50 blur-[110px]" />
					<div className="absolute inset-x-0 top-0 h-[760px] bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] mask-[radial-gradient(60%_60%_at_50%_30%,black,transparent)] bg-size-[64px_64px] opacity-60" />
				</div>
				<div className="rt-rise relative mx-auto flex max-w-[980px] flex-col items-center gap-7 text-center">
					<DisplayHeading as="h1" size="hero">
						{t.rich('title', {
							em: (chunks) => <em className="text-gradient rt-sheen block italic">{chunks}</em>
						})}
					</DisplayHeading>
					<p className="text-text-muted max-w-[600px] text-[clamp(17px,1.6vw,20px)] leading-[1.6] text-pretty">
						{t('description')}
					</p>
					<div className="flex flex-wrap justify-center gap-3">
						<Link
							href="/home"
							className="rt-btn bg-contrast text-contrast-ink focus-visible:outline-accent inline-flex h-[58px] items-center gap-2.5 rounded-full px-7 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
						>
							{t('start')}
							<ArrowRightIcon size={18} />
						</Link>
						<a
							href="#story"
							className="border-border-strong bg-glass text-text hover:bg-surface-hover focus-visible:outline-accent inline-flex h-[58px] items-center rounded-full border px-6 text-base font-semibold backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
						>
							{t('story')}
						</a>
					</div>
				</div>
				<div className="rt-rise relative mt-16 [animation-delay:0.15s]">
					<HeroDemo />
				</div>
				<div aria-hidden className="relative mt-14 flex flex-col items-center gap-2">
					<span className="text-text-faint text-xs font-bold tracking-[0.22em] uppercase">
						{t('scroll')}
					</span>
					<span className="border-border-strong flex h-8 w-5 justify-center rounded-full border pt-1.5">
						<span className="rt-scrollhint bg-text-muted h-2 w-1 rounded-full" />
					</span>
				</div>
			</section>
			<StorySection />
			<MakeSection />
			<PromisesSection />
			<DayNightSection />
			<ClosingBand />
		</main>
	)
}
