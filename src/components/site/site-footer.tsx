import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { Logo } from './logo'

export async function SiteFooter() {
	const t = await getTranslations('Site')
	return (
		<footer className="border-border border-t">
			<div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
				<div className="flex flex-col gap-2">
					<Logo />
					<p className="text-text-muted max-w-sm text-sm">{t('footer.tagline')}</p>
				</div>
				<nav aria-label={t('footer.label')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<Link href="/how-it-works" className="text-text-muted hover:text-text">
						{t('nav.howItWorks')}
					</Link>
					<Link href="/features" className="text-text-muted hover:text-text">
						{t('nav.features')}
					</Link>
					<Link href="/contact" className="text-text-muted hover:text-text">
						{t('nav.contact')}
					</Link>
					<Link href="/login" className="text-text-muted hover:text-text">
						{t('nav.signIn')}
					</Link>
				</nav>
			</div>
		</footer>
	)
}
