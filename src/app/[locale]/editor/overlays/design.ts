import type { Rect } from './annotations'
import type { Size } from '../model/transform'

// A designed vertical frame, for videos whose picture doesn't carry them (a
// static meeting, and only a meeting: anything else shows whole): instead of
// the picture in black bars, a full-frame animated background in the
// request's colours, the picture as a small rounded card in a corner (or
// hidden), a progress bar and a sound-wave that moves while someone speaks.
// The captions sit in the middle and the titles become cards (overlays.ts).
// Everything is drawn from the edited video's time by the functions here, on
// the export's canvas and on the preview's own canvas alike, so the two
// match.

export const DESIGN_PALETTES = ['reel', 'professional', 'funny', 'ad'] as const
export type DesignPalette = (typeof DESIGN_PALETTES)[number]

/**
 * A Make it look's own background, in place of the named palette's: its
 * colours (built around the video's), and how the bar and the wave show.
 */
export type DesignLook = {
	from: string
	to: string
	shape: string
	accent: string
	bar: 'thin' | 'thick'
	wave: boolean
}

/** The design: its colours, and whether the original picture shows as a corner card or not at all. */
export type Design = { palette: DesignPalette; picture: 'corner' | 'hidden'; look?: DesignLook }

/** What drawing it needs besides the design: how long the edit is, for the progress bar. */
export type DesignedFrame = Design & { totalSeconds: number }

/** Two colours for the moving gradient, one for the soft shapes over it, one for the bar and wave. */
type Palette = { from: string; to: string; shape: string; accent: string }
const PALETTES: Record<DesignPalette, Palette> = {
	reel: { from: '#1b1446', to: '#7a1f6b', shape: '#e2457a', accent: '#ffd400' },
	professional: { from: '#0f2027', to: '#2c5364', shape: '#5d8aa8', accent: '#9ad1d4' },
	funny: { from: '#3a0ca3', to: '#f72585', shape: '#ff9e00', accent: '#ffff00' },
	ad: { from: '#111111', to: '#7a0019', shape: '#ff3b30', accent: '#ffcc00' }
}

export function paletteOf(palette: DesignPalette): Palette {
	return PALETTES[palette]
}

/** The picture card: this wide (a fraction of the frame), at the lower left, its own shape. */
const CARD_WIDTH = 0.44
const CARD_MARGIN = 0.06
const CARD_BOTTOM = 0.92
/** Its corners' radius, as a fraction of the frame's width. */
export const CARD_RADIUS = 0.035

/** Where the picture card sits, as fractions of the frame: lower left, as wide as CARD_WIDTH, the picture's shape. */
export function cardRect(frame: Size, picture: Size): Rect {
	const height = (CARD_WIDTH * frame.width * (picture.height / picture.width)) / frame.height
	return { x: CARD_MARGIN, y: CARD_BOTTOM - height, width: CARD_WIDTH, height }
}

/** The captions' middle line, as a fraction of the frame's height: below the titles, above the card. */
export const DESIGN_CAPTION_Y = 0.6

/** How much a word grows as it's said, how quickly it grows, and how quickly it settles. */
const POP_SCALE = 0.3
const POP_RISE_SECONDS = 0.05
const POP_SECONDS = 0.18

/**
 * A caption word's size at `seconds`, said at `start`: growing quickly,
 * then settling to 1. It never jumps, so the words making room for it
 * move smoothly.
 */
export function wordPop(start: number, seconds: number): number {
	const into = seconds - start
	if (into <= 0 || into >= POP_RISE_SECONDS + POP_SECONDS) return 1
	if (into < POP_RISE_SECONDS) return 1 + POP_SCALE * (into / POP_RISE_SECONDS)
	return 1 + POP_SCALE * (1 - (into - POP_RISE_SECONDS) / POP_SECONDS)
}

/** How many soft shapes drift over the background, and how opaque each is at its middle (hex). */
const SHAPES = 3
const SHAPE_ALPHA_HEX = '66'
/**
 * The most a point of the background is covered by the shapes' colour:
 * every shape's middle on it at once. Text over a designed background is
 * checked against the background mixed with the shapes this much.
 */
