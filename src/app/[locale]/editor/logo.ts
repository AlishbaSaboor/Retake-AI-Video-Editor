import { watermarkRect, type Corner, type Watermark } from './overlays'
import type { Size } from './transform'

/** The images a logo can be. */
export const LOGO_TYPES = ['image/png', 'image/jpeg']
/** A logo's width, as a fraction of the frame's: no smaller, no larger. */
export const MIN_LOGO_SIZE = 0.05
export const MAX_LOGO_SIZE = 0.6

type Point = { x: number; y: number }

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** The logo's box in a frame of `frame`'s shape, as fractions of it. */
export function logoBox(watermark: Watermark, frame: Size) {
	const rect = watermarkRect(watermark, frame.width, frame.height)
	return {
		x: rect.x / frame.width,
		y: rect.y / frame.height,
		width: rect.width / frame.width,
		height: rect.height / frame.height
	}
}

/** A width the logo can have: within the limits, and never taller than the frame. */
export function clampLogoSize(size: number, watermark: Watermark, frame: Size) {
	const tallest = (watermark.aspect * frame.height) / frame.width
	return clamp(size, MIN_LOGO_SIZE, Math.min(MAX_LOGO_SIZE, tallest))
}

/** The logo with its top-left at `at`, kept wholly inside the frame. */
export function placedLogo(watermark: Watermark, frame: Size, at: Point): Watermark {
	const box = logoBox(watermark, frame)
	return {
		...watermark,
		at: { x: clamp(at.x, 0, 1 - box.width), y: clamp(at.y, 0, 1 - box.height) }
	}
}

/** The logo moved by `dx`, `dy` (fractions of the frame), from wherever it is. */
export function movedLogo(watermark: Watermark, frame: Size, dx: number, dy: number) {
	const box = logoBox(watermark, frame)
	return placedLogo(watermark, frame, { x: box.x + dx, y: box.y + dy })
}

/** The logo at `size`: still in its corner if it's in one, else from the same top-left. */
export function resizedLogo(watermark: Watermark, frame: Size, size: number): Watermark {
	const sized = { ...watermark, size: clampLogoSize(size, watermark, frame) }
	return watermark.at ? placedLogo(sized, frame, watermark.at) : sized
}

/**
 * The logo resized by dragging its bottom-right corner to `to`: from its
 * top-left, keeping its shape, as large as the pointer reaches either way.
 */
export function resizedTo(watermark: Watermark, frame: Size, to: Point): Watermark {
	const box = logoBox(watermark, frame)
	const byWidth = to.x - box.x
	const byHeight = ((to.y - box.y) * frame.height * watermark.aspect) / frame.width
	const size = clampLogoSize(Math.max(byWidth, byHeight), watermark, frame)
	return placedLogo({ ...watermark, size }, frame, { x: box.x, y: box.y })
}

/** The logo back in a corner, at its size. */
export function inCorner(watermark: Watermark, corner: Corner): Watermark {
	const next: Watermark = { ...watermark, corner }
	delete next.at
	return next
}

/** An angle written the short way round: more than −180°, up to 180°. */
export function normalDegrees(degrees: number): number {
	const turned = ((((degrees + 180) % 360) + 360) % 360) - 180
	return turned === -180 ? 180 : turned
}

/** The logo turned to `degrees` (clockwise); upright again drops the setting. */
export function rotatedLogo(watermark: Watermark, degrees: number): Watermark {
	const rotation = normalDegrees(Math.round(degrees))
	const next: Watermark = { ...watermark, rotation }
	if (rotation === 0) delete next.rotation
	return next
}

/**
 * The direction from `centre` to `point` (both fractions of `frame`), in
 * degrees clockwise from straight up, measured in the frame's pixels so a
 * wide frame doesn't skew it: what a rotate handle dragged there means.
 */
export function angleTo(centre: Point, point: Point, frame: Size): number {
	const dx = (point.x - centre.x) * frame.width
	const dy = (point.y - centre.y) * frame.height
	return normalDegrees((Math.atan2(dx, -dy) * 180) / Math.PI)
}

/** `point` turned by −`degrees` about `centre` (fractions of `frame`): where it is in the unturned box. */
export function unturned(point: Point, centre: Point, degrees: number, frame: Size): Point {
	const radians = (-degrees * Math.PI) / 180
	const dx = (point.x - centre.x) * frame.width
	const dy = (point.y - centre.y) * frame.height
	return {
		x: centre.x + (dx * Math.cos(radians) - dy * Math.sin(radians)) / frame.width,
		y: centre.y + (dx * Math.sin(radians) + dy * Math.cos(radians)) / frame.height
	}
}
