import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { VideoEditor } from './video-editor'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Editor')
	return { title: t('title') }
}

export default async function EditorPage({
	searchParams
}: {
	searchParams: Promise<{ project?: string | string[] }>
}) {
	const { project } = await searchParams
	const t = await getTranslations('Editor')
	const projectId = typeof project === 'string' ? project : null

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">
			<h1 className="sr-only">{t('title')}</h1>
			<VideoEditor key={projectId ?? 'new'} openProjectId={projectId} />
		</main>
	)
}
