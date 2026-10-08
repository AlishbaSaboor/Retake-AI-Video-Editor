'use client'

import { Link, usePathname } from '@/i18n/routing'
import { cn } from '@/lib/cn'

export type NavItem = { href: string; label: string; icon?: React.ReactNode }

/** Whether `href` is the page being shown, or a page under it. */
function isCurrent(pathname: string, href: string): boolean {
	return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

/**
 * A bar's links, the page you're on marked: in the site's pill a small blue
 * dot under it, in the app's bar a filled tab. Also the phone menu's list.
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
					'focus-visible:outline-accent relative inline-flex items-center gap-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
					variant === 'site' && 'hover:text-text h-11 rounded-full px-3.5 text-[15px]',
					variant === 'site' && (current ? 'text-text' : 'text-text-muted'),
					variant === 'app' && 'h-[38px] rounded-[11px] px-3.5 text-sm font-bold',
					variant === 'app' &&
						(current
							? 'bg-surface-hover text-text'
							: 'text-text-muted hover:bg-surface-hover hover:text-text'),
					variant === 'menu' && 'h-11 rounded-xl px-3 text-[15px]',
					variant === 'menu' &&
						(current ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text')
				)}
			>
				{icon}
				{/* The app bar shows only the icons on a phone; the name is still read out. */}
				<span className={cn(variant === 'app' && 'max-sm:sr-only')}>{label}</span>
				{variant === 'site' && current && (
					<span
						aria-hidden
						className="bg-blue absolute bottom-0.5 left-1/2 size-[5px] -translate-x-1/2 rounded-full"
					/>
				)}
			</Link>
		)
	})
}
