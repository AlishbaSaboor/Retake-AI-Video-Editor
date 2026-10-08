import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { emphasis } from '@/components/site/display'
import { RecentProjects } from './recent-projects'
import { StartBox } from './start-box'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.home')
	return { title: t('metaTitle') }
}

export default async function HomePage() {
	const t = await getTranslations('Site.home')
	return (
		<main className="mx-auto flex w-full max-w-[1156px] flex-col gap-12 px-5 pt-14 pb-20">
			<div className="rt-rise flex flex-col items-center gap-3 text-center">
				<p className="text-text-muted text-[15px] font-bold">{t('welcome')}</p>
				<h1 className="text-text font-serif text-[clamp(48px,6vw,76px)] leading-[0.98] tracking-[-0.02em] text-balance">
					{t.rich('title', { em: emphasis('gradient') })}
				</h1>
				<p className="text-text-muted text-[17px] text-pretty">{t('description')}</p>
			</div>
			<div className="rt-rise [animation-delay:0.1s]">
				<StartBox />
				<RecentProjects />
			</div>
		</main>
	)
}
