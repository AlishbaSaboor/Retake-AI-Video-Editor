import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/audio/transcript'
import { MAX_SHAPE_COVER } from '../../editor/overlays/design'
import { bandOpacity } from '../../editor/overlays/text-style'
import { dissolveAt, easeInOut, fadeLevelAt } from '../../editor/model/transitions'
import { planMake, type MakeReply } from './make-plan'
import {
	choosePreset,
	boldText,
	boldTextStyle,
	drawnBackground,
	DEFAULT_PRESET,
	PRESETS,
	presetDefinition,
	presetLook,
	presetNamed,
	type Preset
} from './make-presets'
import { choiceWords, decideAll, makeChoicesSchema, questionsToAsk } from './make-questions'
import {
	contrast,
	dominantColour,
	fromHex,
	MIN_CONTRAST,
	over,
	readableOn,
	shifted,
	toHsl
} from './video-colours'

/** One picture of `count` pixels, all `hex`. */
const picture = (hex: string, count = 100) => {
	const { r, g, b } = fromHex(hex)
	const data = new Uint8ClampedArray(count * 4)
	for (let i = 0; i < count; i++) data.set([r * 255, g * 255, b * 255, 255], i * 4)
	return data
}
const hueOf = (hex: string) => toHsl(fromHex(hex)).h
const near = (actual: number | undefined, expected: number) =>
	assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-9, `${actual} is not ${expected}`)

test('a look is named in whole words only, the last one named winning', () => {
	assert.equal(presetNamed('make it clean and minimal'), 'clean')
	assert.equal(presetNamed('something punchy'), 'bold')
	assert.equal(presetNamed('a moody, filmic cut'), 'cinematic')
	assert.equal(presetNamed('make it colourful'), 'playful')
	assert.equal(presetNamed('make it colorful'), 'playful')
	// Inside another word, it names nothing.
	assert.equal(presetNamed('boldly unfunny, uncleaned'), null)
	assert.equal(presetNamed('make this an Instagram reel'), null)
	// Two named: the later one.
	assert.equal(presetNamed('not bold, more cinematic'), 'cinematic')
})

test('the preset: the latest follow-up, else the click, else the request, else the style’s own', () => {
	assert.deepEqual(choosePreset('reel', 'a reel', null), { preset: 'bold', said: false })
	assert.deepEqual(choosePreset('reel', 'a clean reel', null), { preset: 'clean', said: true })
	// A click wins over the request; a follow-up over both; the latest follow-up over earlier ones.
	assert.deepEqual(choosePreset('reel', 'a clean reel', 'playful'), {
		preset: 'playful',
		said: true
	})
	assert.deepEqual(choosePreset('reel', 'a clean reel', 'playful', ['more cinematic']), {
		preset: 'cinematic',
		said: true
	})
	assert.deepEqual(
		choosePreset('reel', 'a reel', null, ['more cinematic', 'actually bold', 'shorter']),
		{ preset: 'bold', said: true }
	)
	// A follow-up naming no look leaves it as it was.
	assert.deepEqual(choosePreset('ad', 'an ad', null, ['shorter']), { preset: 'bold', said: false })
	// Each style's own: Cinematic only when asked.
	assert.deepEqual(DEFAULT_PRESET, {
		professional: 'clean',
		reel: 'bold',
		ad: 'bold',
		funny: 'playful'
	})
	assert.ok(!Object.values(DEFAULT_PRESET).includes('cinematic'))
})

