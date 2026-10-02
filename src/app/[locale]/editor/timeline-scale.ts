// Pure timeline math — no React, so it's unit-testable on its own.

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

// Candidate spacings between labelled ruler ticks, in seconds. The ruler
// takes the smallest one that keeps the ruler at or under MAX_RULER_INTERVALS, so a
// 20-second clip gets a label every 2s and an hour-long one every 10 minutes.
const TICK_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
const LONGEST_TICK_STEP_SECONDS = 3600
const MAX_RULER_INTERVALS = 10

/** Whether a media element's reported duration is usable for a timeline. */
export function isKnownDuration(durationSeconds: number): boolean {
	return Number.isFinite(durationSeconds) && durationSeconds > 0
}

/** Times, in seconds, at which the ruler draws a labelled tick. */
export function rulerTicks(durationSeconds: number): number[] {
	if (!isKnownDuration(durationSeconds)) return []
	const step =
		TICK_STEPS_SECONDS.find((candidate) => durationSeconds / candidate <= MAX_RULER_INTERVALS) ??
		LONGEST_TICK_STEP_SECONDS
	const ticks: number[] = []
	for (let time = 0; time <= durationSeconds; time += step) ticks.push(time)
	return ticks
}

/** `m:ss`, or `h:mm:ss` past the hour. Fractions of a second are dropped. */
export function formatTimecode(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds))
	const hours = Math.floor(whole / SECONDS_PER_HOUR)
	const minutes = Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
	const secs = String(whole % SECONDS_PER_MINUTE).padStart(2, '0')
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

export function clampTime(seconds: number, durationSeconds: number): number {
	return Math.min(Math.max(seconds, 0), durationSeconds)
}

/**
 * The usable part of a clip, in source-file seconds. Trimming only moves
 * these two numbers — the source is never cut — so any trim can be undone
 * by dragging a handle back out.
 */
export type TrimRange = { startSeconds: number; endSeconds: number }
export type TrimEdge = 'start' | 'end'

// The shortest clip a trim can leave, so the two handles can never cross.
const MIN_TRIM_SECONDS = 0.1

/** Moves one edge of a trim, keeping it inside the source and short of the other edge. */
export function moveTrimEdge(
	range: TrimRange,
	edge: TrimEdge,
	seconds: number,
	durationSeconds: number
): TrimRange {
	return edge === 'start'
		? {
				...range,
				startSeconds: clampTime(
					Math.min(seconds, range.endSeconds - MIN_TRIM_SECONDS),
					durationSeconds
				)
			}
		: {
				...range,
				endSeconds: clampTime(
					Math.max(seconds, range.startSeconds + MIN_TRIM_SECONDS),
					durationSeconds
				)
			}
}

/** A time's position along the timeline, as a CSS percentage. */
export function timeToPercent(seconds: number, durationSeconds: number): string {
	if (!isKnownDuration(durationSeconds)) return '0%'
	return `${(clampTime(seconds, durationSeconds) / durationSeconds) * 100}%`
}
