'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CleanupIcon, UndoIcon } from '@/components/ui/icons'

type CleanupBarProps = {
	/** Seconds that clean-up would remove now; 0 when there's nothing to remove. */
	removableSeconds: number
	canUndo: boolean
	onApply: () => void
	onUndo: () => void
}

/**
 * "Clean up recording": removes every flagged silence in one go, after
 * showing how much time that takes out. Undo restores the edit from before.
 */
export function CleanupBar({ removableSeconds, canUndo, onApply, onUndo }: CleanupBarProps) {
	const t = useTranslations('Editor.cleanup')
	const [isConfirming, setIsConfirming] = useState(false)
	const seconds = Math.max(1, Math.round(removableSeconds))

	if (isConfirming) {
		return (
			<div
				role="status"
				className="border-accent/50 bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
			>
				<div className="flex flex-col gap-0.5">
					<p className="text-text text-sm font-medium">{t('estimate', { seconds })}</p>
					<p className="text-text-muted text-xs">{t('fillersKept')}</p>
				</div>
				<div className="ml-auto flex gap-2">
					<Button variant="outline" size="sm" onClick={() => setIsConfirming(false)}>
						{t('cancel')}
					</Button>
					<Button
						size="sm"
						onClick={() => {
							onApply()
							setIsConfirming(false)
						}}
					>
						{t('apply')}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
			<Button
				variant="secondary"
				size="sm"
				disabled={removableSeconds <= 0}
				onClick={() => setIsConfirming(true)}
			>
				<CleanupIcon />
				{t('button')}
			</Button>
			<span className="text-text-muted text-xs">
				{removableSeconds > 0 ? t('hint') : t('nothing')}
			</span>
			{canUndo && (
				<Button variant="ghost" size="sm" className="ml-auto" onClick={onUndo}>
					<UndoIcon />
					{t('undo')}
				</Button>
			)}
		</div>
	)
}
