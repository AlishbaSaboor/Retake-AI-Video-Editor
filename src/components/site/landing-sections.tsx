import { getTranslations } from 'next-intl/server'
import { AiIcon, ChevronDownIcon, MicIcon, SplitIcon, TextIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

// The landing page's sections, also the How it works and Features pages on
// their own: one wording for each, wherever it shows.

const STEPS = ['add', 'ask', 'hand', 'export'] as const

const FEATURES = [
	{ key: 'ai', icon: AiIcon },
	{ key: 'timeline', icon: SplitIcon },
	{ key: 'graphics', icon: TextIcon },
	{ key: 'rerecord', icon: MicIcon }
] as const

const QUESTIONS = ['what', 'byHand', 'rerecord', 'add', 'privacy', 'saved', 'export'] as const

/** A section's heading: an h1 when the section is the page, an h2 on the landing page. */
function Heading({
	id,
	level,
	eyebrow,
	title,
	description
}: {
	id: string
	level: 1 | 2
	eyebrow: string
	title: string
	description?: string
}) {
	const Tag = level === 1 ? 'h1' : 'h2'
	return (
		<div className="flex max-w-2xl flex-col gap-3">
			<p className="text-accent font-mono text-xs font-medium tracking-widest uppercase">
				{eyebrow}
			</p>
			<Tag
				id={id}
				className={cn(
					'font-display text-text font-bold tracking-tight text-balance',
					level === 1 ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl'
				)}
			>
				{title}
			</Tag>
			{description && <p className="text-text-muted leading-relaxed text-pretty">{description}</p>}
		</div>
	)
}

/** How it works: four steps, in order. */
export async function HowItWorksSection({ level = 2 }: { level?: 1 | 2 }) {
	const t = await getTranslations('Site.howItWorks')
	return (
		<section aria-labelledby="how-it-works" className="flex flex-col gap-8">
			<Heading id="how-it-works" level={level} eyebrow={t('eyebrow')} title={t('title')} />
			<ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{STEPS.map((step, index) => (
					<li key={step} className="border-border flex flex-col gap-2 border-t pt-4">
						<span className="text-accent font-mono text-sm">{index + 1}</span>
						<h3 className="text-text font-semibold">{t(`steps.${step}.title`)}</h3>
						<p className="text-text-muted text-sm leading-relaxed">{t(`steps.${step}.body`)}</p>
					</li>
				))}
			</ol>
		</section>
	)
}

/** Features: what Retake does, in four parts. */
export async function FeaturesSection({ level = 2 }: { level?: 1 | 2 }) {
	const t = await getTranslations('Site.features')
	return (
		<section aria-labelledby="features" className="flex flex-col gap-8">
			<Heading id="features" level={level} eyebrow={t('eyebrow')} title={t('title')} />
			<div className="grid gap-4 sm:grid-cols-2">
				{FEATURES.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-6"
					>
						<span className="text-accent">
							<Icon size={20} />
						</span>
						<h3 className="text-text font-semibold">{t(`items.${key}.title`)}</h3>
						<p className="text-text-muted text-sm leading-relaxed">{t(`items.${key}.body`)}</p>
					</div>
				))}
			</div>
		</section>
	)
}

/** Frequently asked questions: each a row that opens its answer below it, and closes again. */
export async function FaqSection() {
	const t = await getTranslations('Site.faq')
	return (
		<section aria-labelledby="faq" className="flex flex-col gap-8">
			<Heading id="faq" level={2} eyebrow={t('eyebrow')} title={t('title')} />
			<div className="border-border flex flex-col border-t">
				{QUESTIONS.map((key) => (
					<details key={key} className="group border-border border-b">
						<summary className="text-text hover:text-accent focus-visible:outline-accent flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
							{t(`items.${key}.question`)}
							<ChevronDownIcon className="text-text-faint shrink-0 transition-transform group-open:rotate-180" />
						</summary>
						<p className="text-text-muted max-w-2xl pb-5 text-sm leading-relaxed">
							{t(`items.${key}.answer`)}
						</p>
					</details>
				))}
			</div>
		</section>
	)
}
