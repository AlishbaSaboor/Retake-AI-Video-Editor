import { getTranslations } from 'next-intl/server'
import { MenuIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link } from '@/i18n/routing'
import { Logo } from './logo'
import { MobileMenu } from './mobile-menu'
import { NavLinks } from './nav-links'

const PUBLIC_LINKS = [
	{ href: '/#features', key: 'features' },
	{ href: '/#how-it-works', key: 'howItWorks' },
	{ href: '/#faq', key: 'faq' }
] as const

/**
 * The public pages' top bar: a floating glass pill with the logo, the
 * site's pages (the one you're on marked), the theme switch and Open
 * Retake, which takes you into the app (via logging in, when accounts are
 * on). On a phone the pages fold into a menu.
 */
export async function SiteHeader() {
	const t = await getTranslations('Site.nav')
	const items = PUBLIC_LINKS.map(({ href, key }) => ({ href, label: t(key) }))
	const open = (
		<Link
			href="/home"
			className="rt-btn bg-accent text-accent-ink focus-visible:outline-accent inline-flex h-11 shrink-0 items-center rounded-full px-[18px] text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
		>
			{t('open')}
		</Link>
	)
	return (
		<header className="sticky top-0 z-40 px-[clamp(12px,3vw,28px)] pt-3">
			<div className="border-border bg-glass mx-auto flex max-w-[1240px] items-center gap-2 rounded-full border py-2 pr-2 pl-4 backdrop-blur-[16px] backdrop-saturate-[1.4]">
				<Logo className="mr-auto" />
				<nav aria-label={t('label')} className="hidden items-center gap-0.5 md:flex">
					<NavLinks items={items} variant="site" />
				</nav>
				<div className="flex items-center gap-2">
					<ThemeToggle variant="site" className="hidden sm:inline-flex" />
					<span className="hidden sm:inline-flex">{open}</span>
					<MobileMenu
						summary={
							<summary
								aria-label={t('menu')}
								className="border-border text-text flex size-11 cursor-pointer list-none items-center justify-center rounded-full border [&::-webkit-details-marker]:hidden"
							>
								<MenuIcon size={20} />
							</summary>
						}
					>
						<nav
							aria-label={t('label')}
							className="border-border bg-surface absolute right-0 mt-3 flex w-64 flex-col gap-1 rounded-3xl border p-2 shadow-(--shadow-card)"
						>
							<NavLinks items={items} variant="menu" />
							<div className="border-border mt-1 flex items-center justify-between gap-2 border-t px-1 pt-3 pb-1">
								<ThemeToggle variant="site" />
								{open}
							</div>
						</nav>
					</MobileMenu>
				</div>
			</div>
		</header>
	)
}
