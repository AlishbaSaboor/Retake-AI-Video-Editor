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
	splitLowerThird,
	zoomAt,
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
	const m = zoomedMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, 2, { width: 320, height: 180 })
	const at = (x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
	assert.deepEqual(at(160, 90), [160, 90])
	assert.deepEqual(at(240, 90), [320, 90])
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
