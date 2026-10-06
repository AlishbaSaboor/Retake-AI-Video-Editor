import {
	annotationsAt,
	obscureGridSize,
	PENCIL_WIDTH_FRACTION,
	TEXT_HEIGHT_FRACTION,
	toPixels,
	type Annotation,
	type ObscureKind
} from './annotations'
import { captionAt, type Caption } from './captions'
import { editedStarts, type Segment } from './sequence'
import {
	animationAt,
	LOWER_THIRD_ANIMATION,
	zoomViewAt,
	type Animation,
	type LowerThird,
	type MotionState,
	type Zoom,
	type ZoomView
} from './motion'
import { bandColor, canvasFont, DEFAULT_TEXT_STYLE, type TextStyle } from './text-style'
import { outputSize, pictureMatrix, type PictureTransform, type Size } from './transform'

// Motion graphics, v1: one title card, one watermark and captions, laid over the
// edited video. Both are part of the edit (undoable, cleared by reset) and
// timed in the edited video's own time — "the first 3 seconds" is the first
// 3 seconds of the export, whatever was trimmed or moved. The export draws
// them onto its canvas with drawOverlays; the preview places HTML over the
// <video> with the same geometry, so the two match.

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type Corner = (typeof CORNERS)[number]

/** Text shown from `startSeconds` for `durationSeconds` of the edited video; `style` absent is the default look. */
export type TitleCard = {
	text: string
	startSeconds: number
	durationSeconds: number
	style?: TextStyle
	/** How it comes in and goes out; absent: it just appears and disappears. */
	animation?: Animation
	/** Its centre, as fractions of the frame, once moved by hand; absent: the middle. */
	at?: { x: number; y: number }
}

/** Where a title's centre is, as fractions of the frame. */
export function titleCentre(title: TitleCard): { x: number; y: number } {
	return title.at ?? { x: 0.5, y: 0.5 }
}

/**
 * A PNG or JPG logo, as a data URL, for the whole video: in `corner`, or
 * where it was dragged (`at`); 15% of the frame's width unless resized.
 */
export type Watermark = {
	image: string
	aspect: number
	corner: Corner
	/** Its width, as a fraction of the frame's; absent: `WATERMARK_WIDTH_FRACTION`. */
	size?: number
	/** Its top-left corner, as fractions of the frame, once placed by hand; absent: in `corner`. */
	at?: { x: number; y: number }
	/** Turned clockwise about its centre, in degrees; absent: upright. */
	rotation?: number
}

/** `captions` is empty when they're off. */
export type Overlays = {
	title: TitleCard | null
	watermark: Watermark | null
	captions: Caption[]
	captionStyle: TextStyle
	annotations: Annotation[]
	lowerThird: LowerThird | null
	/** A push-in or pull-out on the whole picture (annotations with it; not the frame's text). */
	zoom: Zoom | null
}

// The lower third's band, in the frame: its left edge and its bottom (above
// two lines of captions), as fractions of the frame; its name's and
// subtitle's text heights, of the frame's shorter side; line spacing and the
// space inside the band, of the name's height.
export const LOWER_THIRD_LEFT_FRACTION = 0.05
export const LOWER_THIRD_BOTTOM_FRACTION = 0.28
export const LOWER_THIRD_NAME_FRACTION = 0.065
export const LOWER_THIRD_SUBTITLE_FRACTION = 0.045
export const LOWER_THIRD_LINE_SCALE = 1.3
export const LOWER_THIRD_PADDING_SCALE = 0.35

/** The title's text height, as a fraction of the frame's shorter side. */
export const TITLE_FONT_FRACTION = 0.08
/** The dark band behind the title, as a multiple of the text height. */
export const TITLE_BAND_SCALE = 2
/** The widest the title's text may be, as a fraction of the picture's width. */
export const TITLE_MAX_WIDTH_FRACTION = 0.9
export const TITLE_BAND_COLOR = 'rgba(0, 0, 0, 0.6)'
/** Caption text height (of the frame's shorter side), and the gap below the last line (of its height). */
export const CAPTION_FONT_FRACTION = 0.06
export const CAPTION_BOTTOM_FRACTION = 0.06
/** Caption line spacing, as a multiple of the text height. */
export const CAPTION_LINE_SCALE = 1.4
/** Space either side of a caption line's text, as a multiple of the text height. */
export const CAPTION_PADDING_SCALE = 0.3
/** The watermark's width, and its distance from the edges, as fractions of the picture's width. */
export const WATERMARK_WIDTH_FRACTION = 0.15
const WATERMARK_MARGIN_FRACTION = 0.03

