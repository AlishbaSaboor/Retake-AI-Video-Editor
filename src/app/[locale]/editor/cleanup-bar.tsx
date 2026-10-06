'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { CleanupIcon, SpinnerIcon } from '@/components/ui/icons'
import { formatTimecode } from './timeline-scale'

type CleanupPanelProps = {
	/** Seconds that clean-up would remove now; 0 when there's nothing to remove. */
	removableSeconds: number
	/** The edited video's length now: what the preview counts down from. */
	editedSeconds: number
	silenceCount: number
	/** Filler words with a clear gap on both sides — removed by clean-up. */
	fillerCutCount: number
	/** Filler words with no clear gap — left flagged for a manual cut. */
	fillerReviewCount: number
	onApply: () => void
	/** Still reading the recording (its sound, then its transcript): nothing is known yet. */
	reading: boolean
	canEdit: boolean
}

/**
 * Clean up: what it would take out (the long silences, and the filler
 * words with a clear gap around them) and how much time that saves, shown
 * up front; one click removes them all. Undo takes it back as one step.
 * Filler words that run straight into the next word stay flagged, to cut
 * by hand.
 */
export function CleanupPanel({
	removableSeconds,
	editedSeconds,
	silenceCount,
	fillerCutCount,
	fillerReviewCount,
	onApply,
	reading,
	canEdit
}: CleanupPanelProps) {
	const t = useTranslations('Editor.cleanup')
	const seconds = Math.max(1, Math.round(removableSeconds))
	const hasWork = removableSeconds > 0
	const from = formatTimecode(editedSeconds)
	const to = formatTimecode(Math.max(0, editedSeconds - removableSeconds))

	if (reading) {
		return (
			<p role="status" className="text-text-muted flex items-center gap-2 text-sm">
				<SpinnerIcon />
				{t('reading')}
			</p>
		)
	}

	return (
		<section aria-label={t('label')} className="flex flex-col gap-4">
			<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
				<ul className="flex flex-col gap-1.5 text-sm">
					<li className="flex items-center gap-2">
						<span aria-hidden className="bg-warning size-2 rounded-full" />
						<span className="text-text">{t('silences', { count: silenceCount })}</span>
					</li>
					<li className="flex items-center gap-2">
						<span aria-hidden className="bg-filler size-2 rounded-sm" />
						<span className="text-text">{t('fillers', { count: fillerCutCount })}</span>
					</li>
				</ul>
				<p role="status" className="bg-surface-inset text-text rounded-md p-3 text-sm">
					{hasWork ? (
						<>
							<strong className="font-semibold">{t('saves', { seconds })}</strong>
							{/* Under a second off, both lengths read the same: no use saying so. */}
							{from !== to && <> {t('length', { from, to })}</>}
						</>
					) : (
						t('nothing')
					)}
				</p>
				<Button disabled={!hasWork || !canEdit} onClick={onApply} className="self-start">
					<CleanupIcon />
					{t('button')}
				</Button>
				<p className="text-text-muted text-xs">{t('undoHint')}</p>
			</div>
			{fillerReviewCount > 0 && (
				<p className="text-text-muted text-sm">
					{t('fillersForReview', { count: fillerReviewCount })}
				</p>
			)}
		</section>
	)
}
