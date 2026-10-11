import type { Rect } from '../overlays/annotations'

// Picture transforms for the whole edited video: flip, rotate to any angle,
// then crop. The order is fixed: the picture is flipped and turned about its
// centre inside a frame that just holds it (its bounding box), so no part of
// the picture is ever lost to a rotation; the corners that leaves are black.
// The crop then keeps a rectangle of that frame, which becomes the output.
// Exact 90° steps give a frame with no corners at all.
//
// One matrix maps the source picture into the output frame. The export draws
// through it, and the preview's CSS boxes are placed from the same numbers,
// so the two match. Annotations are pinned to the picture: they're drawn in
// source-picture space through the same matrix and move, turn and flip with
// it. The title, captions and watermark belong to the output frame.

export const CROP_ASPECTS = ['free', '16:9', '9:16', '1:1', '4:5'] as const
export type CropAspect = (typeof CROP_ASPECTS)[number]

/** Where a following crop's left edge is (a fraction of the frame) at a second of the main video. */
export type CropKey = { seconds: number; x: number }

/**
 * `rect` is fractions of the rotated frame; `aspect` is kept when the frame
 * changes shape. `follow` (Make it's crop that follows a face) moves the
 * crop across the frame over the main video's own time, from key to key.
 * `fit`: the rect holds the whole frame, reaching past it where the shape
 * needs (black bars there), so nothing of the picture is cut off. `blur`
 * (with `fit`): those bars show a blurred, darkened copy of the picture
 * filling the frame instead of black.
 */
export type Crop = {
	rect: Rect
	aspect: CropAspect
	follow?: CropKey[]
	fit?: true
	blur?: true
}

export type PictureTransform = {
	/** Degrees clockwise, in (-180, 180]. */
	rotation: number
	flipH: boolean
	flipV: boolean
	/** Null keeps the whole rotated frame. */
	crop: Crop | null
}

export const IDENTITY_TRANSFORM: PictureTransform = {
	rotation: 0,
	flipH: false,
	flipV: false,
	crop: null
}

export type Size = { width: number; height: number }

const RADIANS_PER_DEGREE = Math.PI / 180
/** The smallest crop, as a fraction of the frame each way. */
export const MIN_CROP_SIZE = 0.05
const WHOLE: Rect = { x: 0, y: 0, width: 1, height: 1 }

export function isIdentity(transform: PictureTransform): boolean {
	return transform.rotation === 0 && !transform.flipH && !transform.flipV && transform.crop === null
}

/** Any angle as the same turn in (-180, 180]. */
export function normalizeDegrees(degrees: number): number {
	const turned = ((((degrees + 180) % 360) + 360) % 360) - 180
	return turned === -180 ? 180 : turned
}

/** The frame that just holds the picture turned by `rotation`: its bounding box. */
export function rotatedFrame(picture: Size, rotation: number): Size {
	const angle = rotation * RADIANS_PER_DEGREE
	// Rounded, so a 90° turn's cos (6e-17) doesn't add a hair to the frame.
	const cos = Math.abs(Math.round(Math.cos(angle) * 1e12) / 1e12)
	const sin = Math.abs(Math.round(Math.sin(angle) * 1e12) / 1e12)
	return {
		width: picture.width * cos + picture.height * sin,
		height: picture.width * sin + picture.height * cos
	}
}

const cropRect = (transform: PictureTransform) => transform.crop?.rect ?? WHOLE

/** The output's size, in the source picture's pixels: the crop of the rotated frame. */
export function outputSize(picture: Size, transform: PictureTransform): Size {
	const frame = rotatedFrame(picture, transform.rotation)
	const crop = cropRect(transform)
	return { width: crop.width * frame.width, height: crop.height * frame.height }
}

/**
 * The export's canvas: the output itself, but never longer on either side
 * than the turned picture's frame is on its longest. A crop is never larger
 * than that frame, nor a turn's frame than itself; only a fitted crop (black
 * bars around the whole picture) is: a 1920×1080 picture fitted to 9:16 is
 * 1920×3413, recorded at 1080×1920.
 */
export function exportSize(picture: Size, transform: PictureTransform): Size {
	const output = outputSize(picture, transform)
	const frame = rotatedFrame(picture, transform.rotation)
	const longest = Math.max(frame.width, frame.height)
	const scale = Math.min(1, longest / Math.max(output.width, output.height))
	return evenPixels({ width: output.width * scale, height: output.height * scale })
}

