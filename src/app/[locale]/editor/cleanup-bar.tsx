'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CleanupIcon, RedoIcon, UndoIcon } from '@/components/ui/icons'

type CleanupBarProps = {
	/** Seconds that clean-up would remove now; 0 when there's nothing to remove. */
	removableSeconds: number
	silenceCount: number
	/** Filler words with a clear gap on both sides — removed by clean-up. */
	fillerCutCount: number
	/** Filler words with no clear gap — left flagged for a manual cut. */
	fillerReviewCount: number
	canUndo: boolean
	canRedo: boolean
	onApply: () => void
	onUndo: () => void
	onRedo: () => void
}

/**
 * "Clean up recording": removes every flagged silence, and every filler word
 * with a clear gap around it, in one go — after showing how much time that
 * takes out. Undo and Redo step back and forth through every edit, this
 * one included.
 */
export function CleanupBar({
	removableSeconds,
	silenceCount,
	fillerCutCount,
	fillerReviewCount,
	canUndo,
	canRedo,
	onApply,
	onUndo,
	onRedo
}: CleanupBarProps) {
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
			<div className="ml-auto flex gap-2">
				{canUndo && (
					<Button variant="ghost" size="sm" aria-keyshortcuts="Control+Z" onClick={onUndo}>
						<UndoIcon />
						{t('undo')}
					</Button>
				)}
				{canRedo && (
					<Button
						variant="ghost"
						size="sm"
						aria-keyshortcuts="Control+Shift+Z Control+Y"
						onClick={onRedo}
					>
						<RedoIcon />
						{t('redo')}
					</Button>
				)}
			</div>
		</div>
	)
}
