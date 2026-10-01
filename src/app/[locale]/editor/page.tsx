import { useTranslations } from 'next-intl'
import { VideoEditor } from './video-editor'

export default function EditorPage() {
	const t = useTranslations('Editor')

	return (
		<main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
			<h1 className="text-text text-2xl font-semibold">{t('title')}</h1>
			<VideoEditor />
		</main>
	)
}
