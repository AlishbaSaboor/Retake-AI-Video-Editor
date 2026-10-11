// Color adjustments: brightness, contrast, saturation and a look (black and
// white, warm, cool), for the whole video and on top of that for a clip.
//
// All of them are linear in RGB, so a clip's whole grade (the video's, then
// its own) is one 3×4 color matrix, applied in one pass as an SVG
// feColorMatrix: the preview puts it on the <video> as a CSS filter
// (`url(#…)`), the export on its canvas (`context.filter`), so both apply
// exactly the same numbers. One matrix rather than CSS's brightness(),
// contrast() and saturate() chained: measured on a 1080p frame, 14 ms
// against 34 ms in a software-rendered browser, 3.5 against 4.5 ms in Chrome
// on the GPU (1.6 ms with none). A clip with nothing set draws with no filter
// at all. PROGRESS_NOTES.md section 3o.

export const LOOKS = ['none', 'black_and_white', 'warm', 'cool'] as const
export type Look = (typeof LOOKS)[number]

/** Levels are multipliers: 1 is as recorded, 0 to 2 allowed (0–200%). */
export type ColorGrade = { brightness: number; contrast: number; saturation: number; look: Look }

export const NEUTRAL_GRADE: ColorGrade = { brightness: 1, contrast: 1, saturation: 1, look: 'none' }
export const MAX_LEVEL = 2
/** "Increase the brightness" with no amount: 20 points. */
export const LEVEL_STEP = 0.2
export const LEVELS = ['brightness', 'contrast', 'saturation'] as const
export type Level = (typeof LEVELS)[number]

export function isNeutral(grade: ColorGrade | undefined): boolean {
	return (
		!grade ||
		(grade.brightness === 1 &&
			grade.contrast === 1 &&
			grade.saturation === 1 &&
			grade.look === 'none')
	)
}

export function clampLevel(level: number): number {
	return Math.min(MAX_LEVEL, Math.max(0, Math.round(level * 100) / 100))
}

/** An affine color map on RGB (0–1): `m` row by row, then the offsets `o`. */
export type ColorMatrix = { m: number[][]; o: number[] }

const IDENTITY: ColorMatrix = {
	m: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1]
	],
	o: [0, 0, 0]
}

const scale = (r: number, g: number, b: number, o: number[] = [0, 0, 0]): ColorMatrix => ({
	m: [
		[r, 0, 0],
		[0, g, 0],
		[0, 0, b]
	],
	o
})

// Luma weights, as CSS's saturate() uses.
const LUMA = [0.2126, 0.7152, 0.0722]

function saturation(s: number): ColorMatrix {
	return {
		m: [0, 1, 2].map((row) =>
			LUMA.map((weight, column) => weight * (1 - s) + (row === column ? s : 0))
		),
		o: [0, 0, 0]
	}
}

/** Warm and cool: red up and blue down a little, or the other way, as a slight cast. */
const LOOK_MATRICES: Record<Look, ColorMatrix> = {
	none: IDENTITY,
	black_and_white: saturation(0),
	warm: scale(1.1, 1, 0.85, [0.03, 0.01, -0.02]),
	cool: scale(0.88, 1, 1.1, [-0.02, 0.01, 0.04])
}

/** `a` after `b`: one matrix that does b, then a. */
export function compose(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
	const m = a.m.map((row) =>
		[0, 1, 2].map((column) =>
			row.reduce((sum, value, k) => sum + value * (b.m[k]?.[column] ?? 0), 0)
		)
	)
	const o = a.m.map(
		(row, i) => row.reduce((sum, value, k) => sum + value * (b.o[k] ?? 0), 0) + (a.o[i] ?? 0)
	)
	return { m, o }
}

/** One grade as a matrix: brightness, then contrast (about mid-grey), then saturation, then the look. */
export function gradeMatrix(grade: ColorGrade): ColorMatrix {
	const { brightness: b, contrast: c } = grade
	return [
		scale(b, b, b),
		scale(c, c, c, [(1 - c) / 2, (1 - c) / 2, (1 - c) / 2]),
		saturation(grade.saturation),
		LOOK_MATRICES[grade.look]
	].reduce((done, next) => compose(next, done), IDENTITY)
}

/** A clip's whole grade: the video's, then its own on top. Null when nothing is set. */
export function clipMatrix(video: ColorGrade, clip: ColorGrade | undefined): ColorMatrix | null {
	if (isNeutral(video) && isNeutral(clip)) return null
	const whole = gradeMatrix(video)
	return clip && !isNeutral(clip) ? compose(gradeMatrix(clip), whole) : whole
}

/** Applies a matrix to one color (0–255 each), clamped as a filter clamps: for tests and checks. */
export function applyMatrix(matrix: ColorMatrix, rgb: [number, number, number]) {
	const unit = rgb.map((v) => v / 255)
	return matrix.m.map((row, i) => {
		const value = row.reduce((sum, w, k) => sum + w * (unit[k] ?? 0), 0) + (matrix.o[i] ?? 0)
		return Math.round(Math.min(1, Math.max(0, value)) * 255)
	})
}

/** feColorMatrix's `values`: 4×5, alpha untouched. */
export function matrixValues(matrix: ColorMatrix): string {
	const rows = matrix.m.map((row, i) => [...row, 0, matrix.o[i] ?? 0])
	return [...rows, [0, 0, 0, 1, 0]]
		.flat()
		.map((v) => String(Math.round(v * 10_000) / 10_000))
		.join(' ')
}

/** A stable element id for a matrix's filter: the same numbers, the same id. */
export function gradeFilterId(prefix: string, values: string): string {
	let hash = 2166136261
	for (let i = 0; i < values.length; i++) {
		hash ^= values.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return `${prefix}-${(hash >>> 0).toString(36)}`
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Puts a hidden <svg> of filters for `matrices` in the page (`url(#id)`
 * finds them) and returns each one's CSS filter, by values. For the export,
 * which doesn't depend on what the editor happens to render meanwhile.
 * Call the returned remove when done.
 */
export function mountGradeFilters(prefix: string, matrices: ColorMatrix[]) {
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('width', '0')
	svg.setAttribute('height', '0')
	svg.setAttribute('aria-hidden', 'true')
	svg.style.position = 'absolute'
	const filters = new Map<string, string>()
	for (const matrix of matrices) {
		const values = matrixValues(matrix)
		if (filters.has(values)) continue
		const id = gradeFilterId(prefix, values)
		const filter = document.createElementNS(SVG_NS, 'filter')
		filter.setAttribute('id', id)
		// The matrix works on the sRGB values as stored, as CSS's own filters do.
		filter.setAttribute('color-interpolation-filters', 'sRGB')
		const primitive = document.createElementNS(SVG_NS, 'feColorMatrix')
		primitive.setAttribute('type', 'matrix')
		primitive.setAttribute('values', values)
		filter.append(primitive)
		svg.append(filter)
		filters.set(values, `url(#${id})`)
	}
	document.body.append(svg)
	return {
		filterFor: (matrix: ColorMatrix | null) =>
			matrix ? (filters.get(matrixValues(matrix)) ?? null) : null,
		remove: () => svg.remove()
	}
}
