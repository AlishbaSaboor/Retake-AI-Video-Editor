import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MakeIt } from './make-it'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Make')
	return { title: t('metaTitle') }
}

export default async function MakePage() {
	const t = await getTranslations('Make')
	return (
		<main className="relative flex flex-1 flex-col">
			<div className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-14 md:py-20">
				<div className="flex flex-col gap-3 text-center">
					<h1 className="font-display text-text text-4xl font-bold tracking-tight text-balance md:text-5xl">
						{t('title')}
					</h1>
					<p className="text-text-muted text-lg text-pretty">{t('description')}</p>
				</div>
				<MakeIt />
			</div>
		</main>
	)
}
