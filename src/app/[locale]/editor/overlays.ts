import { captionAt, type Caption } from './captions'
import { segmentSeconds, type Segment } from './sequence'

// Motion graphics, v1: one title card, one watermark and captions, laid over the
// edited video. Both are part of the edit (undoable, cleared by reset) and
// timed in the edited video's own time — "the first 3 seconds" is the first
// 3 seconds of the export, whatever was trimmed or moved. The export draws
// them onto its canvas with drawOverlays; the preview places HTML over the
// <video> with the same geometry, so the two match.

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type Corner = (typeof CORNERS)[number]

/** Text shown from `startSeconds` for `durationSeconds` of the edited video. */
export type TitleCard = { text: string; startSeconds: number; durationSeconds: number }

/** A PNG logo, as a data URL, kept in one corner for the whole video. */
export type Watermark = { image: string; aspect: number; corner: Corner }

/** `captions` is empty when they're off. */
export type Overlays = { title: TitleCard | null; watermark: Watermark | null; captions: Caption[] }

/** The title's text height, as a fraction of the picture's height. */
export const TITLE_FONT_FRACTION = 0.08
/** The dark band behind the title, as a multiple of the text height. */
export const TITLE_BAND_SCALE = 2
/** The widest the title's text may be, as a fraction of the picture's width. */
const TITLE_MAX_WIDTH_FRACTION = 0.9
export const TITLE_BAND_COLOR = 'rgba(0, 0, 0, 0.6)'
/** Caption text height, and the gap below the last line, as fractions of the picture's height. */
export const CAPTION_FONT_FRACTION = 0.06
export const CAPTION_BOTTOM_FRACTION = 0.06
/** Caption line spacing, as a multiple of the text height. */
export const CAPTION_LINE_SCALE = 1.4
/** Space either side of a caption line's text, as a multiple of the text height. */
export const CAPTION_PADDING_SCALE = 0.3
/** The watermark's width, and its distance from the edges, as fractions of the picture's width. */
const WATERMARK_WIDTH_FRACTION = 0.15
const WATERMARK_MARGIN_FRACTION = 0.03

export function titleShownAt(title: TitleCard, seconds: number): boolean {
	return seconds >= title.startSeconds && seconds < title.startSeconds + title.durationSeconds
}

/** Where the watermark sits in a `width`×`height` picture, in its pixels. */
export function watermarkRect(watermark: Watermark, width: number, height: number) {
	const w = width * WATERMARK_WIDTH_FRACTION
	const h = w / watermark.aspect
	const margin = width * WATERMARK_MARGIN_FRACTION
	return {
		x: watermark.corner.endsWith('left') ? margin : width - margin - w,
		y: watermark.corner.startsWith('top') ? margin : height - margin - h,
		width: w,
		height: h
	}
}

/**
 * The edited video's time at a source time, given the segments in play
 * order: the length of everything before its segment, plus how far into it.
 * A time that ends one segment and starts another is in `segmentIndex`, the
 * one playback says it's in, when that one holds it; paused at a segment's
 * very end counts as that segment. Null outside them all.
 */
export function editedSecondsAt(
	sourceSeconds: number,
	segments: Segment[],
	segmentIndex: number | null = null
): number | null {
	const holds = (s: Segment) => sourceSeconds >= s.startSeconds && sourceSeconds <= s.endSeconds
	const known = segmentIndex === null ? undefined : segments[segmentIndex]
	const inside = segments.findIndex(
		(s) => sourceSeconds >= s.startSeconds && sourceSeconds < s.endSeconds
	)
	const index =
		known && holds(known) && segmentIndex !== null
			? segmentIndex
			: inside >= 0
				? inside
				: segments.findIndex((s) => sourceSeconds === s.endSeconds)
	const segment = segments[index]
	if (!segment) return null
	const before = segments.slice(0, index).reduce((sum, s) => sum + segmentSeconds(s), 0)
	return before + sourceSeconds - segment.startSeconds
}

/**
 * The picture's box inside a frame of another shape, as percentages of the
 * frame: the video letterboxes, and the overlays must sit on the picture.
 */
export function fitInside(pictureRatio: number, frameRatio: number) {
	return pictureRatio > frameRatio
		? { widthPercent: 100, heightPercent: (frameRatio / pictureRatio) * 100 }
		: { widthPercent: (pictureRatio / frameRatio) * 100, heightPercent: 100 }
}

/** Reads a PNG the user picked into what a watermark keeps: a data URL and its shape. */
export async function readLogo(file: File): Promise<Pick<Watermark, 'image' | 'aspect'>> {
	const image = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () =>
			typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable'))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})
	const element = new Image()
	element.src = image
	await element.decode()
	return { image, aspect: element.naturalWidth / element.naturalHeight }
}

/** Draws the overlays due at `seconds` of the edited video onto a frame already drawn. */
export function drawOverlays(
	context: CanvasRenderingContext2D,
	overlays: Overlays,
	seconds: number,
	logo: HTMLImageElement | null
) {
	const { width, height } = context.canvas
	const { title, watermark, captions } = overlays
	const caption = captionAt(captions, seconds)
	if (caption) {
		const fontPixels = Math.round(height * CAPTION_FONT_FRACTION)
		const lineHeight = fontPixels * CAPTION_LINE_SCALE
		const padding = fontPixels * CAPTION_PADDING_SCALE
		context.font = `bold ${fontPixels}px sans-serif`
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		const bottom = height * (1 - CAPTION_BOTTOM_FRACTION)
		for (const [index, line] of caption.lines.entries()) {
			const middle = bottom - (caption.lines.length - index - 0.5) * lineHeight
			const lineWidth = context.measureText(line).width + padding * 2
			context.fillStyle = TITLE_BAND_COLOR
			context.fillRect((width - lineWidth) / 2, middle - lineHeight / 2, lineWidth, lineHeight)
			context.fillStyle = '#ffffff'
			context.fillText(line, width / 2, middle)
		}
	}
	if (title && titleShownAt(title, seconds)) {
		const fontPixels = Math.round(height * TITLE_FONT_FRACTION)
		const band = fontPixels * TITLE_BAND_SCALE
		context.fillStyle = TITLE_BAND_COLOR
		context.fillRect(0, (height - band) / 2, width, band)
		context.font = `bold ${fontPixels}px sans-serif`
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillStyle = '#ffffff'
		context.fillText(title.text, width / 2, height / 2, width * TITLE_MAX_WIDTH_FRACTION)
	}
	if (watermark && logo) {
		const rect = watermarkRect(watermark, width, height)
		context.drawImage(logo, rect.x, rect.y, rect.width, rect.height)
	}
}
