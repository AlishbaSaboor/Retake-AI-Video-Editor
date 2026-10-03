// The annotation layer: filled boxes, blur boxes and text laid over the
// edited video, each shown for its own stretch of the edited timeline. Part
// of the edit like the title card (one undo step per change, cleared by
// reset). Positions are fractions of the picture (0–1 from its top-left), so
// one item lands on the same spot in the preview at any player size and in
// the export at the video's own resolution. An item stays where it is put:
// nothing here follows what moves in the video.

export const ANNOTATION_KINDS = ['box', 'blur', 'text'] as const
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]

/** A rectangle on the picture, as fractions of its width and height. */
export type Rect = { x: number; y: number; width: number; height: number }

/** When an item shows, in seconds of the edited video. */
export type Span = { startSeconds: number; endSeconds: number }

export type Annotation = Span & { id: string; rect: Rect } & (
		{ kind: 'box'; color: string } | { kind: 'blur' } | { kind: 'text'; text: string }
	)

// Omit over each kind of item separately: over the union as a whole it
// would drop every field that isn't common to all of them.
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
/** An item before it's added (and given its id). */
export type NewAnnotation = WithoutId<Annotation>

/** What the pointer does on the picture: draw one of the kinds, move and resize, or erase. */
export type AnnotationTool = 'select' | AnnotationKind | 'erase'

/** How long a new item shows, from where the playhead is, unless the video ends first. */
export const NEW_ANNOTATION_SECONDS = 3
/** The shortest an item may show for: the same floor as a clip. */
export const MIN_ANNOTATION_SECONDS = 0.1
/** The smallest an item may be, as a fraction of the picture each way; smaller drags are stray clicks. */
export const MIN_ANNOTATION_SIZE = 0.02
/** A blur's grain: one averaged block per this fraction of the picture's width. */
export const BLUR_BLOCK_FRACTION = 1 / 40
/** Text height, as a fraction of its box's height: the band keeps a margin above and below. */
export const TEXT_HEIGHT_FRACTION = 0.6
export const DEFAULT_BOX_COLOR = '#000000'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The items showing at `seconds` of the edited video, in the order they're drawn (oldest first). */
export function annotationsAt(items: Annotation[], seconds: number): Annotation[] {
	return items.filter((item) => seconds >= item.startSeconds && seconds < item.endSeconds)
}

/** The box dragged out from one corner to the other, either way round, kept on the picture. */
export function rectBetween(from: { x: number; y: number }, to: { x: number; y: number }): Rect {
	const [left, right] = [clamp(Math.min(from.x, to.x), 0, 1), clamp(Math.max(from.x, to.x), 0, 1)]
	const [top, bottom] = [clamp(Math.min(from.y, to.y), 0, 1), clamp(Math.max(from.y, to.y), 0, 1)]
	return { x: left, y: top, width: right - left, height: bottom - top }
}

export function isBigEnough(rect: Rect): boolean {
	return rect.width >= MIN_ANNOTATION_SIZE && rect.height >= MIN_ANNOTATION_SIZE
}

/** Moved by (dx, dy), stopping at the picture's edges rather than shrinking. */
export function moveRect(rect: Rect, dx: number, dy: number): Rect {
	return {
		...rect,
		x: clamp(rect.x + dx, 0, 1 - rect.width),
		y: clamp(rect.y + dy, 0, 1 - rect.height)
	}
}

/** Its bottom-right corner dragged to (x, y): never past the picture, never below the minimum size. */
export function resizeRect(rect: Rect, x: number, y: number): Rect {
	return {
		...rect,
		width: clamp(x - rect.x, MIN_ANNOTATION_SIZE, 1 - rect.x),
		height: clamp(y - rect.y, MIN_ANNOTATION_SIZE, 1 - rect.y)
	}
}

/** A new item's stretch: from `seconds` for NEW_ANNOTATION_SECONDS, inside the edited video. */
export function newSpan(seconds: number, editedSeconds: number): Span {
	const start = clamp(seconds, 0, Math.max(0, editedSeconds - MIN_ANNOTATION_SECONDS))
	return {
		startSeconds: start,
		endSeconds: Math.min(start + NEW_ANNOTATION_SECONDS, editedSeconds)
	}
}

/** Slid by `delta` seconds as a whole, keeping its length, inside the edited video. */
export function moveSpan(span: Span, delta: number, editedSeconds: number): Span {
	const length = span.endSeconds - span.startSeconds
	const start = clamp(span.startSeconds + delta, 0, Math.max(0, editedSeconds - length))
	return { startSeconds: start, endSeconds: start + length }
}

/** One edge moved to `seconds`: inside the edited video, never closer than the minimum to the other. */
export function moveSpanEdge(
	span: Span,
	edge: 'start' | 'end',
	seconds: number,
	editedSeconds: number
): Span {
	return edge === 'start'
		? { ...span, startSeconds: clamp(seconds, 0, span.endSeconds - MIN_ANNOTATION_SECONDS) }
		: {
				...span,
				endSeconds: clamp(seconds, span.startSeconds + MIN_ANNOTATION_SECONDS, editedSeconds)
			}
}

// Named parts of the picture a typed command can cover: corners are a
// third of each side, halves are halves. The box can be moved and resized
// afterwards like any other.
const THIRD = 1 / 3
export const REGIONS = [
	'top-left',
	'top-right',
	'bottom-left',
	'bottom-right',
	'top',
	'bottom',
	'left',
	'right',
	'center',
	'full'
] as const
export type Region = (typeof REGIONS)[number]

const REGION_RECTS: Record<Region, Rect> = {
	'top-left': { x: 0, y: 0, width: THIRD, height: THIRD },
	'top-right': { x: 1 - THIRD, y: 0, width: THIRD, height: THIRD },
	'bottom-left': { x: 0, y: 1 - THIRD, width: THIRD, height: THIRD },
	'bottom-right': { x: 1 - THIRD, y: 1 - THIRD, width: THIRD, height: THIRD },
	top: { x: 0, y: 0, width: 1, height: 0.5 },
	bottom: { x: 0, y: 0.5, width: 1, height: 0.5 },
	left: { x: 0, y: 0, width: 0.5, height: 1 },
	right: { x: 0.5, y: 0, width: 0.5, height: 1 },
	center: { x: THIRD, y: THIRD, width: THIRD, height: THIRD },
	full: { x: 0, y: 0, width: 1, height: 1 }
}

export function regionRect(region: Region): Rect {
	return REGION_RECTS[region]
}

/** A rect in a `width`×`height` picture's own pixels. */
export function toPixels(rect: Rect, width: number, height: number): Rect {
	return {
		x: rect.x * width,
		y: rect.y * height,
		width: rect.width * width,
		height: rect.height * height
	}
}

/**
 * The size of the small copy a blur is averaged through: one pixel per
 * BLUR_BLOCK_FRACTION of the picture's width, so the grain is the same for
 * any box, and at least one pixel each way.
 */
export function blurGridSize(pixels: Rect, pictureWidth: number) {
	const block = pictureWidth * BLUR_BLOCK_FRACTION
	return {
		width: Math.max(1, Math.round(pixels.width / block)),
		height: Math.max(1, Math.round(pixels.height / block))
	}
}
