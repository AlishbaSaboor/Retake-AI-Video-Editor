import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { emphasis } from '@/components/site/display'
import { MakeIt } from './make-it'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Make')
	return { title: t('metaTitle') }
}

export default async function MakePage() {
	const t = await getTranslations('Make')
	return (
		<main className="mx-auto flex w-full max-w-[1000px] flex-col px-5 pt-10 pb-20">
			<MakeIt
				heading={
					<div className="rt-rise flex flex-col items-center gap-3 text-center">
						<h1 className="text-text font-serif text-[clamp(48px,6vw,76px)] leading-none tracking-[-0.02em]">
							{t.rich('title', { em: emphasis('gradient') })}
						</h1>
						<p className="text-text-muted max-w-[620px] text-[17px] leading-relaxed text-pretty">
							{t('description')}
						</p>
					</div>
				}
			/>
		</main>
	)
}