export function titleShownAt(title: TitleCard, seconds: number): boolean {
	return seconds >= title.startSeconds && seconds < title.startSeconds + title.durationSeconds
}

/** Where the watermark sits in a `width`×`height` picture, in its pixels. */
export function watermarkRect(watermark: Watermark, width: number, height: number) {
	const w = width * (watermark.size ?? WATERMARK_WIDTH_FRACTION)
	const h = w / watermark.aspect
	if (watermark.at) {
		// Kept inside the frame, even if a later crop made the frame narrower.
		return {
			x: Math.min(Math.max(watermark.at.x * width, 0), Math.max(width - w, 0)),
			y: Math.min(Math.max(watermark.at.y * height, 0), Math.max(height - h, 0)),
			width: w,
			height: h
		}
	}
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
	segmentIndex: number | null = null,
	/** Which video `sourceSeconds` is in, when `segmentIndex` doesn't say: absent is the main one. */
	source?: string
): number | null {
	const ofVideo = (s: Segment) => (s.source ?? '') === (source ?? '')
	const holds = (s: Segment) => sourceSeconds >= s.startSeconds && sourceSeconds <= s.endSeconds
	const known = segmentIndex === null ? undefined : segments[segmentIndex]
	const inside = segments.findIndex(
		(s) => ofVideo(s) && sourceSeconds >= s.startSeconds && sourceSeconds < s.endSeconds
	)
	const index =
		known && holds(known) && segmentIndex !== null
			? segmentIndex
			: inside >= 0
				? inside
				: segments.findIndex((s) => ofVideo(s) && sourceSeconds === s.endSeconds)
	const segment = segments[index]
	if (!segment) return null
	const before = editedStarts(segments)[index] ?? 0
	return before + (sourceSeconds - segment.startSeconds) / (segment.rate ?? 1)
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

/** Reads a PNG or JPG the user picked into what a watermark keeps: a data URL and its shape. */
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
	scratch: HTMLCanvasElement,
	filter: string | null
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
	// Graded as the picture is: a color matrix and an average commute, so
	// grading the averaged patch is grading what it averages.
	if (filter) context.filter = filter
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
	context.filter = 'none'
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
	scratch: HTMLCanvasElement,
	filter: string | null
) {
	for (const item of annotationsAt(annotations, seconds)) {
		const pixels = toPixels(item.rect, picture.width, picture.height)
		if (item.kind === 'blur' || item.kind === 'pixelate') {
			drawObscured(context, source, pixels, picture.width, item.kind, scratch, filter)
			continue
		}
		if (item.kind === 'pencil') {
			drawStroke(context, item.points, pixels, item.color, picture.width)
			continue
		}
		if (item.kind === 'box') {
			context.fillStyle = item.color
			context.fillRect(pixels.x, pixels.y, pixels.width, pixels.height)
			continue
		}
		const style = item.style ?? DEFAULT_TEXT_STYLE
		// Text comes in and goes out as its animation says, across the picture.
		const motion = animationAt(item.animation, item.startSeconds, item.endSeconds, seconds)
		if (!motion) continue
		context.save()
		applyMotion(
			context,
			motion,
			{ x: picture.width, y: picture.height },
			{ x: pixels.x + pixels.width / 2, y: pixels.y + pixels.height / 2 }
		)
		// About its centre: unmirrored, then turned, so it turns the way it was
		// dragged on screen whatever the flips; its band turns with it.
		context.translate(pixels.x + pixels.width / 2, pixels.y + pixels.height / 2)
		context.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1)
		context.rotate(((item.rotation ?? 0) * Math.PI) / 180)
		const band = { x: -pixels.width / 2, y: -pixels.height / 2, w: pixels.width, h: pixels.height }
		if (style.background) {
			context.fillStyle = bandColor(style.background)
			context.fillRect(band.x, band.y, band.w, band.h)
		}
		// Clipped to its band, as the preview's overflow is.
		context.beginPath()
		context.rect(band.x, band.y, band.w, band.h)
		context.clip()
		context.font = canvasFont(style, pixels.height * TEXT_HEIGHT_FRACTION * style.size)
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillStyle = style.color
		context.fillText(item.text, 0, 0)
		context.restore()
	}
}

/**
 * Sets `context` up to draw an element where its motion has it: faded,
 * moved (by fractions of `across`) and scaled about `centre`.
 */