/**
 * A blurred backdrop is the picture drawn this many pixels wide (its own
 * shape), then stretched with smoothing to cover the frame: a blur that the
 * preview (a canvas scaled by CSS) and the export (drawImage) draw alike.
 */
export const BLUR_SAMPLE_WIDTH = 16
/** How much the backdrop is darkened, so the picture over it stands out. */
export const BLUR_DIM = 0.35

/** The small size a blurred backdrop samples `picture` at. */
export function blurSampleSize(picture: Size): Size {
	return {
		width: BLUR_SAMPLE_WIDTH,
		height: Math.max(1, Math.round((BLUR_SAMPLE_WIDTH * picture.height) / picture.width))
	}
}

/** `inner` scaled to cover `outer`, centred (CSS object-fit: cover), in `outer`'s pixels. */
export function coverRect(inner: Size, outer: Size): Rect {
	const scale = Math.max(outer.width / inner.width, outer.height / inner.height)
	const width = inner.width * scale
	const height = inner.height * scale
	return { x: (outer.width - width) / 2, y: (outer.height - height) / 2, width, height }
}

/** A canvas-sized version of a size: whole, even pixels (video encoders want even sizes), at least 2. */
export function evenPixels(size: Size): Size {
	const even = (value: number) => Math.max(2, 2 * Math.round(value / 2))
	return { width: even(size.width), height: even(size.height) }
}

/** A 2D affine matrix in canvas setTransform order: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number }

/**
 * Maps the source picture's pixels to the output's: flip and turn about the
 * picture's centre, place that centre in the middle of the rotated frame,
 * then shift by the crop. `scale` stretches the output to a canvas whose
 * size was rounded (evenPixels).
 */
export function pictureMatrix(
	picture: Size,
	transform: PictureTransform,
	scale: { x: number; y: number } = { x: 1, y: 1 }
): Matrix {
	const angle = transform.rotation * RADIANS_PER_DEGREE
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	const fx = transform.flipH ? -1 : 1
	const fy = transform.flipV ? -1 : 1
	const frame = rotatedFrame(picture, transform.rotation)
	const crop = cropRect(transform)
	// Where the picture's centre lands in the output.
	const centreX = frame.width / 2 - crop.x * frame.width
	const centreY = frame.height / 2 - crop.y * frame.height
	// Rotation after flip: [cos -sin; sin cos] · [fx 0; 0 fy].
	const a = cos * fx
	const b = sin * fx
	const c = -sin * fy
	const d = cos * fy
	// The picture's centre (W/2, H/2) goes to (centreX, centreY).
	const e = centreX - (a * picture.width) / 2 - (c * picture.height) / 2
	const f = centreY - (b * picture.width) / 2 - (d * picture.height) / 2
	return {
		a: a * scale.x,
		b: b * scale.y,
		c: c * scale.x,
		d: d * scale.y,
		e: e * scale.x,
		f: f * scale.y
	}
}

export function apply(matrix: Matrix, x: number, y: number) {
	return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }
}

/** The inverse map: an output point back to the source picture. */
export function invert(matrix: Matrix): Matrix {
	const { a, b, c, d, e, f } = matrix
	const det = a * d - b * c
	return {
		a: d / det,
		b: -b / det,
		c: -c / det,
		d: a / det,
		e: (c * f - d * e) / det,
		f: (b * e - a * f) / det
	}
}

/** A point on the output (as fractions of it) as a point on the source picture (fractions of it). */
export function outputToPicture(
	picture: Size,
	transform: PictureTransform,
	point: { x: number; y: number }
) {
	const output = outputSize(picture, transform)
	const source = apply(
		invert(pictureMatrix(picture, transform)),
		point.x * output.width,
		point.y * output.height
	)
	return { x: source.x / picture.width, y: source.y / picture.height }
}

const ASPECT_RATIOS: Record<Exclude<CropAspect, 'free'>, number> = {
	'16:9': 16 / 9,
	'9:16': 9 / 16,
	'1:1': 1,
	'4:5': 4 / 5
}

export function aspectRatio(aspect: CropAspect): number | null {
	return aspect === 'free' ? null : ASPECT_RATIOS[aspect]
}

