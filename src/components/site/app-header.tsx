import { getTranslations } from 'next-intl/server'
import { PlusIcon, ProjectsIcon } from '@/components/ui/icons'
import { ThemeToggle } from '@/components/theme-toggle'
import { currentUser } from '@/server/auth/session'
import { Logo } from './logo'
import { NavLinks } from './nav-links'
import { SignOutButton } from './sign-out-button'

/**
 * The signed-in pages' top bar: the logo, New project and Projects (the one
 * you're on filled), and on the right the theme switch, your initial and
 * Sign out. With accounts off there's nobody to show, so only the switch.
 */
export async function AppHeader() {
	const t = await getTranslations('Site.nav')
	const user = await currentUser()
	const items = [
		{ href: '/home', label: t('newProject'), icon: <PlusIcon size={16} /> },
		{ href: '/projects', label: t('projects'), icon: <ProjectsIcon size={16} /> }
	]
	return (
		<header className="border-border relative z-40 border-b">
			<div className="flex h-[68px] items-center gap-2 px-4 md:px-8">
				<Logo
					href="/home"
					compact
					className="mr-2 text-[28px] md:mr-4 [&>span:first-child]:size-8"
				/>
				<nav aria-label={t('label')} className="flex items-center gap-1">
					<NavLinks items={items} variant="app" />
				</nav>
				<div className="ml-auto flex items-center gap-3">
					<ThemeToggle />
					{user && (
						<>
							<span aria-hidden className="bg-border hidden h-6 w-px sm:block" />
							<span
								aria-hidden
								title={user.email}
								className="bg-surface-hover text-text hidden size-[34px] items-center justify-center rounded-full text-sm font-extrabold uppercase sm:flex"
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
