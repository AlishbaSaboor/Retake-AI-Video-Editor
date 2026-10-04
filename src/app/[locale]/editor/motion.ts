import type { TextStyle } from './text-style'

// Motion graphics, first set: entrances and exits for the title and for
// annotation text, a lower third, and a zoom on the whole picture. All are
// timed in the edited video's own seconds, like the title and captions: a
// cut, a clip's speed or a dissolve before them moves what plays under
// them, never when they show. The preview and the export both draw them
// from the same functions here, at the same edited time.

export const MOTIONS = ['none', 'fade', 'slide', 'pop'] as const
export type MotionKind = (typeof MOTIONS)[number]
export const SIDES = ['left', 'right', 'top', 'bottom'] as const
export type Side = (typeof SIDES)[number]

/** How something comes in or goes out: a kind, the side a slide comes from (or goes to), and how long. */
export type Motion = { kind: MotionKind; side: Side; seconds: number }
/** An element's entrance and exit. */
export type Animation = { in: Motion; out: Motion }

export const NO_MOTION: Motion = { kind: 'none', side: 'left', seconds: 0.5 }
export const NO_ANIMATION: Animation = { in: NO_MOTION, out: NO_MOTION }
export const MIN_MOTION_SECONDS = 0.1
export const MAX_MOTION_SECONDS = 3
export const DEFAULT_MOTION_SECONDS = 0.5

/** Where an element is drawn now: its opacity, its offset (fractions of what it moves across), its scale. */
export type MotionState = { opacity: number; dx: number; dy: number; scale: number }
export const AT_REST: MotionState = { opacity: 1, dx: 0, dy: 0, scale: 1 }

/** Slows to a stop: what comes in arrives gently. */
const easeOut = (p: number) => 1 - (1 - p) ** 3
/** Overshoots a little and settles: a pop. */
function easeOutBack(p: number) {
	const c = 1.70158
	return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2
}
const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

/** One motion at `p` (0: just starting to come in, or gone; 1: at rest). */
function motionAt(motion: Motion, p: number): MotionState {
	const t = clamp01(p)
	if (motion.kind === 'none' || t >= 1) return AT_REST
	if (motion.kind === 'fade') return { ...AT_REST, opacity: easeOut(t) }
	if (motion.kind === 'pop') {
		return { opacity: clamp01(t * 2), dx: 0, dy: 0, scale: 0.5 + 0.5 * easeOutBack(t) }
	}
	// A slide: from a whole width or height off to that side.
	const away = 1 - easeOut(t)
	const dx = motion.side === 'left' ? -away : motion.side === 'right' ? away : 0
	const dy = motion.side === 'top' ? -away : motion.side === 'bottom' ? away : 0
	return { opacity: 1, dx, dy, scale: 1 }
}

/**
 * Where an element shown from `start` to `end` (edited seconds) is at
 * `seconds`: coming in over its entrance, at rest, going out over its exit
 * (each at most half its time on screen, so they never overlap). Null
 * outside its time.
 */
export function animationAt(
	animation: Animation | undefined,
	start: number,
	end: number,
	seconds: number
): MotionState | null {
	if (seconds < start || seconds >= end) return null
	if (!animation) return AT_REST
	const half = (end - start) / 2
	const into = seconds - start
	const left = end - seconds
	const entering = animation.in.kind !== 'none' && into < Math.min(animation.in.seconds, half)
	if (entering) return motionAt(animation.in, into / Math.min(animation.in.seconds, half))
	const leaving = animation.out.kind !== 'none' && left < Math.min(animation.out.seconds, half)
	if (leaving) return motionAt(animation.out, left / Math.min(animation.out.seconds, half))
	return AT_REST
}

export function isStill(animation: Animation | undefined): boolean {
	return !animation || (animation.in.kind === 'none' && animation.out.kind === 'none')
}

export function clampMotionSeconds(seconds: number): number {
	return Math.min(MAX_MOTION_SECONDS, Math.max(MIN_MOTION_SECONDS, seconds))
}

/** A name and a subtitle in a band, sliding in from the left and out again. */
export type LowerThird = {
	name: string
	subtitle: string
	startSeconds: number
	durationSeconds: number
	style: TextStyle
}
/** How a lower third comes in and goes: a slide from and back to the left. */
export const LOWER_THIRD_ANIMATION: Animation = {
	in: { kind: 'slide', side: 'left', seconds: 0.5 },
	out: { kind: 'slide', side: 'left', seconds: 0.5 }
}

/**
 * "Jane, CEO" as a lower third's name and subtitle: split at the first comma
 * (or a dash); all of it the name when there's neither.
 */
