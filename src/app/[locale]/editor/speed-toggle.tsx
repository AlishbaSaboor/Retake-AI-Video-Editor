'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PREVIEW_RATES } from './preview-speed'

type SpeedToggleProps = {
	rate: number
	onChange: (rate: number) => void
}

/** How fast the editor previews the edit. The export always plays at 1×. */
export function SpeedToggle({ rate, onChange }: SpeedToggleProps) {
	const t = useTranslations('Editor.speed')
	return (
		<div role="group" aria-label={t('label')} className="flex items-center gap-1">
			<span className="text-text-muted mr-1 text-xs" title={t('hint')}>
				{t('label')}
			</span>
			{PREVIEW_RATES.map((option) => (
				<Button
					key={option}
					size="sm"
					variant={option === rate ? 'secondary' : 'ghost'}
					aria-pressed={option === rate}
					onClick={() => onChange(option)}
				>
					{t('rate', { rate: option })}
				</Button>
			))}
		</div>
	)
}
