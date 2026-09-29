import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

export default function HomePage() {
	const t = useTranslations('HomePage')

	return (
		<main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
			<h1 className="text-text text-3xl font-semibold">{t('title')}</h1>
			<p className={cn('text-text-muted', 'text-base')}>{t('description')}</p>
		</main>
	)
}
