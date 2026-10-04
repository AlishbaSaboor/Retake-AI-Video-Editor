import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { authConfigured } from '@/server/auth/session'
import { LoginForm } from './login-form'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Site.login')
	return { title: t('metaTitle') }
}

export default async function LoginPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string | string[] }>
}) {
	const { next } = await searchParams
	const t = await getTranslations('Site.login')
	return (
		<main className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-2">
			<div className="hidden flex-col gap-4 lg:flex">
				<p className="text-accent font-mono text-xs font-medium tracking-widest uppercase">
					{t('eyebrow')}
				</p>
				<p className="font-display text-text text-4xl font-bold tracking-tight text-balance">
					{t('pitch')}
				</p>
				<p className="text-text-muted text-lg">{t('pitchBody')}</p>
			</div>
			<LoginForm next={typeof next === 'string' ? next : null} enabled={authConfigured()} />
		</main>
	)
}
