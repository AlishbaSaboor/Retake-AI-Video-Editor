'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { DarkModeIcon, LightModeIcon } from '@/components/ui/icons'
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme'
import { cn } from '@/lib/cn'

// The theme lives on <html data-theme>, set before first paint by the
// script in layout.tsx; this switch flips it and remembers the choice.
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

const current = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

function setTheme(theme: Theme) {
	if (theme === 'light') document.documentElement.dataset.theme = 'light'
	else delete document.documentElement.dataset.theme
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme)
	} catch {
		// Storage blocked (a private window): the switch still works for this visit.
	}
	for (const listener of listeners) listener()
}

/**
 * The light/dark switch: a round button showing the sun while it's dark
 * (press for light) and the moon while it's light. `site`: the public
 * pages' 44px one; `app`: the app bars' 38px one. Read out as a switch,
 * on when the light theme is.
 */
export function ThemeToggle({
	variant = 'app',
	className
}: {
	variant?: 'site' | 'app'
	className?: string
}) {
	const t = useTranslations('Site.theme')
	const theme = useSyncExternalStore(subscribe, current, () => 'dark' as const)
	const next = theme === 'dark' ? 'light' : 'dark'
	const light = theme === 'light'
	return (
		<button
			type="button"
			role="switch"
			aria-checked={light}
			aria-label={t('label')}
			title={t(next)}
			onClick={() => setTheme(next)}
			className={cn(
				'border-border text-text hover:bg-border focus-visible:outline-accent inline-flex shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
				variant === 'site' ? 'size-11' : 'size-[38px]',
				className
			)}
		>
			{light ? <DarkModeIcon size={18} /> : <LightModeIcon size={18} />}
		</button>
	)
}
