import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon } from '@/components/ui/icons'
import { EditorPreview } from '@/components/site/editor-preview'
import {
	FaqSection,
	FeaturesSummary,
	HowItWorksSummary,
	SectionHeading
} from '@/components/site/landing-sections'
import { RetakeDemo } from '@/components/site/retake-demo'
import { Link } from '@/i18n/routing'

// Who Retake is for: recordings people already have.
const AUDIENCE = ['teach', 'demo', 'talk', 'team'] as const

/** The Start a project button: the one way in, wherever it shows on the page. */
async function StartButton() {
	const t = await getTranslations('Site.landing')
	return (
		<Button asChild size="lg">
			<Link href="/home">
				{t('start')}
				<ArrowRightIcon />
			</Link>
		</Button>
	)
}

export default async function LandingPage() {
	const t = await getTranslations('Site.landing')
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
							<StartButton />
							<Button asChild size="lg" variant="outline">
								<Link href="/how-it-works">{t('howItWorks')}</Link>
							</Button>
						</div>
					</div>
					<EditorPreview />
				</div>
			</section>

			<div className="mx-auto flex max-w-6xl flex-col gap-24 px-4 py-20 md:px-6">
				<HowItWorksSummary />

				<section
					aria-labelledby="demo"
					className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]"
				>
					<SectionHeading
						id="demo"
						eyebrow={t('demo.eyebrow')}
						title={t('demo.title')}
						description={t('demo.body')}
					/>
					<RetakeDemo />
				</section>

				<FeaturesSummary />

				<section aria-labelledby="audience" className="flex flex-col gap-8">
					<SectionHeading
						id="audience"
						eyebrow={t('audience.eyebrow')}
						title={t('audience.title')}
					/>
					<ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
						{AUDIENCE.map((key) => (
							<li key={key} className="border-border flex flex-col gap-1 border-t pt-4">
								<h3 className="text-text font-semibold">{t(`audience.${key}.title`)}</h3>
								<p className="text-text-muted text-sm leading-relaxed">
									{t(`audience.${key}.body`)}
								</p>
							</li>
						))}
					</ul>
				</section>

				<section
					aria-labelledby="start"
					className="border-border bg-surface flex flex-col items-start gap-5 rounded-lg border p-8 md:flex-row md:items-center md:justify-between md:p-10"
				>
					<div className="flex max-w-xl flex-col gap-2">
						<h2
							id="start"
							className="font-display text-text text-2xl font-bold tracking-tight md:text-3xl"
						>
							{t('closing.title')}
						</h2>
						<p className="text-text-muted">{t('closing.body')}</p>
					</div>
					<StartButton />
				</section>

				<FaqSection />
			</div>
		</main>
	)
}
