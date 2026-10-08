import { getTranslations } from 'next-intl/server'
import {
	AiIcon,
	ArrowRightIcon,
	ChevronDownIcon,
	MicIcon,
	SplitIcon,
	TextIcon
} from '@/components/ui/icons'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'

// The site's sections. How it works and Features each come in two sizes: a
// short summary on the landing page, linking to its own page, and the whole
// thing on that page. One wording for each, wherever it shows.

export const STEPS = ['start', 'read', 'ask', 'hand', 'rerecord', 'export'] as const
const PRIVACY = ['browser', 'speech', 'commands'] as const

export const FEATURES = [
	{ key: 'ai', icon: AiIcon, points: 8 },
	{ key: 'timeline', icon: SplitIcon, points: 6 },
	{ key: 'graphics', icon: TextIcon, points: 6 },
	{ key: 'rerecord', icon: MicIcon, points: 4 }
] as const

const QUESTIONS = ['what', 'byHand', 'rerecord', 'add', 'privacy', 'saved', 'export'] as const

/** A section's heading block: an h1 when the section is the page, an h2 on the landing page. */
export function SectionHeading({
	id,
	level = 2,
	eyebrow,
	title,
	description
}: {
	id: string
	level?: 1 | 2
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

/** A link on to a section's own page. */
function MoreLink({ href, children }: { href: '/how-it-works' | '/features'; children: string }) {
	return (
		<Link
			href={href}
			className="text-accent focus-visible:outline-accent inline-flex items-center gap-1.5 self-start rounded text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
		>
			{children}
			<ArrowRightIcon size={14} />
		</Link>
	)
}

/** How it works, in short: each step in a line, and a link to the whole page. */
export async function HowItWorksSummary() {
	const t = await getTranslations('Site.howItWorks')
	return (
		<section aria-labelledby="how-it-works" className="flex flex-col gap-8">
			<SectionHeading id="how-it-works" eyebrow={t('eyebrow')} title={t('title')} />
			<ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
				{STEPS.map((step, index) => (
					<li key={step} className="border-border flex gap-3 border-t pt-4">
						<span className="text-accent font-mono text-sm">{index + 1}</span>
						<div className="flex flex-col gap-1">
							<h3 className="text-text font-semibold">{t(`steps.${step}.title`)}</h3>
							<p className="text-text-muted text-sm leading-relaxed">
								{t(`steps.${step}.summary`)}
							</p>
						</div>
					</li>
				))}
			</ol>
			<MoreLink href="/how-it-works">{t('more')}</MoreLink>
		</section>
	)
}

/** How it works, in full: every step, and what leaves your computer. The page's own content. */
export async function HowItWorksFull() {
	const t = await getTranslations('Site.howItWorks')
	return (
		<div className="flex flex-col gap-16">
			<SectionHeading
				id="how-it-works"
				level={1}
				eyebrow={t('eyebrow')}
				title={t('title')}
				description={t('description')}
			/>
			<ol className="flex flex-col gap-4">
				{STEPS.map((step, index) => (
					<li
						key={step}
						className="border-border bg-surface grid gap-3 rounded-lg border p-6 md:grid-cols-[3rem_minmax(0,1fr)]"
					>
						<span className="text-accent font-mono text-lg">{index + 1}</span>
						<div className="flex max-w-2xl flex-col gap-2">
							<h2 className="font-display text-text text-xl font-semibold">
								{t(`steps.${step}.title`)}
							</h2>
							<p className="text-text-muted leading-relaxed">{t(`steps.${step}.body`)}</p>
						</div>
					</li>
				))}
			</ol>
			<section aria-labelledby="privacy" className="flex flex-col gap-6">
				<h2 id="privacy" className="font-display text-text text-2xl font-bold tracking-tight">
					{t('privacy.title')}
				</h2>
				<dl className="grid gap-6 md:grid-cols-3">
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
		</div>
	)
}

/** Features, in short: the four parts in a line each, and a link to the whole page. */
export async function FeaturesSummary() {
	const t = await getTranslations('Site.features')
	return (
		<section aria-labelledby="features" className="flex flex-col gap-8">
			<SectionHeading id="features" eyebrow={t('eyebrow')} title={t('title')} />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{FEATURES.map(({ key, icon: Icon }) => (
					<div
						key={key}
						className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-5"
					>
						<span className="text-accent">
							<Icon size={20} />
						</span>
						<h3 className="text-text font-semibold">{t(`items.${key}.title`)}</h3>
						<p className="text-text-muted text-sm leading-relaxed">{t(`items.${key}.summary`)}</p>
					</div>
				))}
			</div>
			<MoreLink href="/features">{t('more')}</MoreLink>
		</section>
	)
}

/** Features, in full: each part with what it covers. The page's own content. */
export async function FeaturesFull() {
	const t = await getTranslations('Site.features')
	return (
		<div className="flex flex-col gap-12">
			<SectionHeading
				id="features"
				level={1}
				eyebrow={t('eyebrow')}
				title={t('title')}
				description={t('description')}
			/>
			<div className="grid gap-4 md:grid-cols-2">
				{FEATURES.map(({ key, icon: Icon, points }) => (
					<section
						key={key}
						aria-labelledby={`feature-${key}`}
						className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-6"
					>
						<span className="text-accent">
							<Icon size={22} />
						</span>
						<div className="flex flex-col gap-2">
							<h2 id={`feature-${key}`} className="font-display text-text text-xl font-semibold">
								{t(`items.${key}.title`)}
							</h2>
							<p className="text-text-muted leading-relaxed">{t(`items.${key}.summary`)}</p>
						</div>
						<ul className="text-text-muted flex flex-col gap-2 text-sm leading-relaxed">
							{Array.from({ length: points }, (_, index) => (
								<li key={index} className="flex gap-2.5">
									<span aria-hidden className="bg-accent mt-2 size-1 shrink-0 rounded-full" />
									{t(`items.${key}.points.${index}`)}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	)
}

/** Frequently asked questions: each a row that opens its answer below it, and closes again. */
export async function FaqSection() {
	const t = await getTranslations('Site.faq')
	return (
		<section aria-labelledby="faq" className="flex flex-col gap-8">
			<SectionHeading id="faq" eyebrow={t('eyebrow')} title={t('title')} />
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