test('the video’s colour: its most telling hue, never greys; none under 1% colour', () => {
	// Mostly grey, a little blue, a bit more red: the red wins.
	const red = dominantColour([
		picture('#808080', 900),
		picture('#3366cc', 30),
		picture('#cc2222', 70)
	])
	assert.ok(red !== null)
	assert.ok(Math.min(hueOf(red), 360 - hueOf(red)) < 10, `${red} is red`)
	// More saturated pixels count for more: fewer, vivid greens beat duller blues.
	const green = dominantColour([picture('#00ff00', 40), picture('#5a6f99', 50)])
	assert.ok(green !== null && Math.abs(hueOf(green) - 120) < 10, `${green} is green`)
	// Greys, near-black and near-white say nothing.
	assert.equal(dominantColour([picture('#808080'), picture('#050505'), picture('#fafafa')]), null)
	// Under 1% coloured (a white screen recording with a small logo): none.
	assert.equal(dominantColour([picture('#ffffff', 1000), picture('#ff0000', 9)]), null)
	assert.notEqual(dominantColour([picture('#ffffff', 1000), picture('#ff0000', 11)]), null)
	assert.equal(dominantColour([]), null)
})

test('with no colour of its own, a look is built around the preset’s fallback', () => {
	for (const preset of PRESETS) {
		const fallback = presetDefinition(preset).fallback
		assert.deepEqual(presetLook(preset, null), presetLook(preset, fallback))
		assert.ok(Math.abs(hueOf(presetLook(preset, null).design.from) - hueOf(fallback)) < 2)
	}
	// With one, the background turns with it.
	assert.ok(Math.abs(hueOf(presetLook('clean', '#22aa44').design.from) - hueOf('#22aa44')) < 2)
})

test('contrast: WCAG’s ratio, and a readable colour is found for any background', () => {
	assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 1e-9)
	assert.equal(contrast('#777777', '#777777'), 1)
	for (const behind of [['#ffffff'], ['#000000'], ['#ffd400'], ['#1a1a40', '#3a3a70']]) {
		const colour = readableOn('#ff7a00', behind)
		for (const b of behind) assert.ok(contrast(colour, b) >= MIN_CONTRAST, `${colour} on ${b}`)
	}
})

// Video colours across the wheel, light and dark, and none.
const VIDEO_COLOURS = [
	null,
	...Array.from({ length: 12 }, (_, i) => shifted('#ff0000', i * 30, 0.7, 0.5)),
	'#ffe066',
	'#0a1f44',
	'#f2f2f2'
]

test('every look’s text reads at 4.5:1 or more, on any picture and on its designed background', () => {
	const anyPicture = ['#ffffff', '#000000', '#808080', '#ffff00', '#0000ff']
	for (const preset of PRESETS) {
		for (const colour of VIDEO_COLOURS) {
			const look = presetLook(preset, colour)
			const background = [look.design.from, look.design.to]
			const cases = [
				{ name: 'captions over the picture', style: look.captions.picture, behind: anyPicture },
				{ name: 'captions designed', style: look.captions.designed, behind: background },
				{ name: 'title over the picture', style: look.title.picture, behind: anyPicture },
				{ name: 'title designed', style: look.title.designed, behind: background }
			]
			for (const { name, style, behind } of cases) {
				// A band lets the picture through, unless it's solid.
				const seen = style.background
					? behind.map((b) => over(style.background ?? b, b, bandOpacity(style)))
					: behind
				for (const b of seen) {
					const where = `${preset} on ${colour ?? 'no colour'}: ${name}`
					assert.ok(contrast(style.color, b) >= MIN_CONTRAST, `${where}: ${style.color} on ${b}`)
					assert.ok(
						contrast(style.highlight ?? style.color, b) >= MIN_CONTRAST,
						`${where}: highlight ${style.highlight} on ${b}`
					)
				}
			}
			// The accent (the designed frame's bar and Bold's band) reads on its background.
			for (const b of background) assert.ok(contrast(look.design.accent, b) >= MIN_CONTRAST)
		}
	}
})

