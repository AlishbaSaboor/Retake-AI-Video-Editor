import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import { NEUTRAL_GRADE } from './color-grade'
import { commandToPlan, type CommandContext, type EditCommand } from './edit-command'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import {
	animationAt,
	AT_REST,
	LOWER_THIRD_ANIMATION,
	NO_ANIMATION,
	clampFocus,
	splitLowerThird,
	unzoomedPoint,
	zoomAt,
	zoomedPoint,
	zoomArea,
	zoomOnArea,
	revealedWords,
	zoomViewAt,
	zoomsViewAt,
	type Animation
} from './motion'
import { zoomedMatrix } from './overlays'
import { DEFAULT_TEXT_STYLE } from './text-style'
import { IDENTITY_TRANSFORM } from './transform'

const near = (actual: number | undefined, expected: number, within = 1e-9) =>
	assert.ok(Math.abs((actual ?? NaN) - expected) < within, `${actual} ≠ ${expected}`)

test('no animation: there for its time, at rest, and absent outside it', () => {
	assert.deepEqual(animationAt(undefined, 2, 5, 3), AT_REST)
	assert.deepEqual(animationAt(NO_ANIMATION, 2, 5, 2), AT_REST)
	assert.equal(animationAt(NO_ANIMATION, 2, 5, 1.99), null)
	assert.equal(animationAt(NO_ANIMATION, 2, 5, 5), null)
})

test('a fade comes in from nothing; a slide from a whole width to its side; a pop from half size', () => {
	const fade: Animation = { ...NO_ANIMATION, in: { kind: 'fade', side: 'left', seconds: 1 } }
	near(animationAt(fade, 0, 4, 0)?.opacity, 0)
	assert.ok((animationAt(fade, 0, 4, 0.5)?.opacity ?? 0) > 0.5)
	near(animationAt(fade, 0, 4, 1)?.opacity, 1)
	const slide: Animation = { ...NO_ANIMATION, in: { kind: 'slide', side: 'left', seconds: 1 } }
	near(animationAt(slide, 0, 4, 0)?.dx, -1)
	near(animationAt(slide, 0, 4, 0.5)?.dx, -0.125)
	near(animationAt(slide, 0, 4, 1)?.dx, 0)
	const fromTop: Animation = { ...NO_ANIMATION, in: { kind: 'slide', side: 'top', seconds: 1 } }
	near(animationAt(fromTop, 0, 4, 0)?.dy, -1)
	const pop: Animation = { ...NO_ANIMATION, in: { kind: 'pop', side: 'left', seconds: 1 } }
	near(animationAt(pop, 0, 4, 0)?.scale, 0.5)
	assert.ok((animationAt(pop, 0, 4, 0.8)?.scale ?? 0) > 1, 'overshoots before settling')
	near(animationAt(pop, 0, 4, 1)?.scale, 1)
})

test('an exit runs backwards to its end; entrance and exit each take at most half the time', () => {
	const out: Animation = { ...NO_ANIMATION, out: { kind: 'slide', side: 'right', seconds: 1 } }
	near(animationAt(out, 0, 4, 3.5)?.dx, 0.125)
	assert.equal(animationAt(out, 0, 4, 4), null)
	const long: Animation = {
		in: { kind: 'fade', side: 'left', seconds: 3 },
		out: { kind: 'fade', side: 'left', seconds: 3 }
	}
	// Shown 2 s: each fade 1 s; half way it's fully there.
	near(animationAt(long, 0, 2, 1)?.opacity, 1)
	near(animationAt(LOWER_THIRD_ANIMATION, 5, 10, 5)?.dx, -1)
	near(animationAt(LOWER_THIRD_ANIMATION, 5, 10, 7)?.dx, 0)
})

test('a zoom eases from the whole picture to its amount (in) or back (out), and is 1 outside', () => {
	const zoomIn = { startSeconds: 10, endSeconds: 14, direction: 'in' as const, amount: 1.5 }
	assert.equal(zoomAt(zoomIn, 9.9), 1)
	near(zoomAt(zoomIn, 10), 1)
	near(zoomAt(zoomIn, 12), 1.25)
	assert.ok(zoomAt(zoomIn, 13.99) > 1.49)
	assert.equal(zoomAt(zoomIn, 14), 1)
	const out = { ...zoomIn, direction: 'out' as const }
	near(zoomAt(out, 10), 1.5)
	near(zoomAt(out, 12), 1.25)
	assert.equal(zoomAt(null, 12), 1)
})

