'use client'

import { Link, usePathname } from '@/i18n/routing'
import { cn } from '@/lib/cn'

export type NavItem = { href: string; label: string; icon?: React.ReactNode }

/** Whether `href` is the page being shown, or a page under it. */
function isCurrent(pathname: string, href: string): boolean {
	return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

/**
 * A bar's links, the page you're on marked with the faint fill the others
 * get on hover. Also the phone menu's list.
 */
export function NavLinks({
	items,
	variant
}: {
	items: readonly NavItem[]
	variant: 'site' | 'app' | 'menu'
}) {
	const pathname = usePathname()
	return items.map(({ href, label, icon }) => {
		const current = isCurrent(pathname, href)
		return (
			<Link
				key={href}
				href={href}
				aria-current={current ? 'page' : undefined}
				className={cn(
					'focus-visible:outline-accent hover:bg-border hover:text-text relative inline-flex items-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
					current ? 'text-text bg-border' : 'text-text-muted',
					variant === 'site' && 'h-10 rounded-full px-3.5 text-[15px]',
					variant === 'app' &&
						'h-[38px] rounded-[10px] px-3 text-[14.5px] whitespace-nowrap max-[400px]:px-2',
					variant === 'menu' && 'h-11 rounded-xl px-3 text-[15px]'
				)}
			>
				{icon}
				{/* The app bar shows only the icons on a phone; the name is still read out. */}
				<span className={cn(variant === 'app' && icon && 'max-sm:sr-only')}>{label}</span>
			</Link>
		)
	})
}
