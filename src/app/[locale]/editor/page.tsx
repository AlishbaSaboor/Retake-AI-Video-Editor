import { useTranslations } from 'next-intl'
import { VideoEditor } from './video-editor'

export default function EditorPage() {
	const t = useTranslations('Editor')

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
			<h1 className="text-text text-lg font-bold tracking-tight">{t('title')}</h1>
			<VideoEditor />
		</main>
	)
}
