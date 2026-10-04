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

export function ThemeToggle({ className }: { className?: string }) {
	const t = useTranslations('Site.theme')
	const theme = useSyncExternalStore(subscribe, current, () => 'dark' as const)
	const next = theme === 'dark' ? 'light' : 'dark'
	return (
		<button
			type="button"
			role="switch"
			aria-checked={theme === 'light'}
			aria-label={t('label')}
			title={t(next)}
			onClick={() => setTheme(next)}
			className={cn(
				'border-border bg-surface text-text-muted hover:text-text hover:border-border-strong',
				'focus-visible:outline-accent relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2',
				className
			)}
		>
			<span
				aria-hidden
				className={cn(
					'bg-accent text-accent-ink absolute top-0.5 left-0.5 flex size-6 items-center justify-center rounded-full shadow transition-transform motion-reduce:transition-none',
					theme === 'light' && 'translate-x-6'
				)}
			>
				{theme === 'dark' ? <DarkModeIcon size={14} /> : <LightModeIcon size={14} />}
			</span>
		</button>
	)
}