function applyMotion(
	context: CanvasRenderingContext2D,
	motion: MotionState,
	across: { x: number; y: number },
	centre: { x: number; y: number }
) {
	context.globalAlpha *= motion.opacity
	context.translate(motion.dx * across.x + centre.x, motion.dy * across.y + centre.y)
	context.scale(motion.scale, motion.scale)
	context.translate(-centre.x, -centre.y)
}

/**
 * The picture's matrix under a zoom: the crop and rotation first, then the
 * push-in, so it magnifies what the output shows, with the view's centre
 * (fractions of the frame) moved to the middle.
 */
export function zoomedMatrix(
	m: { a: number; b: number; c: number; d: number; e: number; f: number },
	view: ZoomView,
	frame: { width: number; height: number }
) {
	const { scale, centre } = view
	return {
		a: m.a * scale,
		b: m.b * scale,
		c: m.c * scale,
		d: m.d * scale,
		e: (m.e - centre.x * frame.width) * scale + frame.width / 2,
		f: (m.f - centre.y * frame.height) * scale + frame.height / 2
	}
}

/** A pencil stroke: round-capped, one width for every stroke, through its points in `pixels`. */
function drawStroke(
	context: CanvasRenderingContext2D,
	points: { x: number; y: number }[],
	pixels: { x: number; y: number; width: number; height: number },
	color: string,
	pictureWidth: number
) {
	context.beginPath()
	for (const [index, point] of points.entries()) {
		const x = pixels.x + point.x * pixels.width
		const y = pixels.y + point.y * pixels.height
		if (index === 0) context.moveTo(x, y)
		else context.lineTo(x, y)
	}
	context.lineWidth = PENCIL_WIDTH_FRACTION * pictureWidth
	context.lineCap = 'round'
	context.lineJoin = 'round'
	context.strokeStyle = color
	context.stroke()
}

/**
 * Mid-transition: the clip dissolving in over the picture, how far (0 to 1),
 * and how much of the picture comes through a fade (1 all, 0 black); and
 * each clip's color grade, as a canvas filter (null: none).
 */
export type FrameMix = {
	incoming: CanvasImageSource | null
	incomingAlpha: number
	light: number
	filter?: string | null
	incomingFilter?: string | null
}
const NO_MIX: FrameMix = { incoming: null, incomingAlpha: 0, light: 1 }
const HALF = 0.5

/**
 * Draws one frame of the edited video at `seconds` onto `context`, whose
 * canvas is the output's size: black, the picture through its transform
 * (pictureMatrix) with any clip dissolving in over it, the annotations
 * pinned to the picture with it, a fade's black, then the captions, title
 * and logo, which belong to the output frame, over them. A blur blurs the
 * video, not the captions, and a fade takes the picture to black, not the
 * captions. `scratch` is a spare canvas the blur and pixelate work in.
 */
export function drawFrame(
	context: CanvasRenderingContext2D,
	source: CanvasImageSource,
	picture: Size,
	transform: PictureTransform,
	overlays: Overlays,
	seconds: number,
	logo: HTMLImageElement | null,
	scratch: HTMLCanvasElement,
	mix: FrameMix = NO_MIX
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
	const view = zoomViewAt(overlays.zoom, seconds)
	const z = view.scale === 1 ? m : zoomedMatrix(m, view, { width, height })
	context.setTransform(z.a, z.b, z.c, z.d, z.e, z.f)
	const { incoming, incomingAlpha, light, filter = null, incomingFilter = null } = mix
	// The grade only where there is one: an ungraded frame costs nothing extra.
	if (filter) context.filter = filter
	context.drawImage(source, 0, 0, picture.width, picture.height)
	context.filter = 'none'
	if (incoming && incomingAlpha > 0) {
		context.globalAlpha = Math.min(1, incomingAlpha)
		if (incomingFilter) context.filter = incomingFilter
		context.drawImage(incoming, 0, 0, picture.width, picture.height)
		context.filter = 'none'
		context.globalAlpha = 1
	}
	// A blur samples whichever clip shows most, graded as that clip is.
	const incomingShows = incoming !== null && incomingAlpha > HALF
	drawAnnotations(
		context,
		overlays.annotations,
		seconds,
		incomingShows && incoming ? incoming : source,
		picture,
		transform,
		scratch,
		incomingShows ? incomingFilter : filter
	)
	context.setTransform(1, 0, 0, 1, 0, 0)
	if (light < 1) {
		context.fillStyle = `rgba(0, 0, 0, ${1 - Math.max(0, light)})`
		context.fillRect(0, 0, width, height)
	}
	drawFrameOverlays(context, overlays, seconds, logo)
}

