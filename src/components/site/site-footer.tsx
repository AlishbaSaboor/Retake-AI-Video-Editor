import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'

const FOOTER_LINKS = [
	{ href: '/#features', key: 'features' },
	{ href: '/#how-it-works', key: 'howItWorks' },
	{ href: '/#faq', key: 'faq' },
	{ href: '/privacy', key: 'privacy' }
] as const

/** One line under a thin rule: the copyright and the site's pages. */
export async function SiteFooter() {
	const t = await getTranslations('Site')
	return (
		<footer className="border-border relative z-[1] border-t">
			<div className="text-text-faint mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-3 px-[clamp(16px,4vw,48px)] py-[26px] text-sm">
				<span>{t('footer.copyright', { year: new Date().getFullYear() })}</span>
				<nav aria-label={t('footer.label')} className="-mx-2 flex flex-wrap">
					{FOOTER_LINKS.map(({ href, key }) => (
						<Link
							key={href}
							href={href}
							className="text-text-muted hover:text-text focus-visible:outline-accent inline-flex h-11 items-center rounded-lg px-2 transition-colors focus-visible:outline-2"
						>
							{t(`nav.${key}`)}
						</Link>
					))}
				</nav>
			</div>
		</footer>
	)
}
