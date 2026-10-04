import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strokeAnnotation } from './annotations'
import {
	applyMatrix,
	clipMatrix,
	gradeFilterId,
	gradeMatrix,
	matrixValues,
	NEUTRAL_GRADE,
	type ColorGrade
} from './color-grade'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import {
	commandToPlan,
	editCommandSchema,
	type CommandContext,
	type EditCommand
} from './edit-command'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import { mergeClips, playableSegments, splitClipAt, wholeTake } from './sequence'
import { bandColor, DEFAULT_TEXT_STYLE } from './text-style'
import { IDENTITY_TRANSFORM } from './transform'

const grade = (fields: Partial<ColorGrade>): ColorGrade => ({ ...NEUTRAL_GRADE, ...fields })
const graded = (fields: Partial<ColorGrade>, rgb: [number, number, number]) =>
	applyMatrix(gradeMatrix(grade(fields)), rgb)

test('levels: brightness scales, contrast pivots on mid-grey, saturation keeps grey grey', () => {
	assert.deepEqual(graded({ brightness: 1.5 }, [100, 100, 100]), [150, 150, 150])
	assert.deepEqual(graded({ brightness: 0 }, [200, 50, 90]), [0, 0, 0])
	// Contrast: mid-grey stays, darker gets darker, lighter lighter.
	// (128 is a hair over the middle, 127.5: 2× contrast puts it at 129.)
	for (const v of graded({ contrast: 2 }, [128, 128, 128])) assert.ok(Math.abs(v - 128) <= 1)
	assert.deepEqual(graded({ contrast: 2 }, [64, 64, 64]), [0, 0, 0])
	assert.deepEqual(graded({ contrast: 1.5 }, [191, 191, 191]), [223, 223, 223])
	// Saturation never changes a grey; at 0 a color becomes its luma.
	assert.deepEqual(graded({ saturation: 2 }, [90, 90, 90]), [90, 90, 90])
	assert.deepEqual(graded({ saturation: 0 }, [255, 0, 0]), [54, 54, 54])
})

test('looks: black and white is grey; warm is redder and less blue, cool the other way', () => {
	const [r, g, b] = graded({ look: 'black_and_white' }, [255, 0, 0])
	assert.equal(r, g)
	assert.equal(g, b)
	const [wr, , wb] = graded({ look: 'warm' }, [128, 128, 128])
	assert.ok((wr ?? 0) > 128 && (wb ?? 255) < 128, `warm grey ${wr}, ${wb}`)
	const [cr, , cb] = graded({ look: 'cool' }, [128, 128, 128])
	assert.ok((cr ?? 255) < 128 && (cb ?? 0) > 128, `cool grey ${cr}, ${cb}`)
})

test("a clip's grade goes on top of the whole video's, and nothing set is no filter", () => {
	assert.equal(clipMatrix(NEUTRAL_GRADE, undefined), null)
	assert.equal(clipMatrix(NEUTRAL_GRADE, NEUTRAL_GRADE), null)
	const both = clipMatrix(grade({ brightness: 1.5 }), grade({ brightness: 0.5 }))
	assert.ok(both)
	assert.deepEqual(applyMatrix(both, [100, 100, 100]), [75, 75, 75])
	// Black and white over a warm video: still grey.
	const bw = clipMatrix(grade({ look: 'warm' }), grade({ look: 'black_and_white' }))
	assert.ok(bw)
	const [r, g, b] = applyMatrix(bw, [200, 120, 40])
	assert.ok(r === g && g === b)
})

test('a filter id is the same for the same numbers, and different for others', () => {
	const warm = matrixValues(gradeMatrix(grade({ look: 'warm' })))
	assert.equal(warm.split(' ').length, 20)
	assert.equal(gradeFilterId('p', warm), gradeFilterId('p', warm))
	assert.notEqual(
		gradeFilterId('p', warm),
		gradeFilterId('p', matrixValues(gradeMatrix(grade({ look: 'cool' }))))
	)
})

test("a clip's colors go with it through split and merge, onto its segments, and count for reset", () => {
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	const warm = grade({ look: 'warm' })
	const split = splitClipAt([{ ...take, color: warm }], 4, () => crypto.randomUUID()) ?? []
	assert.deepEqual(
		split.map((c) => c.color),
		[warm, warm]
	)
	assert.deepEqual(mergeClips(split, 0, 1)[0]?.color, warm)
	const edit = { trim: { startSeconds: 0, endSeconds: 10 }, cuts: [] }
	assert.deepEqual(playableSegments(split, edit)[1]?.color, warm)
	assert.equal(playableSegments([take], edit)[0]?.color, undefined)
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, clips: [{ ...take, color: warm }] }, 10), false)
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, color: warm }, 10), false)
	assert.equal(
		isOriginalEdit(
			{ ...ORIGINAL_EDIT, captionStyle: { ...DEFAULT_TEXT_STYLE, color: '#ff0000' } },
			10
		),
		false
	)
})

test('the default band is the old one: black at 60%', () => {
	assert.equal(bandColor('#000000'), 'rgba(0, 0, 0, 0.6)')
	assert.equal(bandColor('#ff8000'), 'rgba(255, 128, 0, 0.6)')
})

