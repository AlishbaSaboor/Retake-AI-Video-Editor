'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from '@/i18n/routing'

/**
 * The top bar's menu on small screens: a <details>, so it opens without
 * script. The bar stays mounted across pages, so it's closed here whenever
 * the page changes, rather than left open over the next one, and when one
 * of its links is followed (a section of the same page changes no path).
 */
export function MobileMenu({
	summary,
	children
}: {
	summary: React.ReactNode
	children: React.ReactNode
}) {
	const pathname = usePathname()
	const ref = useRef<HTMLDetailsElement>(null)
	useEffect(() => {
		if (ref.current) ref.current.open = false
	}, [pathname])
	return (
		<details
			ref={ref}
			className="group relative md:hidden"
			onClick={(event) => {
				if (event.target instanceof Element && event.target.closest('a') && ref.current)
					ref.current.open = false
			}}
		>
			{summary}
			{children}
		</details>
	)
}
