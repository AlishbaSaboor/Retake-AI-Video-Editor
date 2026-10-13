'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

type CompareToggleProps = {
	showOriginal: boolean
	onChange: (showOriginal: boolean) => void
}

const VIEWS = [
	{ key: 'edited', showOriginal: false },
	{ key: 'original', showOriginal: true }
] as const

/** Switches playback between the edited sequence and the untouched take. */
export function CompareToggle({ showOriginal, onChange }: CompareToggleProps) {
	const t = useTranslations('Editor.compare')
	return (
		<div
			role="group"
			aria-label={t('label')}
			className="border-border bg-surface flex gap-0.5 rounded border p-[3px]"
		>
			{VIEWS.map((view) => {
				const isActive = view.showOriginal === showOriginal
				return (
					<Button
						key={view.key}
						size="sm"
						variant="ghost"
						className={
							isActive
								? 'bg-surface-hover text-text hover:bg-surface-hover rounded-[9px] px-[13px] font-semibold whitespace-nowrap'
								: 'rounded-[9px] px-[13px] font-medium whitespace-nowrap'
						}
						aria-pressed={isActive}
						onClick={() => onChange(view.showOriginal)}
					>
						{t(view.key)}
					</Button>
				)
			})}
		</div>
	)
}
