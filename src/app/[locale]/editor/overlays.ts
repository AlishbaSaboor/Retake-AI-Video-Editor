import {
	annotationsAt,
	obscureGridSize,
	TEXT_HEIGHT_FRACTION,
	toPixels,
	type Annotation,
	type ObscureKind
} from './annotations'
import { captionAt, type Caption } from './captions'
import { segmentSeconds, type Segment } from './sequence'
import { outputSize, pictureMatrix, type PictureTransform, type Size } from './transform'

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
export type Overlays = {
	title: TitleCard | null
	watermark: Watermark | null
	captions: Caption[]
	annotations: Annotation[]
}

/** The title's text height, as a fraction of the frame's shorter side. */
export const TITLE_FONT_FRACTION = 0.08
/** The dark band behind the title, as a multiple of the text height. */
export const TITLE_BAND_SCALE = 2
/** The widest the title's text may be, as a fraction of the picture's width. */
const TITLE_MAX_WIDTH_FRACTION = 0.9
export const TITLE_BAND_COLOR = 'rgba(0, 0, 0, 0.6)'
/** Caption text height (of the frame's shorter side), and the gap below the last line (of its height). */
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

/**
 * Blurs or pixelates a patch of the picture, cheaply enough to run every
 * frame: the patch of the source is shrunk into `scratch` (one pixel per
 * block, averaged properly so it doesn't shimmer) and stretched back over
 * it, bilinearly for a blur, in hard blocks for a pixelate. Two image copies
 * and no per-pixel work in JavaScript. Measured in headless Chromium on half
 * of a 1080p frame: ~3 ms a frame, against ~10–13 ms with high-quality
 * stretching too and ~26–31 ms for `filter: blur()`, which convolves every
 * pixel. PROGRESS_NOTES.md section 3h. `context` is already in picture
 * space, and the patch is read from the source, so it turns and flips with
 * the picture.
 */
function drawObscured(
	context: CanvasRenderingContext2D,
	source: CanvasImageSource,
	pixels: { x: number; y: number; width: number; height: number },
	pictureWidth: number,
	kind: ObscureKind,
	scratch: HTMLCanvasElement
) {
	const grid = obscureGridSize(pixels, pictureWidth, kind)
	if (scratch.width !== grid.width) scratch.width = grid.width
	if (scratch.height !== grid.height) scratch.height = grid.height
	const small = scratch.getContext('2d')
	if (!small) return
	small.imageSmoothingQuality = 'high'
	small.drawImage(
		source,
		pixels.x,
		pixels.y,
		pixels.width,
		pixels.height,
		0,
		0,
		grid.width,
		grid.height
	)
	// 'low' is bilinear, and the default: nothing else drawn on this canvas
	// is left at a costlier setting.
	context.imageSmoothingEnabled = kind === 'blur'
	context.imageSmoothingQuality = 'low'
	context.drawImage(
		scratch,
		0,
		0,
		grid.width,
		grid.height,
		pixels.x,
		pixels.y,
		pixels.width,
		pixels.height
	)
	context.imageSmoothingEnabled = true
}

/**
 * Boxes, blurs, pixelates and text due at `seconds`, in the order they were
 * added, in picture space: `context` is set up to draw the source picture.
 * Text is unmirrored about its own centre, so a flip never reverses it.
 */
function drawAnnotations(
	context: CanvasRenderingContext2D,
	annotations: Annotation[],
	seconds: number,
	source: CanvasImageSource,
	picture: Size,
	transform: PictureTransform,
	scratch: HTMLCanvasElement
) {
	for (const item of annotationsAt(annotations, seconds)) {
		const pixels = toPixels(item.rect, picture.width, picture.height)
		if (item.kind === 'blur' || item.kind === 'pixelate') {
			drawObscured(context, source, pixels, picture.width, item.kind, scratch)
			continue
		}
		context.fillStyle = item.kind === 'box' ? item.color : TITLE_BAND_COLOR
		context.fillRect(pixels.x, pixels.y, pixels.width, pixels.height)
		if (item.kind === 'text') {
			// Clipped to its band, as the preview's overflow is.
			context.save()
			context.beginPath()
			context.rect(pixels.x, pixels.y, pixels.width, pixels.height)
			context.clip()
			context.translate(pixels.x + pixels.width / 2, pixels.y + pixels.height / 2)
			context.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1)
			context.font = `bold ${Math.round(pixels.height * TEXT_HEIGHT_FRACTION)}px sans-serif`
			context.textAlign = 'center'
			context.textBaseline = 'middle'
			context.fillStyle = '#ffffff'
			context.fillText(item.text, 0, 0)
			context.restore()
		}
	}
}

/**
 * Draws one frame of the edited video at `seconds` onto `context`, whose
 * canvas is the output's size: black, the picture through its transform
 * (pictureMatrix), the annotations pinned to the picture with it, then the
 * captions, title and logo, which belong to the output frame, over them. A
 * blur blurs the video, not the captions. `scratch` is a spare canvas the
 * blur and pixelate work in.
 */
export function drawFrame(
	context: CanvasRenderingContext2D,
	source: CanvasImageSource,
	picture: Size,
	transform: PictureTransform,
	overlays: Overlays,
	seconds: number,
	logo: HTMLImageElement | null,
	scratch: HTMLCanvasElement
) {
	const { width, height } = context.canvas
	const output = outputSize(picture, transform)
	const m = pictureMatrix(picture, transform, {
		x: width / output.width,
		y: height / output.height
	})
	context.setTransform(1, 0, 0, 1, 0, 0)
	context.fillStyle = '#000000'
	context.fillRect(0, 0, width, height)
	context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
	context.drawImage(source, 0, 0, picture.width, picture.height)
	drawAnnotations(context, overlays.annotations, seconds, source, picture, transform, scratch)
	context.setTransform(1, 0, 0, 1, 0, 0)
	drawFrameOverlays(context, overlays, seconds, logo)
}

/**
 * The captions, title and logo, in the output frame. Text is sized against
 * the frame's shorter side, so a portrait crop doesn't push a caption line
 * past its edges.
 */
function drawFrameOverlays(
	context: CanvasRenderingContext2D,
	overlays: Overlays,
	seconds: number,
	logo: HTMLImageElement | null
) {
	const { width, height } = context.canvas
	const shorter = Math.min(width, height)
	const { title, watermark, captions } = overlays
	const caption = captionAt(captions, seconds)
	if (caption) {
		const fontPixels = Math.round(shorter * CAPTION_FONT_FRACTION)
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
		const fontPixels = Math.round(shorter * TITLE_FONT_FRACTION)
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
