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
 * The light/dark switch. `site`: the public pages' wide pill, a moon and a
 * sun with the knob under the one in use; `app`: the app bars' small one.
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
				'border-glass-border bg-glass focus-visible:outline-accent relative inline-flex shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
				variant === 'site' ? 'h-11 w-[84px]' : 'h-7 w-12',
				className
			)}
		>
			{variant === 'site' ? (
				<>
					<span
						aria-hidden
						className={cn(
							'absolute top-1 left-1 h-[34px] w-[38px] rounded-full shadow-[0_2px_12px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-(--ease-out-soft) motion-reduce:transition-none',
							light ? 'translate-x-[36px] bg-white' : 'bg-knob'
						)}
					/>
					<span
						aria-hidden
						className={cn(
							'relative flex w-1/2 justify-center pl-1 transition-colors',
							light ? 'text-text-faint' : 'text-brand-lilac'
						)}
					>
						<DarkModeIcon size={17} />
					</span>
					<span
						aria-hidden
						className={cn(
							'relative flex w-1/2 justify-center pr-1 transition-colors',
							light ? 'text-sun' : 'text-text-faint'
						)}
					>
						<LightModeIcon size={17} />
					</span>
				</>
			) : (
				<span
					aria-hidden
					className={cn(
						'bg-brand absolute top-0.5 left-0.5 flex size-[22px] items-center justify-center rounded-full text-white transition-transform duration-300 ease-(--ease-out-soft) motion-reduce:transition-none',
						light && 'translate-x-5'
					)}
				>
					{light ? <LightModeIcon size={13} /> : <DarkModeIcon size={13} />}
				</span>
			)}
		</button>
	)
}
