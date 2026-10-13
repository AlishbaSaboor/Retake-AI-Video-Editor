import { getTranslations } from 'next-intl/server'
import { ThemeToggle } from '@/components/theme-toggle'
import { currentUser } from '@/server/auth/session'
import { Logo } from './logo'
import { NavLinks } from './nav-links'
import { SignOutButton } from './sign-out-button'

/**
 * The signed-in pages' top bar: the logo, New project and Projects (the one
 * you're on marked), and on the right the theme switch, your initial and
 * Sign out. With accounts off there's nobody to show, so only the switch.
 */
export async function AppHeader() {
	const t = await getTranslations('Site.nav')
	const user = await currentUser()
	const items = [
		{ href: '/home', label: t('newProject') },
		{ href: '/projects', label: t('projects') }
	]
	return (
		<header className="border-border sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-[12px]">
			<div className="flex min-h-[62px] items-center gap-2.5 px-[clamp(12px,2.4vw,24px)]">
				<Logo href="/home" compact className="text-[19px] [&>svg]:size-[26px]" />
				<nav aria-label={t('label')} className="ml-3 flex items-center gap-0.5 max-[400px]:ml-1">
					<NavLinks items={items} variant="app" />
				</nav>
				<div className="ml-auto flex items-center gap-2.5">
					<ThemeToggle />
					{user && (
						<>
							<span
								aria-hidden
								title={user.email}
								className="bg-surface-hover text-text hidden size-[34px] items-center justify-center rounded-full text-sm font-bold uppercase min-[561px]:flex"
							>
								{user.email.slice(0, 1)}
							</span>
							<SignOutButton email={user.email} />
						</>
					)}
				</div>
			</div>
		</header>
	)
}
