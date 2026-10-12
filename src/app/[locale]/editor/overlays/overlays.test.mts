import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	CAPTION_FONT_FRACTION,
	CAPTION_LINE_SCALE,
	CAPTION_PADDING_SCALE,
	captionFontPixels,
	cardLines,
	designedCardLayout,
	editedSecondsAt,
	fitInside,
	lineReveals,
	popLayout,
	SAFE_MARGIN_FRACTION,
	saidWordAt,
	TITLE_CARD_INSET,
	TITLE_CARD_LINE,
	TITLE_FONT_FRACTION,
	titleShownAt,
	watermarkRect,
	type Watermark
} from './overlays'
import { DESIGN_CAPTION_Y, wordPop } from './design'
import { revealedWords } from './motion'
import type { Size } from '../model/transform'

test('a title shows from its start for its duration, and not at its end', () => {
	const title = { text: 'Hello', startSeconds: 1, durationSeconds: 2 }
	assert.equal(titleShownAt(title, 0.99), false)
	assert.equal(titleShownAt(title, 1), true)
	assert.equal(titleShownAt(title, 2.99), true)
	assert.equal(titleShownAt(title, 3), false)
})

test('the watermark sits in its corner, a margin in from both edges', () => {
	const logo: Watermark = { image: '', aspect: 2, corner: 'bottom-right' }
	// 15% of 1000 wide, half as tall; 30 px in from the edges.
	assert.deepEqual(watermarkRect(logo, 1000, 500), { x: 820, y: 395, width: 150, height: 75 })
	assert.deepEqual(watermarkRect({ ...logo, corner: 'top-left' }, 1000, 500), {
		x: 30,
		y: 30,
		width: 150,
		height: 75
	})
})

test('edited time counts what played before, in play order, not source time', () => {
	// Reordered: 4–10 plays first, then 0–4.
	const segments = [
		{ startSeconds: 4, endSeconds: 10 },
		{ startSeconds: 0, endSeconds: 4 }
	]
	assert.equal(editedSecondsAt(4, segments), 0)
	assert.equal(editedSecondsAt(7, segments), 3)
	assert.equal(editedSecondsAt(1, segments), 7)
	// Paused at the very end of the last segment.
	assert.equal(editedSecondsAt(4, [{ startSeconds: 0, endSeconds: 4 }]), 4)
})

test('a time that ends one segment and starts another is in the one playback is in', () => {
	const swapped = [
		{ startSeconds: 4, endSeconds: 10 },
		{ startSeconds: 0, endSeconds: 4 }
	]
	// At 4 s: the start of the edit, or its end once playback has got there.
	assert.equal(editedSecondsAt(4, swapped, 0), 0)
	assert.equal(editedSecondsAt(4, swapped, 1), 10)
	// An index that doesn't hold the time is ignored.
	assert.equal(editedSecondsAt(7, swapped, 1), 3)
})

test('a held frame under a longer take counts toward the edited time after it', () => {
	const take = { span: { startSeconds: 2, endSeconds: 3 }, takeSeconds: 1.5 }
	const segments = [
		{ startSeconds: 2, endSeconds: 3, voiceOver: { replacement: take, holdSeconds: 0.5 } },
		{ startSeconds: 5, endSeconds: 8 }
	]
	assert.equal(editedSecondsAt(6, segments), 2.5)
})

test('a source time that is cut away has no edited time', () => {
	assert.equal(editedSecondsAt(4.5, [{ startSeconds: 0, endSeconds: 4 }]), null)
})

test('the picture fills the frame one way and letterboxes the other', () => {
	assert.deepEqual(fitInside(16 / 9, 16 / 9), { widthPercent: 100, heightPercent: 100 })
	// 4:3 in 16:9: full height, three quarters of the width.
	assert.deepEqual(fitInside(4 / 3, 16 / 9), { widthPercent: 75, heightPercent: 100 })
	// 32:9 in 16:9: full width, half the height.
	assert.deepEqual(fitInside(32 / 9, 16 / 9), { widthPercent: 100, heightPercent: 50 })
})