/** The largest rectangle of `ratio` (width over height, in pixels) centred in `frame`, as fractions of it. */
export function centredCrop(ratio: number, frame: Size): Rect {
	const width = Math.min(frame.width, frame.height * ratio)
	const height = width / ratio
	const fw = width / frame.width
	const fh = height / frame.height
	return { x: (1 - fw) / 2, y: (1 - fh) / 2, width: fw, height: fh }
}

/**
 * The smallest rectangle of `ratio` that holds all of `frame`, centred, as
 * fractions of it: past its edges on one axis, which show black.
 */
export function fittedCrop(ratio: number, frame: Size): Rect {
	const width = Math.max(frame.width, frame.height * ratio)
	const height = width / ratio
	const fw = width / frame.width
	const fh = height / frame.height
	return { x: (1 - fw) / 2, y: (1 - fh) / 2, width: fw, height: fh }
}

/**
 * A crop after the frame changed shape (the picture was turned): a preset
 * is fitted again, centred, so it stays that shape; a free crop keeps its
 * place as fractions of the frame.
 */
export function refitCrop(crop: Crop | null, frame: Size): Crop | null {
	if (!crop) return null
	// A followed face was found in the frame before the turn: it no longer applies.
	const still: Crop = { rect: crop.rect, aspect: crop.aspect }
	const ratio = aspectRatio(crop.aspect)
	if (ratio === null) return still
	if (crop.fit) {
		return { ...still, rect: fittedCrop(ratio, frame), fit: true, ...(crop.blur && { blur: true }) }
	}
	return { ...still, rect: centredCrop(ratio, frame) }
}

/** Eases in and out between keys: a camera pan, not a jump. */
const smooth = (p: number) => p * p * (3 - 2 * p)

/** A following crop's left edge at `seconds`: eased between the keys either side, held before the first and after the last. */
export function followedX(follow: readonly CropKey[], seconds: number): number {
	const next = follow.findIndex((key) => key.seconds > seconds)
	const after = follow[next]
	const before = follow[next - 1]
	if (!after) return follow.at(-1)?.x ?? 0
	if (!before) return after.x
	const p = smooth((seconds - before.seconds) / (after.seconds - before.seconds))
	return before.x + (after.x - before.x) * p
}

/**
 * The transform as it is at `sourceSeconds` of the main video: a following
 * crop moved to where it is then. Null (another video is playing) keeps
 * the crop where it's set.
 */
export function transformAt(
	transform: PictureTransform,
	sourceSeconds: number | null
): PictureTransform {
	const crop = transform.crop
	if (!crop?.follow?.length || sourceSeconds === null) return transform
	const x = clamp(followedX(crop.follow, sourceSeconds), 0, 1 - crop.rect.width)
	return { ...transform, crop: { ...crop, rect: { ...crop.rect, x } } }
}

/** Turns the picture to `rotation` degrees, refitting a preset crop to the new frame. */
export function withRotation(
	transform: PictureTransform,
	rotation: number,
	picture: Size
): PictureTransform {
	const normalized = normalizeDegrees(rotation)
	return {
		...transform,
		rotation: normalized,
		crop: refitCrop(transform.crop, rotatedFrame(picture, normalized))
	}
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** A crop rectangle kept inside the frame and at least MIN_CROP_SIZE each way. */
export function clampCrop(rect: Rect): Rect {
	const width = clamp(rect.width, MIN_CROP_SIZE, 1)
	const height = clamp(rect.height, MIN_CROP_SIZE, 1)
	return {
		x: clamp(rect.x, 0, 1 - width),
		y: clamp(rect.y, 0, 1 - height),
		width,
		height
	}
}

/**
 * A crop's bottom-right corner dragged to (x, y) in frame fractions. With a
 * preset, the height follows the width so the shape holds, and both shrink
 * if that would leave the frame.
 */
export function resizeCrop(rect: Rect, x: number, y: number, ratio: number | null, frame: Size) {
	let width = clamp(x - rect.x, MIN_CROP_SIZE, 1 - rect.x)
	let height = clamp(y - rect.y, MIN_CROP_SIZE, 1 - rect.y)
	if (ratio !== null) {
		// In frame fractions, height = width × (frame width / frame height) / ratio.
		const perWidth = frame.width / frame.height / ratio
		height = width * perWidth
		if (height > 1 - rect.y) {
			height = 1 - rect.y
			width = height / perWidth
		}
	}
	return { ...rect, width, height }
}
