import { getTranslations } from 'next-intl/server'
import { MenuIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link } from '@/i18n/routing'
import { Logo } from './logo'
import { MobileMenu } from './mobile-menu'
import { NavLinks } from './nav-links'

const PUBLIC_LINKS = [
	{ href: '/features', key: 'features' },
	{ href: '/how-it-works', key: 'howItWorks' },
	{ href: '/pricing', key: 'pricing' },
	{ href: '/contact', key: 'contact' }
] as const

/**
 * The public pages' top bar: a floating glass pill with the logo, the
 * site's pages (the one you're on marked with a dot), the theme switch and
 * Open Retake, which takes you into the app (via logging in, when accounts
 * are on). On a phone the pages fold into a menu.
 */
export async function SiteHeader() {
	const t = await getTranslations('Site.nav')
	const items = PUBLIC_LINKS.map(({ href, key }) => ({ href, label: t(key) }))
	const open = (
		<Link
			href="/home"
			className="rt-btn bg-contrast text-contrast-ink focus-visible:outline-accent inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
		>
			{t('open')}
		</Link>
	)
	return (
		<header className="sticky top-0 z-40 px-[clamp(12px,3vw,32px)] pt-3.5">
			<div className="border-glass-border bg-glass mx-auto flex h-[62px] max-w-[1188px] items-center gap-2 rounded-full border py-2 pr-2 pl-[18px] backdrop-blur-[20px] backdrop-saturate-[1.4]">
				<Logo />
				<nav
					aria-label={t('label')}
					className="hidden flex-1 items-center justify-center gap-1 md:flex"
				>
					<NavLinks items={items} variant="site" />
				</nav>
				<div className="ml-auto flex items-center gap-2 md:ml-0">
					<ThemeToggle variant="site" className="hidden sm:inline-flex" />
					<span className="hidden sm:inline-flex">{open}</span>
					<MobileMenu
						summary={
							<summary
								aria-label={t('menu')}
								className="bg-surface-hover text-text flex size-11 cursor-pointer list-none items-center justify-center rounded-full [&::-webkit-details-marker]:hidden"
							>
								<MenuIcon size={20} />
							</summary>
						}
					>
						<nav
							aria-label={t('label')}
							className="border-glass-border bg-surface absolute right-0 mt-3 flex w-64 flex-col gap-1 rounded-3xl border p-2 shadow-(--shadow-card)"
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