test("a designed frame's title card wraps between words to fit, a long word on its own line", () => {
	// Every letter 1 wide, a space too.
	const measure = (text: string) => text.length
	assert.deepEqual(cardLines('This is the key point', 12, measure), ['This is the', 'key point'])
	assert.deepEqual(cardLines('Short', 12, measure), ['Short'])
	assert.deepEqual(cardLines('a extraordinarily b', 5, measure), ['a', 'extraordinarily', 'b'])
})

test('word by word across lines: the first line comes in, then the next', () => {
	const lines = ['This is the', 'key point']
	// 5 words, 40% through: the first two words of the first line.
	// (The second line hasn't started: below 0, which shows none of its words.)
	assert.deepEqual(lineReveals(lines, 0.4), [2 / 3, -0.5])
	assert.ok(revealedWords('key point', -0.5).every((word) => word.opacity === 0))
	assert.deepEqual(lineReveals(lines, 1), [5 / 3, 1])
	assert.deepEqual(lineReveals(lines, undefined), [undefined, undefined])
})

test('the word being said: from the caption’s word times, or a one-word caption’s own start in a designed frame', () => {
	const timed = { lines: ['Hello there'], startSeconds: 1, endSeconds: 2, spoken: [1, 1.5] }
	assert.deepEqual(saidWordAt(timed, 1.6, false), { index: 1, start: 1.5 })
	const oneWord = { lines: ['Hello'], startSeconds: 1, endSeconds: 2 }
	assert.equal(saidWordAt(oneWord, 1.2, false), null)
	assert.deepEqual(saidWordAt(oneWord, 1.2, true), { index: 0, start: 1 })
	assert.equal(
		saidWordAt({ lines: ['Hello there'], startSeconds: 1, endSeconds: 2 }, 1.2, true),
		null
	)
})

// Text measured as a bold sans roughly is: 0.6 of its height a character.
const measureAt = (text: string, fontPixels: number) => text.length * fontPixels * 0.6
const SHAPES = {
	'9:16': { width: 1080, height: 1920 },
	'1:1': { width: 1080, height: 1080 },
	'4:5': { width: 1080, height: 1350 },
	'16:9': { width: 1920, height: 1080 }
}

/** Each word's span on the line, as `popLayout` lays it out: none may overlap the next. */
function expectNoOverlap(widths: number[], laid: ReturnType<typeof popLayout>, label: string) {
	for (let i = 0; i + 1 < widths.length; i++) {
		const right = (laid.lefts[i] ?? 0) + (widths[i] ?? 0) * (laid.scales[i] ?? 1)
		assert.ok(right <= (laid.lefts[i + 1] ?? 0) + 1e-9, `${label}: word ${i} runs into ${i + 1}`)
	}
}

test('a popping caption word: the words beside it make room, moving smoothly, never overlapping', () => {
	const words = ['If', 'we', 'have', 'more', 'than', 'one']
	const widths = words.map((word) => measureAt(word, 100))
	const space = 30
	const rest = widths.reduce((sum, width) => sum + width, 0) + space * (words.length - 1)
	// "have" said at 1 s, "more" at 1.12 s: both popping at once for a moment.
	const at = (t: number) => {
		const pops = [1, 1, wordPop(1, t), wordPop(1.12, t), 1, 1]
		return { pops, laid: popLayout(widths, space, pops, 2000) }
	}
	// The fastest any word may move: as fast as the widest popping word grows.
	const fastest = (Math.max(...widths) * 0.3) / 0.05
	for (let t = 0.9; t < 1.6; t += 0.001) {
		const { pops, laid } = at(t)
		expectNoOverlap(widths, laid, `at ${t.toFixed(3)} s`)
		// Room to grow: each word at its full pop.
		assert.deepEqual(laid.scales, pops)
		// No jumps: from one millisecond to the next, each word moves at most that far.
		const next = at(t + 0.001).laid
		for (const [i, left] of laid.lefts.entries()) {
			assert.ok(
				Math.abs((next.lefts[i] ?? 0) - left) <= fastest * 0.001 + 1e-9,
				`word ${i} at ${t}`
			)
		}
	}
	assert.equal(at(0.5).laid.width, rest)
})

