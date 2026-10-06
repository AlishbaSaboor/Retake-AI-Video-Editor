import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { HomeIcon, MenuIcon, ProjectsIcon, SignInIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { currentUser } from '@/server/auth/session'
import { Logo } from './logo'
import { MobileMenu } from './mobile-menu'
import { SignOutButton } from './sign-out-button'

const PUBLIC_LINKS = [
	{ href: '/how-it-works', key: 'howItWorks' },
	{ href: '/features', key: 'features' },
	{ href: '/contact', key: 'contact' }
] as const

const navLink =
	'text-text-muted hover:text-text hover:bg-surface-hover focus-visible:outline-accent inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2'

/**
 * The top bar on every page. Signed-out visitors see the site's pages and
 * Sign in; signed-in ones only the app's (a new project, saved projects)
 * and Sign out. The theme switch is in both. `wide`: full width.
 */
export async function SiteHeader({ app = false, wide = false }: { app?: boolean; wide?: boolean }) {
	const t = await getTranslations('Site.nav')
	const user = await currentUser()
	const appLinks = [
		{ href: '/home', key: 'newProject', icon: <HomeIcon /> },
		{ href: '/projects', key: 'projects', icon: <ProjectsIcon /> }
	] as const
	const signedIn = app || user !== null
	const links = signedIn
		? appLinks.map(({ href, key, icon }) => (
				<Link key={href} href={href} className={navLink}>
					{icon}
					{t(key)}
				</Link>
			))
		: PUBLIC_LINKS.map(({ href, key }) => (
				<Link key={href} href={href} className={navLink}>
					{t(key)}
				</Link>
			))
	const account = user ? (
		<SignOutButton email={user.email} />
	) : (
		<Button asChild size="sm">
			<Link href="/login">
				<SignInIcon />
				{t('signIn')}
			</Link>
		</Button>
	)

	return (
		<header
			className={cn(
				'border-border bg-bg/85 sticky top-0 z-40 border-b backdrop-blur-md',
				wide && 'static backdrop-blur-none'
			)}
		>
			<div
				className={cn(
					'mx-auto flex h-14 items-center gap-2 px-4',
					wide ? 'max-w-none' : 'max-w-6xl md:px-6'
				)}
			>
				<Logo href={user ? '/home' : '/'} className="mr-4" />
				<nav aria-label={t('label')} className="hidden items-center gap-1 md:flex">
					{links}
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle />
					<div className="hidden md:block">{account}</div>
					<MobileMenu
						summary={
							<summary
								aria-label={t('menu')}
								className="border-border bg-surface text-text hover:bg-surface-hover flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border [&::-webkit-details-marker]:hidden"
							>
								<MenuIcon size={18} />
							</summary>
						}
					>
						<nav
							aria-label={t('label')}
							className="border-border bg-surface absolute right-0 mt-2 flex w-56 flex-col gap-1 rounded-lg border p-2 shadow-xl"
						>
							{links}
							<div className="border-border mt-1 border-t pt-2">{account}</div>
						</nav>
					</MobileMenu>
				</div>
			</div>
		</header>
	)
}
