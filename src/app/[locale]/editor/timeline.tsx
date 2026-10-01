'use client'

import { useTranslations } from 'next-intl'
import { VideoIcon } from '@/components/ui/icons'
import {
	clampTime,
	formatTimecode,
	isKnownDuration,
	rulerTicks,
	timeToPercent
} from './timeline-scale'

// Arrow keys nudge the playhead by a second; Shift+arrow jumps five.
const SMALL_STEP_SECONDS = 1
const LARGE_STEP_SECONDS = 5

type TimelineProps = {
	/** Null until a video has loaded. */
	clipName: string | null
	durationSeconds: number
	currentTimeSeconds: number
	onSeek: (seconds: number) => void
}

/**
 * One track holding the loaded clip, a time ruler, and a playhead. Click or
 * drag anywhere on it to scrub; it's also a keyboard-operable slider.
 */
export function Timeline({ clipName, durationSeconds, currentTimeSeconds, onSeek }: TimelineProps) {
	const t = useTranslations('Editor.timeline')
	const hasClip = clipName !== null && isKnownDuration(durationSeconds)

	function timeAtPointer(clientX: number, track: HTMLElement): number {
		const rect = track.getBoundingClientRect()
		return clampTime(((clientX - rect.left) / rect.width) * durationSeconds, durationSeconds)
	}

	function handleKeyDown(event: React.KeyboardEvent) {
		const step = event.shiftKey ? LARGE_STEP_SECONDS : SMALL_STEP_SECONDS
		const target: Record<string, number> = {
			ArrowRight: currentTimeSeconds + step,
			ArrowUp: currentTimeSeconds + step,
			ArrowLeft: currentTimeSeconds - step,
			ArrowDown: currentTimeSeconds - step,
			Home: 0,
			End: durationSeconds
		}
		const next = target[event.key]
		if (next === undefined) return
		event.preventDefault()
		onSeek(clampTime(next, durationSeconds))
	}

	return (
		<section className="border-border bg-surface rounded-lg border p-4">
			<h2 className="text-text-muted mb-3 text-sm font-medium">{t('label')}</h2>
			{hasClip ? (
				<div
					role="slider"
					tabIndex={0}
					aria-label={t('scrubberLabel')}
					aria-valuemin={0}
					aria-valuemax={Math.round(durationSeconds)}
					aria-valuenow={Math.round(currentTimeSeconds)}
					aria-valuetext={formatTimecode(currentTimeSeconds)}
					className="focus-visible:outline-accent relative cursor-pointer touch-none rounded select-none focus-visible:outline-2"
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId)
						onSeek(timeAtPointer(event.clientX, event.currentTarget))
					}}
					onPointerMove={(event) => {
						if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
						onSeek(timeAtPointer(event.clientX, event.currentTarget))
					}}
					onKeyDown={handleKeyDown}
				>
					<div className="border-border relative h-6 overflow-hidden border-b">
						{rulerTicks(durationSeconds).map((tick) => (
							<span
								key={tick}
								className="border-border-strong text-text-faint absolute top-0 h-full border-l pl-1 text-xs tabular-nums"
								style={{ left: timeToPercent(tick, durationSeconds) }}
							>
								{formatTimecode(tick)}
							</span>
						))}
					</div>
					<div className="py-3">
						<div
							className="border-border-strong bg-surface-hover text-text flex h-14 items-center gap-2 rounded border px-3 text-sm"
							title={t('clipLabel', { name: clipName, duration: formatTimecode(durationSeconds) })}
						>
							<VideoIcon className="text-text-muted shrink-0" />
							<span className="truncate">{clipName}</span>
							<span className="text-text-muted ml-auto shrink-0 tabular-nums">
								{formatTimecode(durationSeconds)}
							</span>
						</div>
					</div>
					<div
						aria-hidden
						className="bg-accent pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
						style={{ left: timeToPercent(currentTimeSeconds, durationSeconds) }}
					/>
				</div>
			) : (
				<p className="text-text-faint py-8 text-center text-sm">{t('empty')}</p>
			)}
		</section>
	)
}
