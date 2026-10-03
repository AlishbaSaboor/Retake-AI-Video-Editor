'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { FillerPlan } from './filler-cuts'
import { LoudnessTrack } from './loudness-track'
import type { Loudness } from './take-audio'
import { formatTimecode, type TrimEdge, type TrimRange } from './timeline-scale'

type FillerCutEditorProps = {
	plan: FillerPlan
	/** The zoomed span shown — the filler plus context (cutEditorWindow). */
	window: TrimRange
	/** The cut the handles mark. */
	range: TrimRange
	loudness: Loudness
	currentTimeSeconds: number
	onRangeChange: (edge: TrimEdge, seconds: number) => void
	onPlay: (withCut: boolean) => void
	onApply: () => void
	onCancel: () => void
}

/**
 * A zoomed view of one filler with its loudness waveform and two handles,
 * for setting a cut by ear: play the original, play it with the cut, adjust,
 * then cut. Gaps show as dips below the dashed line.
 */
export function FillerCutEditor({
	plan,
	window,
	range,
	loudness,
	currentTimeSeconds,
	onRangeChange,
	onPlay,
	onApply,
	onCancel
}: FillerCutEditorProps) {
	const t = useTranslations('Editor.fillerCut')

	return (
		<section
			aria-label={t('label', { word: plan.filler.word })}
			className="border-filler/40 bg-surface rounded-2xl border p-4 shadow-xl"
		>
			<div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">
					{t('title', { word: plan.filler.word, at: formatTimecode(plan.filler.startSeconds) })}
				</h2>
				<p className="text-text-muted text-xs">{t('hint')}</p>
			</div>
			<LoudnessTrack
				loudness={loudness}
				window={window}
				marked={range}
				markedClassName="border-danger/70 bg-danger/20"
				currentTimeSeconds={currentTimeSeconds}
				handles={[
					{ edge: 'start', seconds: range.startSeconds, label: t('startLabel') },
					{ edge: 'end', seconds: range.endSeconds, label: t('endLabel') }
				]}
				onHandleChange={onRangeChange}
			/>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<span className="text-text-muted mr-auto font-mono text-xs">
					{t('range', {
						start: (range.startSeconds - window.startSeconds).toFixed(2),
						end: (range.endSeconds - window.startSeconds).toFixed(2),
						length: Math.round((range.endSeconds - range.startSeconds) * 1000)
					})}
				</span>
				<Button variant="outline" size="sm" onClick={() => onPlay(false)}>
					{t('playOriginal')}
				</Button>
				<Button variant="outline" size="sm" onClick={() => onPlay(true)}>
					{t('playWithCut')}
				</Button>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t('cancel')}
				</Button>
				<Button size="sm" onClick={onApply}>
					{t('apply')}
				</Button>
			</div>
		</section>
	)
}
