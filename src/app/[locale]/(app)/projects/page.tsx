import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { PlusIcon } from '@/components/ui/icons'
import { emphasis } from '@/components/site/display'
import { Link } from '@/i18n/routing'
import { ProjectGrid } from './project-grid'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.projects')
	return { title: t('title') }
}

export default async function ProjectsPage() {
	const t = await getTranslations('Site.projects')
	return (
		<main className="mx-auto flex w-full max-w-[1176px] flex-col gap-8 px-5 pt-12 pb-20">
			<div className="rt-rise flex flex-wrap items-end justify-between gap-5">
				<div className="flex flex-col gap-2">
					<h1 className="text-text font-display text-[clamp(48px,5vw,64px)] leading-none font-medium tracking-[-0.02em]">
						{t.rich('heading', { em: emphasis('gradient') })}
					</h1>
					<p className="text-text-muted text-[17px]">{t('description')}</p>
				</div>
				<Button asChild size="lg">
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