test('each preset’s look: its captions, transition, title, zoom, pacing and music', () => {
	const summary = (preset: Preset) => {
		const look = presetLook(preset, null)
		return [
			look.captionLook,
			look.captions.picture.font,
			look.transition,
			look.title.animation.in.kind,
			look.zoom,
			look.pacing.titleSeconds,
			look.music
		]
	}
	assert.deepEqual(summary('clean'), [
		'classic',
		'sans',
		{ kind: 'dissolve', seconds: 0.4 },
		'fade',
		1.08,
		3,
		'calm'
	])
	assert.deepEqual(summary('bold'), [
		'bold_words',
		'sans',
		{ kind: 'slide', seconds: 0.4 },
		'slide',
		1.25,
		2,
		'upbeat'
	])
	assert.deepEqual(summary('cinematic'), [
		'classic',
		'serif',
		{ kind: 'fade', seconds: 0.8 },
		'words',
		1.12,
		3.5,
		'cinematic'
	])
	assert.deepEqual(summary('playful'), [
		'highlight',
		'sans',
		{ kind: 'zoom_cut', seconds: 0.4 },
		'pop',
		1.35,
		2.5,
		'fun'
	])
	// Cinematic's captions: a dark band over the picture, none on its designed background.
	const cinematic = presetLook('cinematic', null)
	assert.equal(cinematic.captions.picture.background, '#000000')
	assert.equal(cinematic.captions.designed.background, null)
	// Bold's title has no fill in a designed frame (white, with a soft shadow), Playful's sits on an
	// accent band, Clean's on a dark one.
	assert.equal(presetLook('bold', null).title.designed.background, null)
	assert.equal(presetLook('bold', null).title.designed.shadow, true)
	assert.equal(
		presetLook('playful', null).title.designed.background,
		presetLook('playful', null).design.accent
	)
	assert.equal(presetLook('clean', null).title.designed.background, '#000000')
	// Bold's designed bar is thick; only Playful has the wave.
	assert.deepEqual(
		PRESETS.map((p) => [presetLook(p, null).design.bar, presetLook(p, null).design.wave]),
		[
			['thin', false],
			['thick', false],
			['thin', false],
			['thin', true]
		]
	)
})

test('the style question: asked only when the request names no look; the answer is the user’s words', () => {
	assert.ok(questionsToAsk('make this into something').includes('style'))
	assert.ok(!questionsToAsk('make this cinematic').includes('style'))
	assert.ok(!questionsToAsk('a punchy promo').includes('style'))
	// Never more than five shown.
	assert.ok(questionsToAsk('make this into something', { kind: 'ad' }).length <= 5)
	assert.deepEqual(choiceWords({ ...decideAll(['style']), style: 'bold' }), ['A bold look.'])
	assert.deepEqual(choiceWords({ ...decideAll(['style']), style: 'cinematic' }), [
		'A cinematic look.'
	])
	// Left to "You decide": no words, the style's own look.
	assert.deepEqual(choiceWords(decideAll(['style'])), [])
	// An answer from before the style question (none) parses as "You decide"; an unknown look doesn't.
	const { style, ...before } = decideAll(['kind'])
	assert.equal(style, null)
	assert.equal(makeChoicesSchema.parse(before).style, null)
	assert.throws(() => makeChoicesSchema.parse({ ...before, style: 'gritty' }))
})

test('eased joins slow in and out; a join not eased stays even', () => {
	assert.deepEqual([easeInOut(0), easeInOut(0.5), easeInOut(1)], [0, 0.5, 1])
	assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9)
	const join = { kind: 'dissolve' as const, seconds: 1, index: 1, at: 10 }
	assert.equal(dissolveAt([join], 10.1)?.progress.toFixed(3), '0.100')
	near(dissolveAt([{ ...join, eased: true }], 10.1)?.progress, easeInOut(0.1))
	const fade = { ...join, kind: 'fade' as const }
	assert.equal(fadeLevelAt([fade], 10.4).toFixed(3), '0.800')
	near(fadeLevelAt([{ ...fade, eased: true }], 10.4), easeInOut(0.8))
})