export const MAX_SHAPE_COVER = 1 - (1 - Number.parseInt(SHAPE_ALPHA_HEX, 16) / 255) ** SHAPES

/** The progress bar along the bottom and the wave at the lower right, as fractions of the frame. */
const BAR = { x: 0.06, y: 0.955, width: 0.88, height: 0.008 }
/** A look's thick bar: this many times the thin one's height. */
const THICK_BAR = 2.2
const WAVE = { x: 0.62, y: 0.84, width: 0.3, height: 0.05, bars: 7 }

/** Each wave bar's height (0 to 1) at `seconds`: moving while someone speaks, low and still otherwise. */
export function waveHeights(seconds: number, speaking: boolean): number[] {
	return Array.from({ length: WAVE.bars }, (_, i) =>
		speaking ? 0.25 + 0.75 * Math.abs(Math.sin(seconds * 7 + i * 1.3)) : 0.15
	)
}

/** A rounded rectangle's path on `context`. */
export function roundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	const r = Math.min(radius, width / 2, height / 2)
	context.beginPath()
	context.roundRect(x, y, width, height, r)
}

/**
 * The background at `seconds` of the edit, over the whole of `context`'s
 * canvas: a gradient turning slowly between the palette's two colours, soft
 * shapes drifting over it, the progress bar and the wave.
 */
export function drawDesign(
	context: CanvasRenderingContext2D,
	designed: DesignedFrame,
	seconds: number,
	speaking: boolean
) {
	const { width, height } = context.canvas
	const colours = designed.look ?? PALETTES[designed.palette]
	const bar = { ...BAR, height: BAR.height * (designed.look?.bar === 'thick' ? THICK_BAR : 1) }
	context.save()
	context.setTransform(1, 0, 0, 1, 0, 0)
	const angle = seconds * 0.15
	const dx = (Math.cos(angle) * width) / 2
	const dy = (Math.sin(angle) * height) / 2
	const gradient = context.createLinearGradient(
		width / 2 - dx,
		height / 2 - dy,
		width / 2 + dx,
		height / 2 + dy
	)
	gradient.addColorStop(0, colours.from)
	gradient.addColorStop(1, colours.to)
	context.fillStyle = gradient
	context.fillRect(0, 0, width, height)
	// Three soft shapes, each drifting on its own slow loop.
	for (let i = 0; i < SHAPES; i++) {
		const x = width * (0.5 + 0.35 * Math.sin(seconds * 0.23 + i * 2.1))
		const y = height * (0.5 + 0.35 * Math.cos(seconds * 0.17 + i * 1.7))
		const radius = width * (0.35 + 0.1 * i)
		const shape = context.createRadialGradient(x, y, 0, x, y, radius)
		shape.addColorStop(0, `${colours.shape}${SHAPE_ALPHA_HEX}`)
		shape.addColorStop(1, `${colours.shape}00`)
		context.fillStyle = shape
		context.fillRect(0, 0, width, height)
	}
	// The progress bar: how far through the edit.
	const progress = designed.totalSeconds > 0 ? Math.min(1, seconds / designed.totalSeconds) : 0
	context.fillStyle = 'rgba(255, 255, 255, 0.25)'
	roundedRect(
		context,
		bar.x * width,
		bar.y * height,
		bar.width * width,
		bar.height * height,
		height
	)
	context.fill()
	context.fillStyle = colours.accent
	roundedRect(
		context,
		bar.x * width,
		bar.y * height,
		bar.width * width * progress,
		bar.height * height,
		height
	)
	context.fill()
	if (designed.look?.wave === false) {
		context.restore()
		return
	}
	// The wave: bars from the middle line, up and down.
	const step = (WAVE.width * width) / WAVE.bars
	for (const [i, level] of waveHeights(seconds, speaking).entries()) {
		const barHeight = Math.max(2, level * WAVE.height * height)
		roundedRect(
			context,
			WAVE.x * width + i * step + step * 0.2,
			WAVE.y * height - barHeight / 2,
			step * 0.6,
			barHeight,
			step
		)
		context.fill()
	}
	context.restore()
}
