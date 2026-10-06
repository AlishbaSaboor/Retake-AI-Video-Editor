'use client'

import { cn } from '@/lib/cn'
import { formatTimecode, timeToPercent, type TrimEdge } from './timeline-scale'

// Trims are finer-grained than playhead nudges: arrows move an edge a tenth
// of a second, Shift+arrow a full second.
const TRIM_STEPS = { small: 0.1, large: 1 }

type TrimHandleProps = {
	edge: TrimEdge
	seconds: number
	durationSeconds: number
	label: string
	/** Converts a pointer x position into a time along the handle's track. */
	timeAtPointer: (clientX: number) => number
	onChange: (edge: TrimEdge, seconds: number) => void
	/** A pointer drag began (true) or ended (false), so it can count as one change. */
	onDraggingChange?: (dragging: boolean) => void
	/** The span the handle's track shows, when zoomed in; defaults to the whole clip. */
	view?: { startSeconds: number; endSeconds: number }
	/** Arrow-key steps in seconds (Shift for large); defaults to trim steps. */
	steps?: { small: number; large: number }
	/** Vertical placement within the track; defaults to the main timeline's. */
	className?: string
	/** Where it sits across the track, when that isn't `seconds` along `view`. */
	left?: string
}

/** A draggable, keyboard-operable grip on one edge of the clip. */
export function TrimHandle({
	edge,
	seconds,
	durationSeconds,
	label,
	timeAtPointer,
	onChange,
	onDraggingChange,
	view = { startSeconds: 0, endSeconds: durationSeconds },
	steps = TRIM_STEPS,
	className = 'top-9 h-16',
	left
}: TrimHandleProps) {
	function handleKeyDown(event: React.KeyboardEvent) {
		const step = event.shiftKey ? steps.large : steps.small
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
			aria-valuemin={view.startSeconds}
			aria-valuemax={view.endSeconds}
			aria-valuenow={seconds}
			aria-valuetext={formatTimecode(seconds)}
			className={cn(
				'bg-accent focus-visible:outline-accent absolute flex w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded shadow-md transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2',
				className
			)}
			style={{
				left:
					left ?? timeToPercent(seconds - view.startSeconds, view.endSeconds - view.startSeconds)
			}}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId)
				onDraggingChange?.(true)
			}}
			onLostPointerCapture={() => onDraggingChange?.(false)}
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