test('a caption line already at its widest pops less, and never passes the safe margins', () => {
	const widths = [300, 240, 360]
	const space = 30
	const rest = 300 + 240 + 360 + 60
	const pops = [1, 1.3, 1]
	// Full width: no room, so nothing grows and nothing moves.
	const full = popLayout(widths, space, pops, rest)
	assert.deepEqual(full.scales, [1, 1, 1])
	assert.equal(full.width, rest)
	expectNoOverlap(widths, full, 'full')
	// 36 px of room for 72 px of growth: half the pop, the line exactly at its widest.
	const some = popLayout(widths, space, pops, rest + 36)
	assert.ok(Math.abs((some.scales[1] ?? 0) - 1.15) < 1e-9)
	assert.ok(Math.abs(some.width - (rest + 36)) < 1e-9)
	expectNoOverlap(widths, some, 'some room')
})

test('a caption line too wide for the frame is drawn smaller, inside the safe margins, in every shape', () => {
	// A full 24-character line of large captions (1.7×).
	const line = 'If we have more than one'
	for (const [shape, frame] of Object.entries(SHAPES)) {
		const base = Math.min(frame.width, frame.height) * CAPTION_FONT_FRACTION * 1.7
		const px = captionFontPixels(base, measureAt(line, base), frame.width)
		const band = measureAt(line, px) + 2 * CAPTION_PADDING_SCALE * px
		assert.ok(band <= frame.width * (1 - 2 * SAFE_MARGIN_FRACTION) + 1e-6, shape)
		assert.ok(px <= base, shape)
	}
	// A short line keeps its size.
	assert.equal(captionFontPixels(100, 300, 1920), 100)
})

test("a designed frame's long title sits near the top, clear of the captions; in a shape with no room, the captions wait", () => {
	// An ad's designed title (1.4 × 1.25), with large captions (1.7) under it:
	// for each title, whether it fits above the captions in each shape.
	const expected: Record<string, Record<keyof typeof SHAPES, boolean>> = {
		'Fathom AI meeting notetaker': { '9:16': true, '1:1': false, '4:5': true, '16:9': true },
		'Fathom AI meeting notetaker for every team': {
			'9:16': true,
			'1:1': false,
			'4:5': false,
			'16:9': true
		}
	}
	for (const [title, fits] of Object.entries(expected)) {
		for (const [shape, frame] of Object.entries(SHAPES) as [keyof typeof SHAPES, Size][]) {
			const label = `${shape}, ${title.length} characters`
			const shorter = Math.min(frame.width, frame.height)
			const captionBase = shorter * CAPTION_FONT_FRACTION * 1.7
			const captionTop = frame.height * DESIGN_CAPTION_Y - captionBase * CAPTION_LINE_SCALE
			const titlePx = shorter * TITLE_FONT_FRACTION * 1.4 * 1.25
			const layout = designedCardLayout(
				title,
				frame,
				0.18,
				titlePx,
				captionBase,
				captionTop,
				measureAt
			)
			assert.equal(layout.fits, fits[shape], label)
			assert.ok(layout.lines.length >= 2, `${label}: two lines or more`)
			assert.ok(layout.fontPixels >= captionBase && layout.fontPixels <= titlePx, label)
			const half =
				((layout.lines.length * TITLE_CARD_LINE + TITLE_CARD_INSET * 2) * layout.fontPixels) / 2
			assert.ok(layout.y - half >= frame.height * SAFE_MARGIN_FRACTION - 1e-6, `${label}: top`)
			for (const line of layout.lines) {
				assert.ok(measureAt(line, layout.fontPixels) <= frame.width * 0.9, `${label}: ${line}`)
			}
			if (layout.fits) {
				// Clear of the captions, with room for its entrance under it.
				assert.ok(layout.y + half + layout.fontPixels * 0.5 <= captionTop + 1e-6, label)
			} else {
				// At the captions' size and still too tall: they wait, and it stays in the frame.
				assert.equal(layout.fontPixels, captionBase, label)
				assert.ok(layout.y + half <= frame.height * (1 - SAFE_MARGIN_FRACTION) + 1e-6, label)
			}
		}
	}
	// A short title stays its full size near the top.
	const short = designedCardLayout('Fathom AI', SHAPES['9:16'], 0.18, 151, 110, 998, measureAt)
	assert.deepEqual(short, { fontPixels: 151, lines: ['Fathom AI'], y: 0.18 * 1920, fits: true })
})

