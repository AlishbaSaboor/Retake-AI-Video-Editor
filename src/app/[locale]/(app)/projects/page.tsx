import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { PlusIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/routing'
import { ProjectGrid } from './project-grid'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.projects')
	return { title: t('title') }
}

export default async function ProjectsPage() {
	const t = await getTranslations('Site.projects')
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 md:px-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-display text-text text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-text-muted">{t('description')}</p>
				</div>
				<Button asChild>
					<Link href="/home">
						<PlusIcon />
						{t('new')}
					</Link>
				</Button>
			</div>
			<ProjectGrid />
		</main>
	)
}
