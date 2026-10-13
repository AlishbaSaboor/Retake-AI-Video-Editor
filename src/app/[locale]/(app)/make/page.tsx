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
		<main className="mx-auto flex w-full max-w-[880px] flex-col px-[clamp(16px,4vw,40px)] pt-[clamp(28px,5vw,56px)] pb-[72px]">
			<MakeIt
				heading={
					<div className="rt-rise flex flex-col gap-2.5">
						<h1 className="text-text text-[clamp(34px,4.4vw,58px)] leading-[1.02] tracking-[-0.03em]">
							{t.rich('title', { em: emphasis('plain') })}
						</h1>
						<p className="text-text-muted max-w-[56ch] text-[16.5px]">{t('description')}</p>
					</div>
				}
			/>
		</main>
	)
}
