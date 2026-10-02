'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { FillerPlan } from './filler-cuts'
import type { Loudness } from './take-audio'
import { formatTimecode, timeToPercent, type TrimEdge, type TrimRange } from './timeline-scale'
import { TrimHandle } from './trim-handle'

// Arrow keys move a cut edge 10 ms (Shift: 50 ms) — fillers are a few
// hundred ms long, so trim's 0.1 s steps would be too coarse here.
const CUT_STEPS = { small: 0.01, large: 0.05 }
// The waveform's vertical scale: from just under the gap threshold (so
// gaps read as near-flat) up to this level, about the loudest speech.
const WAVEFORM_FLOOR_BELOW_GAP_DB = 6
const WAVEFORM_TOP_DB = -6

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
	const trackRef = useRef<HTMLDivElement>(null)
	const span = window.endSeconds - window.startSeconds

	const first = Math.floor(window.startSeconds / loudness.windowSeconds)
	const last = Math.ceil(window.endSeconds / loudness.windowSeconds)
	const floorDb = loudness.gapThresholdDb - WAVEFORM_FLOOR_BELOW_GAP_DB
	const height = (db: number) =>
		Math.min(1, Math.max(0, (db - floorDb) / (WAVEFORM_TOP_DB - floorDb)))
	const bars = Array.from(loudness.db.subarray(first, last), (db, i) => (
		<rect key={i} x={i} y={1 - height(db)} width={0.8} height={height(db)} />
	))
	const gapLine = 1 - height(loudness.gapThresholdDb)

	function timeAtPointer(clientX: number): number {
		const track = trackRef.current
		if (!track) return window.startSeconds
		const rect = track.getBoundingClientRect()
		return window.startSeconds + ((clientX - rect.left) / rect.width) * span
	}

	const within = (seconds: number) => timeToPercent(seconds - window.startSeconds, span)
	const playheadInView =
		currentTimeSeconds >= window.startSeconds && currentTimeSeconds <= window.endSeconds

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
			<div ref={trackRef} className="bg-surface-inset relative h-20 rounded-lg">
				<svg
					aria-hidden
					className="fill-text-muted absolute inset-0 h-full w-full"
					viewBox={`0 0 ${Math.max(1, last - first)} 1`}
					preserveAspectRatio="none"
				>
					{bars}
					<line
						x1={0}
						x2={last - first}
						y1={gapLine}
						y2={gapLine}
						className="stroke-warning"
						// Screen pixels (non-scaling): the viewBox is stretched, so
						// SVG-unit widths would vanish or smear.
						strokeWidth={1}
						strokeDasharray="4 3"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<div
					aria-hidden
					className="border-danger/70 bg-danger/20 pointer-events-none absolute inset-y-0 border-x"
					style={{
						left: within(range.startSeconds),
						right: `calc(100% - ${within(range.endSeconds)})`
					}}
				/>
				{playheadInView && (
					<div
						aria-hidden
						className="bg-accent pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
						style={{ left: within(currentTimeSeconds) }}
					/>
				)}
				{(['start', 'end'] as const).map((edge) => (
					<TrimHandle
						key={edge}
						edge={edge}
						seconds={edge === 'start' ? range.startSeconds : range.endSeconds}
						durationSeconds={window.endSeconds}
						label={t(edge === 'start' ? 'startLabel' : 'endLabel')}
						timeAtPointer={timeAtPointer}
						onChange={onRangeChange}
						view={window}
						steps={CUT_STEPS}
						className="inset-y-0 h-full"
					/>
				))}
			</div>
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
