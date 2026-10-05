'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CleanupIcon } from '@/components/ui/icons'

type CleanupBarProps = {
	/** Seconds that clean-up would remove now; 0 when there's nothing to remove. */
	removableSeconds: number
	silenceCount: number
	/** Filler words with a clear gap on both sides — removed by clean-up. */
	fillerCutCount: number
	/** Filler words with no clear gap — left flagged for a manual cut. */
	fillerReviewCount: number
	onApply: () => void
	/** Still reading the recording (its sound, then its transcript): nothing is known yet. */
	reading: boolean
}

/**
 * "Clean up recording": removes every flagged silence, and every filler word
 * with a clear gap around it, in one go — after showing how much time that
 * takes out. Undo (HistoryControls) takes it back as one step.
 */
export function CleanupBar({
	removableSeconds,
	silenceCount,
	fillerCutCount,
	fillerReviewCount,
	onApply,
	reading
}: CleanupBarProps) {
	const t = useTranslations('Editor.cleanup')
	const [isConfirming, setIsConfirming] = useState(false)
	const seconds = Math.max(1, Math.round(removableSeconds))

	if (isConfirming) {
		return (
			<div
				role="status"
				className="border-accent/50 bg-surface flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 shadow-lg"
			>
				<div className="flex flex-col gap-0.5">
					<p className="text-text text-sm font-medium">
						{t('estimate', { seconds })}{' '}
						<span className="text-text-muted font-normal">
							{t('breakdown', { silences: silenceCount, fillers: fillerCutCount })}
						</span>
					</p>
					{fillerReviewCount > 0 && (
						<p className="text-text-muted text-xs">
							{t('fillersForReview', { count: fillerReviewCount })}
						</p>
					)}
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
		<div className="flex flex-wrap items-center gap-3">
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
				{reading ? t('reading') : removableSeconds > 0 ? t('hint') : t('nothing')}
			</span>
		</div>
	)
}
