import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'

const FOOTER_LINKS = [
	{ href: '/features', key: 'features' },
	{ href: '/how-it-works', key: 'howItWorks' },
	{ href: '/pricing', key: 'pricing' },
	{ href: '/contact', key: 'contactFaq' },
	{ href: '/privacy', key: 'privacy' }
] as const

/** The brand's four colours, as dots at the foot of every page. */
const DOTS = ['bg-brand-violet', 'bg-brand-purple', 'bg-brand-blue', 'bg-brand-lilac'] as const

export async function SiteFooter() {
	const t = await getTranslations('Site')
	return (
		<footer className="border-border mt-16 border-t">
			<div className="mx-auto flex max-w-[1160px] flex-col gap-8 px-5 pt-10 pb-12 md:px-0">
				<div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
					<div className="flex max-w-[300px] flex-col gap-1">
						<span className="text-text font-serif text-[34px] leading-tight">Retake</span>
						<p className="text-text-muted text-[15px] leading-6">{t('footer.tagline')}</p>
					</div>
					<nav aria-label={t('footer.label')} className="-mx-2.5 flex flex-wrap">
						{FOOTER_LINKS.map(({ href, key }) => (
							<Link
								key={href}
								href={href}
								className="text-text hover:text-accent-fg focus-visible:outline-accent inline-flex h-11 items-center rounded-lg px-2.5 text-[15px] font-semibold transition-colors focus-visible:outline-2"
							>
								{t(`nav.${key}`)}
							</Link>
						))}
					</nav>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-text-faint text-sm">
						{t('footer.copyright', { year: new Date().getFullYear() })}
					</span>
					<span aria-hidden className="flex gap-1.5">
						{DOTS.map((dot) => (
							<span key={dot} className={`${dot} size-3.5 rounded-full`} />
						))}
					</span>
				</div>
			</div>
		</footer>
	)
}