/** The lower third, while it shows: its band at the frame's lower left, sliding in and out. */
function drawLowerThird(context: CanvasRenderingContext2D, lower: LowerThird, seconds: number) {
	const end = lower.startSeconds + lower.durationSeconds
	const motion = animationAt(LOWER_THIRD_ANIMATION, lower.startSeconds, end, seconds)
	if (!motion) return
	const { width, height } = context.canvas
	const shorter = Math.min(width, height)
	const { style } = lower
	const nameFont = shorter * LOWER_THIRD_NAME_FRACTION * style.size
	const subtitleFont = shorter * LOWER_THIRD_SUBTITLE_FRACTION * style.size
	const nameLine = nameFont * LOWER_THIRD_LINE_SCALE
	const subtitleLine = lower.subtitle ? subtitleFont * LOWER_THIRD_LINE_SCALE : 0
	const padding = nameFont * LOWER_THIRD_PADDING_SCALE
	context.font = canvasFont(style, nameFont)
	const nameWidth = context.measureText(lower.name).width
	context.font = canvasFont(style, subtitleFont)
	const subtitleWidth = lower.subtitle ? context.measureText(lower.subtitle).width : 0
	const bandWidth = Math.max(nameWidth, subtitleWidth) + padding * 2
	const bandHeight = nameLine + subtitleLine + padding
	const x = width * LOWER_THIRD_LEFT_FRACTION
	const y = height * (1 - LOWER_THIRD_BOTTOM_FRACTION) - bandHeight
	context.save()
	applyMotion(
		context,
		motion,
		{ x: width, y: height },
		{ x: x + bandWidth / 2, y: y + bandHeight / 2 }
	)
	if (style.background) {
		context.fillStyle = bandColor(style.background)
		context.fillRect(x, y, bandWidth, bandHeight)
	}
	context.textAlign = 'left'
	context.textBaseline = 'middle'
	context.fillStyle = style.color
	context.font = canvasFont(style, nameFont)
	context.fillText(lower.name, x + padding, y + padding / 2 + nameLine / 2)
	if (lower.subtitle) {
		context.font = canvasFont(style, subtitleFont)
		context.fillText(lower.subtitle, x + padding, y + padding / 2 + nameLine + subtitleLine / 2)
	}
	context.restore()
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
	const { title, watermark, captions, captionStyle } = overlays
	const caption = captionAt(captions, seconds)
	if (caption) {
		const fontPixels = Math.round(shorter * CAPTION_FONT_FRACTION * captionStyle.size)
		const lineHeight = fontPixels * CAPTION_LINE_SCALE
		const padding = fontPixels * CAPTION_PADDING_SCALE
		context.font = canvasFont(captionStyle, fontPixels)
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		const bottom = height * (1 - CAPTION_BOTTOM_FRACTION)
		for (const [index, line] of caption.lines.entries()) {
			const middle = bottom - (caption.lines.length - index - 0.5) * lineHeight
			const lineWidth = context.measureText(line).width + padding * 2
			if (captionStyle.background) {
				context.fillStyle = bandColor(captionStyle.background)
				context.fillRect((width - lineWidth) / 2, middle - lineHeight / 2, lineWidth, lineHeight)
			}
			context.fillStyle = captionStyle.color
			context.fillText(line, width / 2, middle)
		}
	}
	const titleMotion =
		title &&
		animationAt(
			title.animation,
			title.startSeconds,
			title.startSeconds + title.durationSeconds,
			seconds
		)
	if (title && titleMotion) {
		const style = title.style ?? DEFAULT_TEXT_STYLE
		const fontPixels = Math.round(shorter * TITLE_FONT_FRACTION * style.size)
		const band = fontPixels * TITLE_BAND_SCALE
		const centre = titleCentre(title)
		const x = centre.x * width
		const y = centre.y * height
		context.save()
		applyMotion(context, titleMotion, { x: width, y: height }, { x, y })
		if (style.background) {
			context.fillStyle = bandColor(style.background)
			context.fillRect(0, y - band / 2, width, band)
		}
		context.font = canvasFont(style, fontPixels)
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.fillStyle = style.color
		context.fillText(title.text, x, y, width * TITLE_MAX_WIDTH_FRACTION)
		context.restore()
	}
	if (overlays.lowerThird) drawLowerThird(context, overlays.lowerThird, seconds)
	if (watermark && logo) {
		const rect = watermarkRect(watermark, width, height)
		context.save()
		context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2)
		context.rotate(((watermark.rotation ?? 0) * Math.PI) / 180)
		context.drawImage(logo, -rect.width / 2, -rect.height / 2, rect.width, rect.height)
		context.restore()
	}
}