// A short talk with long pauses: each look's plan.
const transcript = toTranscript([
	{ word: 'Hello.', start: 0.5, end: 1 },
	{ word: 'This', start: 1.3, end: 1.6 },
	{ word: 'is', start: 1.6, end: 1.8 },
	{ word: 'good.', start: 1.8, end: 2.4 },
	{ word: 'Oops', start: 5, end: 5.4 },
	{ word: 'wrong.', start: 5.4, end: 6 },
	{ word: 'Key', start: 9, end: 9.5 },
	{ word: 'point', start: 9.5, end: 10 },
	{ word: 'here.', start: 10, end: 11 },
	{ word: 'Bye.', start: 14, end: 15 }
])
const REPLY: MakeReply = {
	questions: [],
	style: 'reel',
	format: 'instagram_reel',
	subject: 'one_person',
	summary: 'A short talk.',
	pictureMatters: false,
	moments: [{ first: 1, last: 5 }],
	removeSentences: [3],
	removeSpans: [],
	captions: 'large',
	zoomSentences: [],
	transition: 'none',
	keyLines: [{ sentence: 4, text: 'Key point' }],
	shape: 'vertical',
	fit: 'fill',
	fitAsked: false,
	treatment: null,
	maxSeconds: null,
	brief: { audience: null, tone: null, length: null, show: null, callToAction: null },
	faces: [],
	card: 'corner',
	music: null,
	title: null,
	cannotDo: []
}
const planned = (request: string, videoColour: string | null = null) =>
	planMake({
		reply: REPLY,
		request,
		durationSeconds: 20,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		videoColour
	})

test('one look over the whole plan: one transition, eased unless it slides, the grade, the zoom', () => {
	for (const preset of PRESETS) {
		const { edit, summary } = planned(`make this a ${preset} reel`)
		const look = presetLook(preset, null)
		assert.deepEqual(summary.look, { preset, said: true })
		assert.deepEqual(edit.color, look.grade)
		const joins = (edit.clips ?? []).flatMap((clip) => (clip.transition ? [clip.transition] : []))
		const kinds = new Set(joins.map((join) => join.kind))
		// Playful's zoom cut is a zoom at the join, not a transition.
		if (preset === 'playful') assert.deepEqual([...kinds], [])
		else {
			assert.deepEqual([...kinds], [look.transition.kind])
			for (const join of joins) {
				// The look's length, or less where a clip is too short for it.
				assert.ok(join.seconds > 0 && join.seconds <= look.transition.seconds)
				assert.equal(join.eased, preset === 'bold' ? undefined : true)
			}
		}
		// The key line's zoom, at the look's strength. Playful's zoom cuts (1.15, out) sit at the
		// joins, and its key line starts at one, so no second zoom goes over it there.
		if (preset === 'playful') {
			assert.deepEqual(
				edit.autoZooms.map((zoom) => [zoom.direction, zoom.amount]),
				[
					['out', 1.15],
					['out', 1.15]
				]
			)
		} else
			assert.deepEqual(
				edit.autoZooms.map((zoom) => zoom.amount),
				[look.zoom]
			)
	}
	// The video's colour colours a designed frame, not a frame over the picture.
	assert.deepEqual(planned('a bold reel', '#22aa44').edit.color, presetLook('bold', null).grade)
})

/** How far apart two hues are around the wheel: 0 to 180 degrees. */
const hueDistance = (a: number, b: number) => {
	const d = Math.abs(a - b) % 360
	return d > 180 ? 360 - d : d
}
/** 1,080 video colours: every 5° of hue, at three saturations and five lightnesses. */
const SWEEP = Array.from({ length: 72 }, (_, i) => i * 5).flatMap((turn) =>
	[0.4, 0.7, 1].flatMap((s) =>
		[0.2, 0.35, 0.5, 0.65, 0.8].map((l) => shifted('#ff0000', turn, s, l))
	)
)

