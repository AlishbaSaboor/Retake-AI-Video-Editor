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
		<main className="mx-auto flex w-full max-w-[1160px] flex-col gap-[clamp(28px,4vw,48px)] px-[clamp(16px,4vw,40px)] pt-[clamp(32px,6vw,72px)] pb-[72px]">
			<div className="rt-rise flex flex-col">
				<p className="text-text-faint font-mono text-[11.5px] tracking-[0.08em] uppercase">
					{t('welcome')}
				</p>
				<h1 className="text-text mt-3 text-[clamp(36px,4.4vw,60px)] leading-[1.02] tracking-[-0.03em]">
					{t.rich('title', { em: emphasis('plain') })}
				</h1>
				<p className="text-text-muted mt-3.5 max-w-[52ch] text-base">{t('description')}</p>
			</div>
			<div className="rt-rise [animation-delay:0.1s]">
				<StartBox />
				<RecentProjects />
			</div>
		</main>
	)
}
