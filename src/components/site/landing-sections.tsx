import { getTranslations } from 'next-intl/server'
import { PlusIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { AppScreen } from './app-screen'
import { CompareSlider } from './compare-slider'
import { DisplayHeading, Eyebrow, emphasis } from './display'
import { MakeShowcase } from './make-showcase'
import { StoryScroller } from './story-scroller'

// The landing page's sections below the hero, and the questions shown on
// the contact page. Each wording lives in messages/en.json (Site.*).

/** The five scenes, and which picture of the app goes with each. */
const STORY = [
	{ id: 'bring', screen: 0 },
	{ id: 'say', screen: 1 },
	{ id: 'tidy', screen: 2 },
	{ id: 'yours', screen: 1 },
	{ id: 'share', screen: 3 }
] as const
const STORY_SCREENS = ['transcript', 'assistant', 'cleanup', 'highlights'] as const

export async function StorySection() {
	const t = await getTranslations('Site.landing')
	return (
		<section
			id="story"
			aria-labelledby="story-title"
			className="mx-auto max-w-[1160px] scroll-mt-24 px-5 pt-24 xl:px-0"
		>
			<div className="rt-reveal mx-auto flex max-w-[760px] flex-col items-center gap-3.5 pb-16 text-center">
				<Eyebrow>{t('storyEyebrow')}</Eyebrow>
				<DisplayHeading id="story-title">
					{t.rich('storyTitle', { em: emphasis('accent') })}
				</DisplayHeading>
			</div>
			<StoryScroller
				label={t('storySteps')}
				steps={STORY.map(({ id, screen }) => ({
					id,
					screen,
					label: t(`steps.${id}.label`),
					title: t(`steps.${id}.title`),
					body: t(`steps.${id}.body`),
					pill: t(`steps.${id}.pill`)
				}))}
				screens={STORY_SCREENS.map((panel) => (
					<AppScreen key={panel} panel={panel} id={`story-${panel}`} className="rounded-[18px]" />
				))}
			/>
		</section>
	)
}

const MAKE_STYLES = ['reel', 'funny', 'professional', 'ad'] as const

export async function MakeSection() {
	const t = await getTranslations('Site.landing.make')
	return (
		<section
			aria-labelledby="make-title"
			className="rt-reveal mx-auto max-w-[1160px] px-5 pt-32 xl:px-0"
		>
			<MakeShowcase
				heading={
					<div className="flex max-w-[620px] flex-col gap-3.5">
						<Eyebrow>{t('eyebrow')}</Eyebrow>
						<DisplayHeading id="make-title" className="text-[clamp(40px,5vw,68px)]">
							{t.rich('title', { em: emphasis('plain') })}
						</DisplayHeading>
					</div>
				}
				stylesLabel={t('styles')}
				before={t('before')}
				compare={t('compare')}
				styles={MAKE_STYLES.map((id) => ({
					id,
					tab: t(`tabs.${id}`),
					after: t(`after.${id}`),
					card: t.rich(`cards.${id}`, { em: emphasis('plain') }),
					said: t('said', { request: t(`requests.${id}`) })
				}))}
			/>
		</section>
	)
}

const PROMISES = [
	{ key: 'ask', numeral: 'i', colour: 'text-brand-purple' },
	{ key: 'undo', numeral: 'ii', colour: 'text-brand-blue' },
	{ key: 'browser', numeral: 'iii', colour: 'text-brand-lilac' }
] as const

export async function PromisesSection() {
	const t = await getTranslations('Site.landing.promises')
	return (
		<section aria-labelledby="promises" className="mx-auto max-w-[1160px] px-5 pt-32 xl:px-0">
			<Eyebrow as="h2" className="mb-10 text-center">
				<span id="promises">{t('eyebrow')}</span>
			</Eyebrow>
			<ol className="border-border border-t">
				{PROMISES.map(({ key, numeral, colour }) => (
					<li
						key={key}
						className="rt-reveal border-border grid gap-3 border-b py-10 md:grid-cols-[96px_minmax(0,1fr)_minmax(0,400px)] md:items-baseline md:gap-6"
					>
						<span aria-hidden className={cn('font-serif text-[34px] italic', colour)}>
							{numeral}
						</span>
						<h3 className="text-text font-serif text-[clamp(34px,4.4vw,60px)] leading-[1.05] tracking-[-0.01em]">
							{t(`items.${key}.title`)}
						</h3>
						<p className="text-text-muted text-[17px] leading-[1.6]">{t(`items.${key}.body`)}</p>
					</li>
				))}
			</ol>
		</section>
	)
}

export async function DayNightSection() {
	const t = await getTranslations('Site.landing.dayNight')
	return (
		<section aria-labelledby="day-night" className="mx-auto max-w-[1060px] px-5 pt-32 xl:px-0">
			<div className="rt-reveal mb-12 flex flex-col items-center gap-3.5 text-center">
				<Eyebrow>{t('eyebrow')}</Eyebrow>
				<DisplayHeading id="day-night" className="text-[clamp(40px,5vw,68px)]">
					{t.rich('title', { em: emphasis('plain') })}
				</DisplayHeading>
			</div>
			<CompareSlider
				label={t('compare')}
				className="rt-reveal aspect-[1440/930] rounded-[22px] shadow-(--shadow-card)"
				before={
					<div data-theme="dark" className="size-full">
						<AppScreen panel="assistant" id="night" className="rounded-none border-0" />
					</div>
				}
				after={
					<div data-theme="light" className="size-full">
						<AppScreen panel="assistant" id="day" className="rounded-none border-0" />
					</div>
				}
			/>
		</section>
	)
}

const QUESTIONS = [
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

/** The questions: each a row that opens its answer below it, and closes it again. */
export async function FaqSection() {
	const t = await getTranslations('Site.faq')
	return (
		<section aria-labelledby="faq" className="mx-auto w-full max-w-[860px] px-5 pt-28">
			<DisplayHeading id="faq" size="small" className="mb-10 text-center">
				{t.rich('title', { em: emphasis('plain') })}
			</DisplayHeading>
			<div className="border-border border-t">
				{QUESTIONS.map((key) => (
					<details key={key} className="group border-border border-b">
						<summary className="text-text focus-visible:outline-accent flex cursor-pointer list-none items-center justify-between gap-6 py-[22px] font-serif text-[clamp(22px,2.4vw,28px)] leading-tight focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
							{t(`items.${key}.question`)}
							<span
								aria-hidden
								className="bg-surface-hover text-text group-open:bg-contrast group-open:text-contrast-ink flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
							>
								<PlusIcon
									size={16}
									className="transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none"
								/>
							</span>
						</summary>
						<p className="text-text-muted max-w-[790px] pb-6 text-[16px] leading-[1.7]">
							{t(`items.${key}.answer`)}
						</p>
					</details>
				))}
			</div>
		</section>
	)
}
