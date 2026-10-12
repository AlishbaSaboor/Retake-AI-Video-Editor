// How the title, the captions and annotation text look: font, size, color
// and background band. The fonts are CSS's generic families, which the
// preview's HTML and the export's canvas resolve to the same installed font
// in the same browser, so both draw the same letters.

export const FONTS = ['sans', 'serif', 'mono', 'handwriting'] as const
export type Font = (typeof FONTS)[number]

/**
 * `size` is a multiple of the default size; `background` null draws no band.
 * `highlight`, when set, is the colour of the word being said (a Make it
 * look's accent); otherwise one is picked to stand out from `color`.
 */
export type TextStyle = {
	font: Font
	size: number
	color: string
	background: string | null
	highlight?: string
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
	font: 'sans',
	size: 1,
	color: '#ffffff',
	background: '#000000'
}
export const MIN_TEXT_SIZE = 0.5
export const MAX_TEXT_SIZE = 2
/** The band behind the text lets some of the picture through. */
export const BAND_OPACITY = 0.6

const FAMILIES: Record<Font, string> = {
	sans: 'sans-serif',
	serif: 'serif',
	mono: 'monospace',
	handwriting: 'cursive'
}

export function fontFamily(font: Font): string {
	return FAMILIES[font]
}

/** The canvas font for `pixels`-high bold text in `style`'s family. */
export function canvasFont(style: TextStyle, pixels: number): string {
	return `bold ${Math.round(pixels)}px ${fontFamily(style.font)}`
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function isHexColor(value: string): boolean {
	return HEX_COLOR.test(value)
}

/** The plain color names a command may use ("make the title red"). */
const COLOR_NAMES: Record<string, string> = {
	white: '#ffffff',
	black: '#000000',
	red: '#ff0000',
	green: '#00c000',
	blue: '#0050ff',
	yellow: '#ffff00',
	orange: '#ff8000',
	purple: '#8000c0',
	pink: '#ff69b4',
	grey: '#808080',
	gray: '#808080',
	cyan: '#00ffff',
	magenta: '#ff00ff',
	brown: '#8b4513'
}

/** A color as #rrggbb, from #rrggbb or a plain name; null for anything else. */
export function toHexColor(value: string): string | null {
	const color = value.trim().toLowerCase()
	if (isHexColor(color)) return color
	return COLOR_NAMES[color] ?? null
}

/** A band color, as drawn: the style's color at BAND_OPACITY. */
export function bandColor(hex: string): string {
	const value = Number.parseInt(hex.slice(1), 16)
	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${BAND_OPACITY})`
}

export function clampTextSize(size: number): number {
	return Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, Math.round(size * 100) / 100))
}

export function isDefaultStyle(style: TextStyle | undefined): boolean {
	return (
		!style ||
		(style.font === DEFAULT_TEXT_STYLE.font &&
			style.size === DEFAULT_TEXT_STYLE.size &&
			style.color === DEFAULT_TEXT_STYLE.color &&
			style.background === DEFAULT_TEXT_STYLE.background)
	)
}