test('a zoom magnifies about the frame centre: the centre stays, the corners move out', () => {
	const view = { scale: 2, centre: { x: 0.5, y: 0.5 } }
	const m = zoomedMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, view, { width: 320, height: 180 })
	const at = (x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
	assert.deepEqual(at(160, 90), [160, 90])
	assert.deepEqual(at(240, 90), [320, 90])
})

test('a zoom with a focus moves towards it as it grows, and shows the area around it at full zoom', () => {
	const zoom = {
		startSeconds: 0,
		endSeconds: 4,
		direction: 'in' as const,
		amount: 2,
		focus: { x: 0.7, y: 0.3 }
	}
	assert.deepEqual(zoomViewAt(zoom, 5), { scale: 1, centre: { x: 0.5, y: 0.5 } })
	const half = zoomViewAt(zoom, 2)
	near(half.scale, 1.5)
	near(half.centre.x, 0.6)
	near(half.centre.y, 0.4)
	const full = zoomViewAt(zoom, 3.999)
	near(full.centre.x, 0.7, 1e-5)
	// At full zoom the focus is in the middle of the frame, and the area's edges at its edges.
	const middle = zoomedPoint(full, { x: 0.7, y: 0.3 })
	near(middle.x, 0.5, 1e-5)
	near(zoomedPoint(full, { x: 0.45, y: 0.3 }).x, 0, 1e-4)
	// The export's matrix agrees with the point mapping, in pixels.
	const m = zoomedMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, half, { width: 320, height: 180 })
	const shown = zoomedPoint(half, { x: 0.25, y: 0.75 })
	near(m.a * 80 + m.e, shown.x * 320)
	near(m.d * 135 + m.f, shown.y * 180)
	// And a click on the shown frame finds its way back.
	const back = unzoomedPoint(half, shown)
	near(back.x, 0.25)
	near(back.y, 0.75)
})

test('a focus near an edge is moved in so the zoomed area stays inside the frame', () => {
	assert.deepEqual(clampFocus({ x: 0.95, y: 0.02 }, 2), { x: 0.75, y: 0.25 })
	assert.deepEqual(clampFocus({ x: 0.5, y: 0.5 }, 3), { x: 0.5, y: 0.5 })
	const view = zoomViewAt(
		{ startSeconds: 0, endSeconds: 1, direction: 'in', amount: 2, focus: { x: 1, y: 0 } },
		0.5
	)
	// Half way (×1.5): the shown area, a third smaller, still within 0..1.
	const left = view.centre.x - 0.5 / view.scale
	const right = view.centre.x + 0.5 / view.scale
	assert.ok(left >= 0 && right <= 1 + 1e-9, `${left}..${right}`)
})

test('"Jane, CEO" is a name and a subtitle', () => {
	assert.deepEqual(splitLowerThird('Jane, CEO'), { name: 'Jane', subtitle: 'CEO' })
	assert.deepEqual(splitLowerThird('Jane Smith - Head of Design'), {
		name: 'Jane Smith',
		subtitle: 'Head of Design'
	})
	assert.deepEqual(splitLowerThird('Jane'), { name: 'Jane', subtitle: '' })
})

test('a lower third or a zoom counts for reset', () => {
	const lower = {
		name: 'Jane',
		subtitle: 'CEO',
		startSeconds: 0,
		durationSeconds: 2,
		style: DEFAULT_TEXT_STYLE
	}
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, lowerThird: lower }, 4), false)
	assert.equal(
		isOriginalEdit(
			{ ...ORIGINAL_EDIT, zoom: { startSeconds: 0, endSeconds: 1, direction: 'in', amount: 1.3 } },
			4
		),
		false
	)
})

const NONE: Omit<EditCommand, 'action'> = {
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null,
	degrees: null,
	axis: null,
	aspect: null,
	percent: null,
	seconds: null,
	property: null,
	target: null,
	color: null,
	background: null,
	font: null,
	effect: null
}
const CONTEXT: CommandContext = {
	durationSeconds: 20,
	editedSeconds: 20,
	clipCount: 1,
	canSplitAt: () => true,
	cleanupSeconds: 0,
	canUndo: false,
	canRedo: false,
	canReset: false,
	sentenceAt: () => null,
	transform: IDENTITY_TRANSFORM,
	picture: { width: 320, height: 180 },
	clipAudio: [DEFAULT_CLIP_AUDIO],
	clipTakes: [false],
	joinLimits: [0],
	colors: { video: NEUTRAL_GRADE, clips: [undefined] },
	hasTitle: true,
	textCount: 0,
	audioCount: 0,
	extractBlockers: [null],
	playheadSeconds: 2,
	canMerge: () => true,
	projectName: 'take',
	unsaved: false,
	projects: []
}
const run = (fields: Partial<EditCommand> & Pick<EditCommand, 'action'>, context = CONTEXT) =>
	commandToPlan({ ...NONE, ...fields }, context)

