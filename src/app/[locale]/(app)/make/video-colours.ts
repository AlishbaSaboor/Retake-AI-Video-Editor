// The video's own colours, for a preset's look: read from the small pictures
// Make it already takes (one every 2 seconds), so nothing more is sent or
// paid for. Greys, near-black and near-white say nothing about the video and
// are left out; what's left is grouped by hue, the most saturated counting
// most. A video with too little colour (a white screen recording, a dark
// room) has none, and the preset's own palette is used. Text colours are
// made readable against what's behind them, to WCAG's AA contrast.

/** A colour counts as the video's when it's at least this saturated, */
const MIN_SATURATION = 0.35
/** and neither this dark nor this light (HSL lightness, 0 to 1). */
const MIN_LIGHTNESS = 0.15
const MAX_LIGHTNESS = 0.85
/** Under this share of usable pixels the video has no colour of its own. */
export const MIN_USABLE_SHARE = 0.01
/** Hues are grouped in steps this wide (degrees). */
const HUE_STEP = 15
/** WCAG AA for text: what every text colour reaches against what's behind it. */
export const MIN_CONTRAST = 4.5

type Rgb = { r: number; g: number; b: number }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function toHex({ r, g, b }: Rgb): string {
	return `#${[r, g, b]
		.map((c) =>
			Math.round(clamp01(c) * 255)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`
}

export function fromHex(hex: string): Rgb {
	const value = Number.parseInt(hex.slice(1, 7), 16)
	return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 }
}

/** Hue (0 to 360), saturation and lightness (0 to 1). */
export function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	if (max === min) return { h: 0, s: 0, l }
	const d = max - min
	const s = d / (1 - Math.abs(2 * l - 1))
	const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
	return { h: (h * 60 + 360) % 360, s, l }
}

export function fromHsl(h: number, s: number, l: number): Rgb {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = l - c / 2
	const [r, g, b] =
		h < 60
			? [c, x, 0]
			: h < 120
				? [x, c, 0]
				: h < 180
					? [0, c, x]
					: h < 240
						? [0, x, c]
						: h < 300
							? [x, 0, c]
							: [c, 0, x]
	return { r: r + m, g: g + m, b: b + m }
}

/**
 * The video's most telling colour, from RGBA pixels (canvas ImageData, one
 * array per picture), or null when too few pixels have any colour. Within
 * the winning hue the colour is the saturation-weighted average.
 */
export function dominantColour(pictures: readonly Uint8ClampedArray[]): string | null {
	const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>()
	let usable = 0
	let total = 0
	for (const data of pictures) {
		for (let i = 0; i + 3 < data.length; i += 4) {
			total++
			const rgb = {
				r: (data[i] ?? 0) / 255,
				g: (data[i + 1] ?? 0) / 255,
				b: (data[i + 2] ?? 0) / 255
			}
			const { h, s, l } = toHsl(rgb)
			if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue
			usable++
			const hue = (Math.round(h / HUE_STEP) * HUE_STEP) % 360
			const bucket = buckets.get(hue) ?? { weight: 0, r: 0, g: 0, b: 0 }
			bucket.weight += s
			bucket.r += rgb.r * s
			bucket.g += rgb.g * s
			bucket.b += rgb.b * s
			buckets.set(hue, bucket)
		}
	}
	if (total === 0 || usable / total < MIN_USABLE_SHARE) return null
	const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0]
	if (!best) return null
	return toHex({ r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight })
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
	const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
	const { r, g, b } = fromHex(hex)
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two colours: 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** `colour` laid over `behind` at `opacity`: what's actually seen. */
export function over(colour: string, behind: string, opacity: number): string {
	const a = fromHex(colour)
	const b = fromHex(behind)
	const mix = (x: number, y: number) => x * opacity + y * (1 - opacity)
	return toHex({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) })
}

/** Steps tried each way when making a colour lighter or darker. */
const READABLE_STEPS = 20

/**
 * `colour`, made lighter or darker (its hue kept) until it reads against
 * every one of `behind` at MIN_CONTRAST, the nearest change first. White or
 * black, whichever reads better, when nothing in its hue does.
 */
export function readableOn(colour: string, behind: readonly string[]): string {
	const worst = (candidate: string) => Math.min(...behind.map((b) => contrast(candidate, b)))
	if (worst(colour) >= MIN_CONTRAST) return colour
	const { h, s, l } = toHsl(fromHex(colour))
	for (let step = 1; step <= READABLE_STEPS; step++) {
		for (const next of [l + ((1 - l) * step) / READABLE_STEPS, l - (l * step) / READABLE_STEPS]) {
			const candidate = toHex(fromHsl(h, s, next))
			if (worst(candidate) >= MIN_CONTRAST) return candidate
		}
	}
	return worst('#ffffff') >= worst('#000000') ? '#ffffff' : '#000000'
}

/** The colour at hue `h + turn`, `s` and `l`: for a palette built around the video's colour. */
export function shifted(
	colour: string,
	turn: number,
	saturation: number,
	lightness: number
): string {
	const { h } = toHsl(fromHex(colour))
	return toHex(fromHsl((h + turn + 360) % 360, clamp01(saturation), clamp01(lightness)))
}