test('a pencil stroke keeps its points inside its rect, with room for the line; a dot is not a stroke', () => {
	const picture = { width: 1600, height: 900 }
	const stroke = strokeAnnotation(
		[
			{ x: 0.2, y: 0.5 },
			{ x: 0.4, y: 0.5 },
			{ x: 0.6, y: 0.6 }
		],
		picture
	)
	assert.ok(stroke)
	const { rect, points } = stroke
	assert.ok(rect.x < 0.2 && rect.x + rect.width > 0.6)
	for (const p of points) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
	// Back in the picture, the points are where they were drawn.
	const last = points.at(-1)
	assert.ok(last)
	assert.ok(Math.abs(rect.x + last.x * rect.width - 0.6) < 1e-9)
	assert.ok(Math.abs(rect.y + last.y * rect.height - 0.6) < 1e-9)
	assert.equal(strokeAnnotation([{ x: 0.5, y: 0.5 }], picture), null)
	assert.equal(
		strokeAnnotation(
			[
				{ x: 0.5, y: 0.5 },
				{ x: 0.501, y: 0.5 }
			],
			picture
		),
		null
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
	durationSeconds: 12,
	editedSeconds: 12,
	clipCount: 2,
	canSplitAt: () => true,
	cleanupSeconds: 0,
	canUndo: false,
	canRedo: false,
	canReset: false,
	sentenceAt: () => null,
	transform: IDENTITY_TRANSFORM,
	picture: { width: 320, height: 180 },
	clipAudio: [DEFAULT_CLIP_AUDIO, DEFAULT_CLIP_AUDIO],
	clipTakes: [false, false],
	joinLimits: [0, 1],
	colors: { video: NEUTRAL_GRADE, clips: [undefined, grade({ brightness: 1.9 })] },
	hasTitle: true,
	textCount: 1,
	audioCount: 0,
	extractBlockers: [],
	playheadSeconds: 0,
	canMerge: () => true,
	projectName: 'Take',
	unsaved: false,
	projects: []
}
const run = (fields: Partial<EditCommand> & Pick<EditCommand, 'action'>, context = CONTEXT) =>
	commandToPlan({ ...NONE, ...fields }, context)

test('color commands: a level up or down (20 points unless told), a look, back to normal', () => {
	assert.deepEqual(run({ action: 'color', property: 'brightness' }), {
		ok: true,
		plan: {
			kind: 'color',
			clip: null,
			grade: grade({ brightness: 1.2 }),
			change: { kind: 'level', level: 'brightness', percent: 120 }
		}
	})
	// Clip 2 is at 190%: +20 stops at 200.
	const capped = run({ action: 'color', property: 'brightness', percent: 20, fromClip: 2 })
	assert.ok(capped.ok && capped.plan.kind === 'color' && capped.plan.grade.brightness === 2)
	const less = run({ action: 'color', property: 'saturation', percent: -40 })
	assert.ok(less.ok && less.plan.kind === 'color' && less.plan.grade.saturation === 0.6)
	assert.deepEqual(run({ action: 'color', property: 'black_and_white' }), {
		ok: true,
		plan: {
			kind: 'color',
			clip: null,
			grade: grade({ look: 'black_and_white' }),
			change: { kind: 'look', look: 'black_and_white' }
		}
	})
	assert.deepEqual(run({ action: 'color', property: 'normal' }), {
		ok: false,
		reason: 'colors_already_normal'
	})
	const normal = run({ action: 'color', property: 'normal', fromClip: 2 })
	assert.ok(normal.ok && normal.plan.kind === 'color' && normal.plan.change.kind === 'normal')
	assert.deepEqual(run({ action: 'color', property: 'warm', fromClip: 3 }), {
		ok: false,
		reason: 'no_such_clip'
	})
})

test('text style commands change only what they name, and need something to style', () => {
	assert.deepEqual(run({ action: 'text_style', target: 'title', color: '#FF0000' }), {
		ok: true,
		plan: { kind: 'textStyle', target: 'title', changes: { color: '#ff0000' } }
	})
	assert.deepEqual(
		run({
			action: 'text_style',
			target: 'captions',
			background: 'none',
			font: 'serif',
			percent: 150
		}),
		{
			ok: true,
			plan: {
				kind: 'textStyle',
				target: 'captions',
				changes: { background: null, font: 'serif', size: 1.5 }
			}
		}
	)
	// A plain color name is a color; one it doesn't know leaves nothing to change.
	assert.deepEqual(run({ action: 'text_style', target: 'captions', color: 'Yellow' }), {
		ok: true,
		plan: { kind: 'textStyle', target: 'captions', changes: { color: '#ffff00' } }
	})
	assert.deepEqual(run({ action: 'text_style', target: 'title', color: 'sparkly' }), {
		ok: false,
		reason: 'unsupported'
	})
	assert.deepEqual(
		run(
			{ action: 'text_style', target: 'title', color: '#ff0000' },
			{ ...CONTEXT, hasTitle: false }
		),
		{ ok: false, reason: 'no_title' }
	)
	assert.deepEqual(
		run({ action: 'text_style', target: 'text', color: '#ff0000' }, { ...CONTEXT, textCount: 0 }),
		{ ok: false, reason: 'no_text' }
	)
})

test('a command with only the fields it uses parses, the rest read as null', () => {
	assert.deepEqual(editCommandSchema.parse({ action: 'color', property: 'warm' }), {
		...NONE,
		action: 'color',
		property: 'warm'
	})
	assert.equal(editCommandSchema.safeParse({ property: 'warm' }).success, false)
})
