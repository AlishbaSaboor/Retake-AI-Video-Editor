'use client'

import { formatTimecode, timeToPercent, type TrimEdge } from './timeline-scale'

// Trims are finer-grained than playhead nudges: arrows move an edge a tenth
// of a second, Shift+arrow a full second.
const SMALL_STEP_SECONDS = 0.1
const LARGE_STEP_SECONDS = 1

type TrimHandleProps = {
	edge: TrimEdge
	seconds: number
	durationSeconds: number
	label: string
	/** Converts a pointer x position into a time along the whole timeline. */
	timeAtPointer: (clientX: number) => number
	onChange: (edge: TrimEdge, seconds: number) => void
}

/** A draggable, keyboard-operable grip on one edge of the clip. */
export function TrimHandle({
	edge,
	seconds,
	durationSeconds,
	label,
	timeAtPointer,
	onChange
}: TrimHandleProps) {
	function handleKeyDown(event: React.KeyboardEvent) {
		const step = event.shiftKey ? LARGE_STEP_SECONDS : SMALL_STEP_SECONDS
		const delta: Record<string, number> = {
			ArrowRight: step,
			ArrowUp: step,
			ArrowLeft: -step,
			ArrowDown: -step
		}
		const change = delta[event.key]
		if (change === undefined) return
		event.preventDefault()
		onChange(edge, seconds + change)
	}

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={durationSeconds}
			aria-valuenow={seconds}
			aria-valuetext={formatTimecode(seconds)}
			className="bg-accent focus-visible:outline-accent absolute top-9 flex h-16 w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded shadow-md transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2"
			style={{ left: timeToPercent(seconds, durationSeconds) }}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId)
			}}
			onPointerMove={(event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
				onChange(edge, timeAtPointer(event.clientX))
			}}
			onKeyDown={handleKeyDown}
		>
			<span aria-hidden className="h-4 w-0.5 rounded-full bg-white/70" />
		</div>
	)
}
