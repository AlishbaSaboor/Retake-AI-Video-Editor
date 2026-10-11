'use client'

import { useRef } from 'react'
import type { Loudness } from '../../audio/take-audio'
import { timeToPercent, type TrimEdge, type TrimRange } from '../../model/timeline-scale'
import { TrimHandle } from './trim-handle'

// Arrow keys move a handle here 10 ms (Shift: 50 ms): these are cuts and
// joins between words, so trim's 0.1 s steps would be too coarse.
const STEPS = { small: 0.01, large: 0.05 }

// The waveform's vertical scale: from just under the gap threshold (so
// gaps read as near-flat) up to this level, about the loudest speech.
const WAVEFORM_FLOOR_BELOW_GAP_DB = 6
const WAVEFORM_TOP_DB = -6

type LoudnessTrackProps = {
	loudness: Loudness
	/** The zoomed span shown. */
	window: TrimRange
	/** The stretch to shade: what the edit removes or replaces. */
	marked: TrimRange
	/** Shading for `marked`, e.g. red for a cut. */
	markedClassName: string
	currentTimeSeconds: number
	/** The draggable handles over the waveform; each stays inside the window. */
	handles: Array<{ edge: TrimEdge; seconds: number; label: string }>
	onHandleChange: (edge: TrimEdge, seconds: number) => void
}

/**
 * A zoomed loudness waveform of part of the take, with a shaded stretch,
 * the playhead when it's in view, and handles laid over it. Gaps between
 * words show as dips below the dashed line. Shared by the filler cut editor
 * and the by-ear join editor.
 */
export function LoudnessTrack({
	loudness,
	window,
	marked,
	markedClassName,
	currentTimeSeconds,
	handles,
	onHandleChange
}: LoudnessTrackProps) {
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
				className={`pointer-events-none absolute inset-y-0 border-x ${markedClassName}`}
				style={{
					left: within(Math.max(marked.startSeconds, window.startSeconds)),
					right: `calc(100% - ${within(Math.min(marked.endSeconds, window.endSeconds))})`
				}}
			/>
			{playheadInView && (
				<div
					aria-hidden
					className="bg-accent pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
					style={{ left: within(currentTimeSeconds) }}
				/>
			)}
			{handles.map((handle) => (
				<TrimHandle
					key={handle.edge}
					edge={handle.edge}
					seconds={handle.seconds}
					durationSeconds={window.endSeconds}
					label={handle.label}
					timeAtPointer={timeAtPointer}
					onChange={(edge, seconds) =>
						onHandleChange(
							edge,
							Math.min(Math.max(seconds, window.startSeconds), window.endSeconds)
						)
					}
					view={window}
					steps={STEPS}
					className="inset-y-0 h-full"
				/>
			))}
		</div>
	)
}