test("a designed frame's card too tall even at the captions' size has the captions wait", () => {
	const frame = SHAPES['1:1']
	const captionBase = 1080 * CAPTION_FONT_FRACTION * 1.7
	const captionTop = 1080 * DESIGN_CAPTION_Y - captionBase * CAPTION_LINE_SCALE
	const long = 'A very long title that goes on and on, far past what one card can hold'
	const layout = designedCardLayout(long, frame, 0.18, 151, captionBase, captionTop, measureAt)
	assert.equal(layout.fits, false)
	assert.equal(layout.fontPixels, captionBase)
	// Still inside the frame's safe margins.
	const half = ((layout.lines.length * TITLE_CARD_LINE + TITLE_CARD_INSET * 2) * captionBase) / 2
	assert.ok(layout.y - half >= 1080 * SAFE_MARGIN_FRACTION - 1e-6)
	// With no captions, the whole frame is its room.
	assert.equal(designedCardLayout(long, frame, 0.18, 151, captionBase, null, measureAt).fits, true)
})

test('a designed frame’s export draws Bold’s text: white title and the spoken word in the accent, each with its shadow', async () => {
	const { drawFrame } = await import('./overlays')
	const { IDENTITY_TRANSFORM } = await import('../model/transform')
	const drawn: Array<{ text: string; fill: unknown; shadow: unknown }> = []
	const state: Record<string, unknown> = { fillStyle: '', shadowColor: 'transparent' }
	const context = new Proxy(state, {
		get(target, key) {
			if (key === 'canvas') return { width: 1080, height: 1920 }
			if (key in target) return target[key as string]
			if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
			if (key === 'fillText')
				return (text: string) =>
					drawn.push({ text, fill: target.fillStyle, shadow: target.shadowColor })
			if (key === 'createLinearGradient' || key === 'createRadialGradient')
				return () => ({ addColorStop: () => undefined })
			return () => undefined
		},
		set(target, key, value) {
			target[key as string] = value
			return true
		}
	}) as unknown as CanvasRenderingContext2D
	const bold = {
		font: 'sans' as const,
		color: '#ffffff',
		background: null,
		shadow: true,
		highlight: '#a6e88f'
	}
	drawFrame(
		context,
		{} as CanvasImageSource,
		{ width: 1920, height: 1080 },
		IDENTITY_TRANSFORM,
		{
			title: { text: 'Fathom', startSeconds: 0, durationSeconds: 5, style: { ...bold, size: 1.4 } },
			watermark: null,
			captions: [{ lines: ['notetaker.'], startSeconds: 0, endSeconds: 5 }],
			captionStyle: { ...bold, size: 1.8 },
			captionMode: 'words',
			annotations: [],
			lowerThird: null,
			zoom: null,
			designed: {
				palette: 'reel',
				picture: 'hidden',
				look: {
					from: '#0a1a0a',
					to: '#102810',
					shape: '#1a3a1a',
					accent: '#a6e88f',
					bar: 'thick',
					wave: false
				},
				totalSeconds: 10
			}
		},
		2,
		null,
		{} as HTMLCanvasElement
	)
	const caption = drawn.find((d) => d.text === 'notetaker.')
	const title = drawn.find((d) => d.text === 'Fathom')
	assert.deepEqual(caption, { text: 'notetaker.', fill: '#a6e88f', shadow: 'rgba(0, 0, 0, 0.8)' })
	assert.deepEqual(title, { text: 'Fathom', fill: '#ffffff', shadow: 'rgba(0, 0, 0, 0.8)' })
})
