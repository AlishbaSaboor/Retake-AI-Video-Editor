import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
	AiIcon,
	CleanupIcon,
	EditIcon,
	NoiseIcon,
	ProjectsIcon,
	SplitIcon,
	VideoIcon
} from '@/components/ui/icons'
import { PageIntro } from '@/components/site/page-intro'

// Each group and how many items it lists (messages: Site.features.groups.<key>.items.<n>).
const GROUPS = [
	{ key: 'commands', icon: AiIcon, items: 3 },
	{ key: 'cut', icon: CleanupIcon, items: 4 },
	{ key: 'clips', icon: SplitIcon, items: 4 },
	{ key: 'picture', icon: VideoIcon, items: 4 },
	{ key: 'graphics', icon: EditIcon, items: 4 },
	{ key: 'sound', icon: NoiseIcon, items: 4 },
	{ key: 'projects', icon: ProjectsIcon, items: 3 }
] as const

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.features')
	return { title: t('metaTitle') }
}

export default async function FeaturesPage() {
	const t = await getTranslations('Site.features')
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16 md:px-6 md:py-20">
			<PageIntro eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{GROUPS.map(({ key, icon: Icon, items }) => (
					<section
						key={key}
						aria-labelledby={`feature-${key}`}
						className="border-border bg-surface hover:border-border-strong flex flex-col gap-4 rounded-lg border p-6 transition-colors"
					>
						<span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-lg">
							<Icon size={20} />
						</span>
						<h2 id={`feature-${key}`} className="font-display text-text text-lg font-semibold">
							{t(`groups.${key}.title`)}
						</h2>
						<ul className="text-text-muted flex flex-col gap-2 text-sm leading-relaxed">
							{Array.from({ length: items }, (_, index) => (
								<li key={index} className="flex gap-2">
									<span aria-hidden className="bg-accent mt-2 size-1 shrink-0 rounded-full" />
									{t(`groups.${key}.items.${index}`)}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}
