import type { Page } from '@playwright/test'

// Whether a designed frame's text ever overlaps, read from the canvas calls
// that draw it rather than from its pixels: every caption word, title line
// and card is drawn with fillText, fillRect (a caption's band) or roundRect
// (a card, and the progress bar and wave), and each one's box on the canvas
// is known exactly. A designed frame starts with its background, gradients
// over the whole canvas (the last of them starts what's checked); each frame
// is checked as the next one starts, in every canvas the page draws (the
// preview's and the export's alike).

/** What was checked, and what was wrong: the first few problems found. */
export type TextBoxReport = {
	/** Designed frames checked; those with a caption, a card, both, and a word popping. */
	frames: number
	withCaption: number
	withCard: number
	withBoth: number
	popped: number
	problems: string[]
}

declare global {
	interface Window {
		__textBoxes?: TextBoxReport & { flush: () => void }
	}
}

/** Starts recording in every page `page` opens from now on: call before going to it. */
export async function recordTextBoxes(page: Page) {
	await page.addInitScript(() => {
		type Box = {
			kind: 'text' | 'band' | 'card'
			text: string
			x0: number
			y0: number
			x1: number
			y1: number
			/** How much bigger than its context's own scale the text is drawn: a popping word's. */
			scale: number
		}
		const report = {
			frames: 0,
			withCaption: 0,
			withCard: 0,
			withBoth: 0,
			popped: 0,
			problems: [] as string[],
			flush: () => {}
		}
		const MAX_PROBLEMS = 20
		// The boxes of the frame being drawn on each canvas.
		const frames = new Map<HTMLCanvasElement, Box[]>()
		const proto = CanvasRenderingContext2D.prototype

		/** A rectangle in the context's own units, as a box on its canvas. */
		function onCanvas(
			context: CanvasRenderingContext2D,
			x0: number,
			y0: number,
			x1: number,
			y1: number
		) {
			const m = context.getTransform()
			const xs = [
				x0 * m.a + y0 * m.c,
				x1 * m.a + y0 * m.c,
				x0 * m.a + y1 * m.c,
				x1 * m.a + y1 * m.c
			]
			const ys = [
				x0 * m.b + y0 * m.d,
				x1 * m.b + y0 * m.d,
				x0 * m.b + y1 * m.d,
				x1 * m.b + y1 * m.d
			]
			return {
				x0: Math.min(...xs) + m.e,
				x1: Math.max(...xs) + m.e,
				y0: Math.min(...ys) + m.f,
				y1: Math.max(...ys) + m.f
			}
		}
		const hit = (a: Box, b: Box) =>
			a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1
		const inside = (a: Box, card: Box) => {
			const x = (a.x0 + a.x1) / 2
			const y = (a.y0 + a.y1) / 2
			return x >= card.x0 && x <= card.x1 && y >= card.y0 && y <= card.y1
		}
		const name = (box: Box) =>
			`${box.kind} "${box.text}" [${[box.x0, box.y0, box.x1, box.y1].map(Math.round).join(', ')}]`

		function check(canvas: HTMLCanvasElement, boxes: Box[]) {
			// Between the background's gradients: nothing drawn yet.
			if (boxes.length === 0) return
			report.frames++
			const cards = boxes.filter((box) => box.kind === 'card')
			// A card's own text sits inside it; any other text is a caption's.
			const texts = boxes.filter((box) => box.kind === 'text')
			const captionText = texts.filter((box) => !cards.some((card) => inside(box, card)))
			const bands = boxes.filter((box) => box.kind === 'band')
			const caption = captionText.length > 0
			// A text card: one holding its own words (not the progress bar or the wave).
			const textCard = cards.some((card) => texts.some((box) => inside(box, card)))
			if (caption) report.withCaption++
			if (textCard) report.withCard++
			if (caption && textCard) report.withBoth++
			// A caption word drawn bigger than the others is popping.
			const scales = captionText.map((box) => box.scale)
			if (scales.length > 0 && Math.max(...scales) > Math.min(...scales) * 1.001) report.popped++
			const problem = (text: string) => {
				if (report.problems.length < MAX_PROBLEMS) {
					report.problems.push(`${canvas.width}×${canvas.height} frame ${report.frames}: ${text}`)
				}
			}
			for (const [i, a] of texts.entries()) {
				for (const b of texts.slice(i + 1)) if (hit(a, b)) problem(`${name(a)} overlaps ${name(b)}`)
			}
			for (const card of cards) {
				for (const box of [...captionText, ...bands]) {
					if (hit(box, card)) problem(`${name(box)} runs into ${name(card)}`)
				}
			}
			const left = canvas.width * 0.05 - 1
			const right = canvas.width * 0.95 + 1
			// A caption stays inside them; a card may slide in from beyond the frame.
			for (const box of [...captionText, ...bands]) {
				if (box.x0 < left || box.x1 > right) problem(`${name(box)} passes the safe margins`)
			}
		}
		report.flush = () => {
			for (const [canvas, frame] of frames) check(canvas, frame)
			frames.clear()
		}

		const fillRect = proto.fillRect
		proto.fillRect = function (x, y, width, height) {
			const box = onCanvas(this, x, y, x + width, y + height)
			const { canvas } = this
			const whole = box.x0 <= 0 && box.y0 <= 0 && box.x1 >= canvas.width && box.y1 >= canvas.height
			if (whole && this.fillStyle instanceof CanvasGradient) {
				const before = frames.get(canvas)
				if (before) check(canvas, before)
				frames.set(canvas, [])
			} else if (!whole) {
				frames.get(canvas)?.push({ kind: 'band', text: '', scale: 1, ...box })
			}
			return fillRect.call(this, x, y, width, height)
		}
		const roundRect = proto.roundRect
		proto.roundRect = function (x, y, width, height, radii) {
			const box = onCanvas(this, x, y, x + width, y + height)
			frames.get(this.canvas)?.push({ kind: 'card', text: '', scale: 1, ...box })
			return roundRect.call(this, x, y, width, height, radii)
		}
		const fillText = proto.fillText
		proto.fillText = function (text, x, y, maxWidth) {
			const frame = frames.get(this.canvas)
			if (frame && text.trim() && this.globalAlpha >= 0.05) {
				const m = this.measureText(text)
				// Text wider than maxWidth is squeezed toward where it's anchored.
				const squeeze = maxWidth !== undefined && m.width > maxWidth ? maxWidth / m.width : 1
				const box = onCanvas(
					this,
					x - m.actualBoundingBoxLeft * squeeze,
					y - m.actualBoundingBoxAscent,
					x + m.actualBoundingBoxRight * squeeze,
					y + m.actualBoundingBoxDescent
				)
				frame.push({
					kind: 'text',
					text,
					scale: Math.hypot(this.getTransform().a, this.getTransform().b),
					...box
				})
			}
			return maxWidth === undefined
				? fillText.call(this, text, x, y)
				: fillText.call(this, text, x, y, maxWidth)
		}
		window.__textBoxes = report
	})
}

/** What's been checked so far, the frame being drawn included. */
export async function textBoxReport(page: Page): Promise<TextBoxReport> {
	return page.evaluate(() => {
		const report = window.__textBoxes
		if (!report) throw new Error('recordTextBoxes was not called before the page opened')
		report.flush()
		const { frames, withCaption, withCard, withBoth, popped, problems } = report
		return { frames, withCaption, withCard, withBoth, popped, problems }
	})
}