test('motion commands: a lower third, a title entrance, a zoom in or out', () => {
	assert.deepEqual(
		run({ action: 'lower_third', text: 'Jane, CEO', startSeconds: 5, endSeconds: 10 }),
		{
			ok: true,
			plan: {
				kind: 'lowerThird',
				name: 'Jane',
				subtitle: 'CEO',
				startSeconds: 5,
				durationSeconds: 5
			}
		}
	)
	assert.deepEqual(
		run({ action: 'animate_in', target: 'title', effect: 'slide', region: 'left' }),
		{
			ok: true,
			plan: {
				kind: 'animate',
				target: 'title',
				phase: 'in',
				motion: { kind: 'slide', side: 'left', seconds: 0.5 }
			}
		}
	)
	assert.deepEqual(run({ action: 'animate_out', target: 'text', effect: 'fade' }), {
		ok: false,
		reason: 'no_text'
	})
	assert.deepEqual(run({ action: 'zoom_in', startSeconds: 10, endSeconds: 15 }), {
		ok: true,
		plan: {
			kind: 'zoom',
			zoom: { startSeconds: 10, endSeconds: 15, direction: 'in', amount: 1.3 }
		}
	})
	// "to 150%" is the zoom; "20%" is how much more.
	const to150 = run({ action: 'zoom_out', startSeconds: 1, endSeconds: 3, percent: 150 })
	assert.ok(to150.ok && to150.plan.kind === 'zoom' && to150.plan.zoom.amount === 1.5)
	const more20 = run({ action: 'zoom_in', startSeconds: 1, endSeconds: 3, percent: 20 })
	assert.ok(
		more20.ok && more20.plan.kind === 'zoom' && Math.abs(more20.plan.zoom.amount - 1.2) < 1e-9
	)
	assert.deepEqual(run({ action: 'zoom_in', startSeconds: 25, endSeconds: 30 }), {
		ok: false,
		reason: 'out_of_range'
	})
})

test('a zoom set from an area on the frame fills the frame with it, within the limits', () => {
	const zoom = { startSeconds: 0, endSeconds: 2, direction: 'in' as const, amount: 1.3 }
	const area = zoomArea(zoom)
	near(area.width, 1 / 1.3)
	near(area.x + area.width / 2, 0.5)
	const set = zoomOnArea(zoom, { x: 0.7, y: 0.6 }, 0.4)
	near(set.amount, 2.5)
	assert.deepEqual(set.focus, { x: 0.7, y: 0.6 })
	near(zoomArea(set).x, 0.5)
	// Too small an area is held at the largest zoom; one off the edge is moved in.
	near(zoomOnArea(zoom, { x: 0.5, y: 0.5 }, 0.1).amount, 3)
	assert.deepEqual(zoomOnArea(zoom, { x: 0.99, y: 0.5 }, 0.5).focus, { x: 0.75, y: 0.5 })
	// Back in the middle: no focus kept.
	assert.ok(!('focus' in zoomOnArea(set, { x: 0.5, y: 0.5 }, 0.5)))
})

test('with several zooms, the one under way shows; none, the whole frame', () => {
	const first = { startSeconds: 0, endSeconds: 2, direction: 'in' as const, amount: 2 }
	const second = { startSeconds: 5, endSeconds: 7, direction: 'in' as const, amount: 1.5 }
	assert.deepEqual(zoomsViewAt([null, first, second], 1), zoomViewAt(first, 1))
	assert.deepEqual(zoomsViewAt([null, first, second], 6), zoomViewAt(second, 6))
	assert.deepEqual(zoomsViewAt([null, first, second], 3), zoomViewAt(null, 3))
})

test('word by word, each word comes in on its own, rising into place; all of it at rest', () => {
	const motion = animationAt(
		{ in: { kind: 'words', side: 'left', seconds: 1 }, out: NO_ANIMATION.out },
		0,
		4,
		0.5
	)
	assert.equal(motion?.reveal, 0.5)
	// Half way through four words: two in, the third just starting.
	const words = revealedWords('One two three four', 0.5)
	assert.deepEqual(
		words.map((w) => [w.word, w.opacity]),
		[
			['One', 1],
			['two', 1],
			['three', 0],
			['four', 0]
		]
	)
	assert.equal(words[0]?.rise, 0)
	assert.ok((revealedWords('One two', 0.25)[0]?.rise ?? 0) > 0)
	assert.ok(revealedWords('One two', undefined).every((w) => w.opacity === 1 && w.rise === 0))
	assert.equal(animationAt(undefined, 0, 4, 2)?.reveal, undefined)
})
