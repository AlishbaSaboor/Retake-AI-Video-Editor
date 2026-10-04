import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import {
	AiIcon,
	ArrowRightIcon,
	CleanupIcon,
	MicIcon,
	ProjectsIcon,
	SplitIcon
} from '@/components/ui/icons'
import { EditorPreview } from '@/components/site/editor-preview'
import { Link } from '@/i18n/routing'

const HIGHLIGHTS = [
	{ key: 'type', icon: AiIcon },
	{ key: 'cleanup', icon: CleanupIcon },
	{ key: 'rerecord', icon: MicIcon },
	{ key: 'hand', icon: SplitIcon },
	{ key: 'saved', icon: ProjectsIcon }
] as const

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
							<Button asChild size="lg">
								<Link href="/home">
									{t('start')}
									<ArrowRightIcon />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link href="/how-it-works">{t('howItWorks')}</Link>
							</Button>
						</div>
					</div>
					<EditorPreview />
				</div>
			</section>

			<section className="border-border bg-surface-inset border-y">
				<div className="mx-auto grid max-w-6xl gap-px px-4 py-14 sm:grid-cols-2 md:px-6 lg:grid-cols-5">
					{HIGHLIGHTS.map(({ key, icon: Icon }) => (
						<div key={key} className="flex flex-col gap-3 p-4">
							<span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-lg">
								<Icon size={20} />
							</span>
							<h2 className="text-text font-semibold">{t(`highlights.${key}.title`)}</h2>
							<p className="text-text-muted text-sm leading-relaxed">
								{t(`highlights.${key}.body`)}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center md:px-6">
				<h2 className="font-display text-text max-w-2xl text-3xl font-bold tracking-tight text-balance md:text-4xl">
					{t('closing.title')}
				</h2>
				<p className="text-text-muted max-w-xl text-pretty">{t('closing.body')}</p>
				<div className="flex flex-wrap justify-center gap-3">
					<Button asChild size="lg">
						<Link href="/home">
							{t('start')}
							<ArrowRightIcon />
						</Link>
					</Button>
					<Button asChild size="lg" variant="ghost">
						<Link href="/features">{t('seeFeatures')}</Link>
					</Button>
				</div>
			</section>
		</main>
	)
}