export function splitLowerThird(text: string): { name: string; subtitle: string } {
	const match = /^(.*?)\s*(?:,|\s[-–—]\s)\s*(.*)$/.exec(text.trim())
	return match
		? { name: match[1] ?? '', subtitle: match[2] ?? '' }
		: { name: text.trim(), subtitle: '' }
}

/**
 * A slow push-in (`in`: from the whole picture to `amount` times it) or
 * pull-out (`out`: from `amount` back to the whole) between two edited
 * times, towards `focus`: at full zoom, the frame shows the area `amount`
 * times smaller centred there (kept inside the frame).
 */
export type Zoom = {
	startSeconds: number
	endSeconds: number
	direction: 'in' | 'out'
	amount: number
	/** The zoomed area's centre, as fractions of the frame; absent: the frame's centre. */
	focus?: { x: number; y: number }
}

/** What the frame shows: the picture magnified `scale` times, with `centre` (fractions of the frame) in the middle. */
export type ZoomView = { scale: number; centre: { x: number; y: number } }
export const NO_ZOOM: ZoomView = { scale: 1, centre: { x: 0.5, y: 0.5 } }
export const MIN_ZOOM = 1.05
export const MAX_ZOOM = 3
export const DEFAULT_ZOOM = 1.3

export function clampZoom(amount: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, amount))
}

/** Eases in and out: a camera move, not a jump. */
const smooth = (p: number) => p * p * (3 - 2 * p)

/** How far into its magnification a zoom is at `seconds`: 0 (none) to 1 (all of `amount`). */
function zoomProgress(zoom: Zoom, seconds: number): number {
	if (seconds < zoom.startSeconds || seconds >= zoom.endSeconds) return 0
	const p = smooth((seconds - zoom.startSeconds) / (zoom.endSeconds - zoom.startSeconds))
	return zoom.direction === 'in' ? p : 1 - p
}

/** How much the picture is magnified at `seconds`: 1 outside the zoom's time. */
export function zoomAt(zoom: Zoom | null, seconds: number): number {
	return zoom ? 1 + (zoom.amount - 1) * zoomProgress(zoom, seconds) : 1
}

/** A focus moved in just far enough that the area `amount` times smaller around it stays inside the frame. */
export function clampFocus(focus: { x: number; y: number }, amount: number) {
	const half = 0.5 / amount
	const clamp = (value: number) => Math.min(1 - half, Math.max(half, value))
	return { x: clamp(focus.x), y: clamp(focus.y) }
}

/**
 * What the frame shows at `seconds`: the magnification, and the centre
 * moving from the frame's to the focus as it grows. Moving in step keeps
 * the shown area inside the frame all the way.
 */
export function zoomViewAt(zoom: Zoom | null, seconds: number): ZoomView {
	if (!zoom) return NO_ZOOM
	const progress = zoomProgress(zoom, seconds)
	if (progress === 0) return NO_ZOOM
	const focus = clampFocus(zoom.focus ?? NO_ZOOM.centre, zoom.amount)
	return {
		scale: 1 + (zoom.amount - 1) * progress,
		centre: { x: 0.5 + (focus.x - 0.5) * progress, y: 0.5 + (focus.y - 0.5) * progress }
	}
}

/** A point of the frame as shown under `view`, from where it is in the unzoomed frame; and back. */
export function zoomedPoint(view: ZoomView, point: { x: number; y: number }) {
	return {
		x: (point.x - view.centre.x) * view.scale + 0.5,
		y: (point.y - view.centre.y) * view.scale + 0.5
	}
}
export function unzoomedPoint(view: ZoomView, point: { x: number; y: number }) {
	return {
		x: view.centre.x + (point.x - 0.5) / view.scale,
		y: view.centre.y + (point.y - 0.5) / view.scale
	}
}

/** The area a zoom ends on (at full `amount`), as fractions of the frame: the frame's shape, `amount` times smaller. */
export function zoomArea(zoom: Zoom) {
	const size = 1 / zoom.amount
	const centre = clampFocus(zoom.focus ?? NO_ZOOM.centre, zoom.amount)
	return { x: centre.x - size / 2, y: centre.y - size / 2, width: size, height: size }
}

/**
 * The zoom set from an area drawn on the frame: centred on it, magnified so
 * it fills the frame (within the zoom's limits), kept inside the frame. The
 * frame's centre again drops the focus.
 */
export function zoomOnArea(zoom: Zoom, centre: { x: number; y: number }, width: number): Zoom {
	const amount = clampZoom(1 / width)
	const focus = clampFocus(centre, amount)
	const next: Zoom = { ...zoom, amount, focus }
	if (Math.abs(focus.x - 0.5) < 1e-6 && Math.abs(focus.y - 0.5) < 1e-6) delete next.focus
	return next
}