test('Bold on a designed background: no fill, white text with a soft shadow, the spoken word in the accent', () => {
	assert.equal(SWEEP.length, 1080)
	for (const video of SWEEP) {
		const look = presetLook('bold', video)
		const drawn = drawnBackground(look.design)
		for (const [name, style] of [
			['captions', look.captions.designed],
			['title', look.title.designed]
		] as const) {
			const where = `Bold on ${video}: ${name}`
			// Every colour gets the no-fill look.
			assert.equal(style.background, null, where)
			assert.equal(style.shadow, true, where)
			assert.equal(style.color, '#ffffff', where)
			assert.equal(style.highlight, look.design.accent, where)
			// At 4.5:1 or more on the background as drawn, shapes and all, with no credit for the shadow.
			for (const b of drawn) {
				assert.ok(contrast(style.color, b) >= MIN_CONTRAST, `${where}: white on ${b}`)
				assert.ok(contrast(style.highlight ?? '', b) >= MIN_CONTRAST, `${where}: accent on ${b}`)
			}
		}
	}
})

test('Bold’s accent stays in the video’s own hue, never a complement, and colours the bar', () => {
	for (const video of SWEEP) {
		const look = presetLook('bold', video)
		const { h, s, l } = toHsl(fromHex(look.design.accent))
		const where = `Bold on ${video}: accent ${look.design.accent}`
		// A light colour of the video's own hue (not white, not grey).
		assert.ok(s > 0.3 && l >= 0.6, where)
		assert.ok(hueDistance(h, hueOf(video)) <= 2, where)
		// The whole designed background stays in the video's hue family too (its look turns 30° at most).
		for (const part of [look.design.from, look.design.to, look.design.shape]) {
			assert.ok(hueDistance(hueOf(part), hueOf(video)) <= 32, `${where}: ${part}`)
		}
	}
	// The bar (drawn in the design's accent) is the spoken word's colour.
	const green = presetLook('bold', '#2e8b2e')
	assert.equal(green.design.accent, green.captions.designed.highlight)
	// Bold's designed background is deep: its light end and its shapes are dark.
	assert.ok(
		toHsl(fromHex(green.design.to)).l <= 0.19 && toHsl(fromHex(green.design.shape)).l <= 0.26
	)
})

test('the background as drawn: both gradient ends, and each under the shapes at their most', () => {
	assert.ok(Math.abs(MAX_SHAPE_COVER - (1 - (1 - 0x66 / 255) ** 3)) < 1e-12)
	const design = { from: '#102010', to: '#204020', shape: '#80ff80' }
	assert.deepEqual(drawnBackground(design), [
		'#102010',
		'#204020',
		over('#80ff80', '#102010', MAX_SHAPE_COVER),
		over('#80ff80', '#204020', MAX_SHAPE_COVER)
	])
})

test('where white or the accent would read under 4.5:1, Bold falls back to the accent block with black text', () => {
	const dark = ['#0a1a0a', '#102810']
	assert.equal(boldText('#a6e88f', dark), 'shadow')
	// White fails on a light background.
	assert.ok(contrast('#ffffff', '#c8c8c8') < MIN_CONTRAST)
	assert.equal(boldText('#a6e88f', [...dark, '#c8c8c8']), 'block')
	// White reads on this one, but the accent doesn't: that alone falls back too.
	assert.ok(contrast('#ffffff', '#4f704f') >= MIN_CONTRAST)
	assert.ok(contrast('#a6e88f', '#4f704f') < MIN_CONTRAST)
	assert.equal(boldText('#a6e88f', [...dark, '#4f704f']), 'block')
	const block = boldTextStyle('block', '#a6e88f', 'sans', 1.8)
	assert.deepEqual(
		[block.background, block.solidBand, block.color, block.highlight, block.shadow],
		['#a6e88f', true, '#000000', '#000000', undefined]
	)
	assert.ok(contrast(block.color, block.background ?? '') >= MIN_CONTRAST)
	assert.equal(bandOpacity(block), 1)
	const shadow = boldTextStyle('shadow', '#a6e88f', 'sans', 1.8)
	assert.deepEqual(
		[shadow.background, shadow.shadow, shadow.color, shadow.highlight],
		[null, true, '#ffffff', '#a6e88f']
	)
})
