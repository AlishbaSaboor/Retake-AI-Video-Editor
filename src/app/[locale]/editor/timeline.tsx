'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { TimelineIcon } from '@/components/ui/icons'
import {
	clampTime,
	formatTimecode,
	isKnownDuration,
	rulerTicks,
	timeToPercent,
	type TrimEdge,
	type TrimRange
} from './timeline-scale'
import { keptSeconds, type Cut } from './cleanup'
import type { FillerWord } from './filler-words'
import type { Silence } from './take-audio'
import { TimelineFlag } from './timeline-flag'
import { TrimHandle } from './trim-handle'

// Arrow keys nudge the playhead by a second; Shift+arrow jumps five.
const SMALL_STEP_SECONDS = 1
const LARGE_STEP_SECONDS = 5

type TimelineProps = {
	/** Null until a video has loaded. */
	clipName: string | null
	durationSeconds: number
	currentTimeSeconds: number
	trim: TrimRange
	/** Detected silences, flagged on the track; empty until analysed. */
	silences: Silence[]
	/** Filler words found in the transcript, flagged the same way. */
	fillerWords: FillerWord[]
	/** Ranges removed by clean-up, shown struck out on the track. */
	cuts: Cut[]
	onSeek: (seconds: number) => void
	onTrimChange: (edge: TrimEdge, seconds: number) => void
}

/**
 * One track holding the loaded clip, a time ruler, and a playhead. Click or
 * drag anywhere on it to scrub; it's also a keyboard-operable slider. The
 * dashed outline is the whole source file and the bar inside it is the
 * trimmed clip, with a handle on each edge. Silences are shaded amber, with
 * a flag above each one that jumps to it; filler words get their own flags.
 */
export function Timeline({
	clipName,
	durationSeconds,
	currentTimeSeconds,
	trim,
	silences,
	fillerWords,
	cuts,
	onSeek,
	onTrimChange
}: TimelineProps) {
	const t = useTranslations('Editor.timeline')
	const trackRef = useRef<HTMLDivElement>(null)
	const hasClip = clipName !== null && isKnownDuration(durationSeconds)
	const trimmedSeconds = keptSeconds({ trim, cuts })

	function timeAtPointer(clientX: number): number {
		const track = trackRef.current
		if (!track) return 0
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
			Home: trim.startSeconds,
			End: trim.endSeconds
		}
		const next = target[event.key]
		if (next === undefined) return
		event.preventDefault()
		onSeek(next)
	}

	return (
		<section className="border-border bg-surface rounded-2xl border p-4 shadow-xl">
			<div className="border-border mb-2 flex items-center gap-1.5 border-b pb-3">
				<TimelineIcon className="text-accent" />
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
				{hasClip && (silences.length > 0 || fillerWords.length > 0) && (
					<div className="ml-auto flex items-center gap-2 text-xs">
						{silences.length > 0 && (
							<span className="border-warning/20 bg-warning/10 text-warning rounded border px-2 py-0.5">
								{t('silenceCount', { count: silences.length })}
							</span>
						)}
						{fillerWords.length > 0 && (
							<span className="border-filler/20 bg-filler/10 text-filler rounded border px-2 py-0.5">
								{t('fillerCount', { count: fillerWords.length })}
							</span>
						)}
					</div>
				)}
			</div>
			{hasClip ? (
				// The handles sit beside the scrubber rather than inside it, so
				// dragging one trims without also seeking.
				<div ref={trackRef} className="relative">
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
							onSeek(timeAtPointer(event.clientX))
						}}
						onPointerMove={(event) => {
							if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
							onSeek(timeAtPointer(event.clientX))
						}}
						onKeyDown={handleKeyDown}
					>
						<div className="border-border relative h-6 overflow-hidden border-b font-mono">
							{rulerTicks(durationSeconds).map((tick) => (
								<span
									key={tick}
									className="border-border-strong text-text-faint absolute top-0 h-full border-l pl-1 text-xs"
									style={{ left: timeToPercent(tick, durationSeconds) }}
								>
									{formatTimecode(tick)}
								</span>
							))}
						</div>
						<div className="border-border-strong bg-surface-inset relative my-3 h-16 rounded-lg border-2 border-dashed">
							<div
								className="border-accent/60 from-surface via-surface-hover to-surface absolute inset-y-1 flex items-center gap-2 overflow-hidden rounded-md border bg-linear-to-r px-4 shadow-lg"
								style={{
									left: timeToPercent(trim.startSeconds, durationSeconds),
									right: `calc(100% - ${timeToPercent(trim.endSeconds, durationSeconds)})`
								}}
								title={t('clipLabel', { name: clipName, duration: formatTimecode(trimmedSeconds) })}
							>
								<span className="text-text truncate text-xs font-semibold tracking-tight">
									{clipName}
								</span>
								<span className="text-accent-secondary ml-auto shrink-0 rounded border border-white/10 bg-black/60 px-2 py-0.5 font-mono text-xs">
									{formatTimecode(trimmedSeconds)}
								</span>
							</div>
							{cuts.map((cut) => (
								<div
									key={`cut-${cut.startSeconds}`}
									aria-hidden
									className="bg-bg/85 border-danger/60 pointer-events-none absolute inset-y-0 z-10 border-x-2 border-dashed"
									style={{
										left: timeToPercent(cut.startSeconds, durationSeconds),
										right: `calc(100% - ${timeToPercent(cut.endSeconds, durationSeconds)})`
									}}
								/>
							))}
							{silences.map((silence) => (
								<div
									key={silence.startSeconds}
									aria-hidden
									className="bg-warning/15 pointer-events-none absolute inset-y-0"
									style={{
										left: timeToPercent(silence.startSeconds, durationSeconds),
										right: `calc(100% - ${timeToPercent(silence.endSeconds, durationSeconds)})`
									}}
								/>
							))}
						</div>
						<div
							aria-hidden
							className="bg-accent shadow-accent-glow pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 shadow-lg"
							style={{ left: timeToPercent(currentTimeSeconds, durationSeconds) }}
						>
							<div className="bg-accent absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-sm" />
						</div>
					</div>
					<TrimHandle
						edge="start"
						seconds={trim.startSeconds}
						durationSeconds={durationSeconds}
						label={t('trimStartLabel')}
						timeAtPointer={timeAtPointer}
						onChange={onTrimChange}
					/>
					<TrimHandle
						edge="end"
						seconds={trim.endSeconds}
						durationSeconds={durationSeconds}
						label={t('trimEndLabel')}
						timeAtPointer={timeAtPointer}
						onChange={onTrimChange}
					/>
					{silences.map((silence) => (
						<TimelineFlag
							key={`silence-${silence.startSeconds}`}
							kind="silence"
							atSeconds={silence.startSeconds}
							durationSeconds={durationSeconds}
							label={t('silencePinLabel', {
								start: formatTimecode(silence.startSeconds),
								end: formatTimecode(silence.endSeconds)
							})}
							onJump={onSeek}
						/>
					))}
					{fillerWords.map((filler, index) => (
						<TimelineFlag
							key={`filler-${index}`}
							kind="filler"
							atSeconds={filler.atSeconds}
							durationSeconds={durationSeconds}
							label={t('fillerPinLabel', {
								word: filler.word,
								at: formatTimecode(filler.atSeconds)
							})}
							onJump={onSeek}
						/>
					))}
				</div>
			) : (
				<p className="text-text-faint py-8 text-center text-sm">{t('empty')}</p>
			)}
		</section>
	)
}
