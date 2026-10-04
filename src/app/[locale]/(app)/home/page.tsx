import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProjectsIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/routing'
import { StartBox } from './start-box'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.home')
	return { title: t('metaTitle') }
}

export default async function HomePage() {
	const t = await getTranslations('Site.home')
	return (
		<main className="relative flex flex-1 flex-col">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-soft),transparent)]"
			/>
			<div className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16 md:py-24">
				<div className="flex flex-col gap-3 text-center">
					<h1 className="font-display text-text text-4xl font-bold tracking-tight text-balance md:text-5xl">
						{t('title')}
					</h1>
					<p className="text-text-muted text-lg text-pretty">{t('description')}</p>
				</div>
				<StartBox />
				<Link
					href="/projects"
					className="text-text-muted hover:text-text focus-visible:outline-accent inline-flex items-center gap-2 self-center rounded-lg px-2 py-1 text-sm focus-visible:outline-2"
				>
					<ProjectsIcon />
					{t('openSaved')}
				</Link>
			</div>
		</main>
	)
}
