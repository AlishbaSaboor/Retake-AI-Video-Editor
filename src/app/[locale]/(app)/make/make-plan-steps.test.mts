import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/audio/transcript'
import { editedStarts, type Clip } from '../../editor/model/sequence'
import type { TitleCard } from '../../editor/overlays/overlays'
import {
	captionSettings,
	cutEdit,
	fitToLimit,
	frameTimes,
	keyLineTitles,
	lengthenForCheck,
	lengthLimits,
	musicBed,
	openingMoment,
	planContext,
	planSummary,
	planTitle,
	planZooms,
	screenTreatment,
	shapeAndFit,
	shortLabel,
	transitionJoins,
	withCallToAction,
	SHORT_FORM_MAX_SECONDS,
	SHORT_FORM_TARGET_SECONDS,
	type MakeInput,
	type MakeReply
} from './make-plan'
import { presetLook } from './make-presets'

// Each step planMake takes, on its own: small inputs, and the decision it makes.

/** `count` sentences of 3 s, one every 3.5 s: "Step1." to "StepN.". */
function talk(count: number) {
	return toTranscript(
		Array.from({ length: count }, (_, i) => ({
			word: `Step${i + 1}.`,
			start: i * 3.5,
			end: i * 3.5 + 3
		}))
	)
}

const REPLY: MakeReply = {
	questions: [],
	style: 'reel',
	format: 'other',
	subject: 'one_person',
	summary: 'A talk.',
	pictureMatters: false,
	moments: [],
	removeSentences: [],
	removeSpans: [],
	captions: 'classic',
	zoomSentences: [],
	transition: 'none',
	keyLines: [],
	shape: 'original',
	fit: 'bars',
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

const input = (
	reply: Partial<MakeReply>,
	more: Partial<MakeInput<string>> = {},
	count = 10
): MakeInput<string> => ({
	reply: { ...REPLY, ...reply },
	request: 'tidy this up',
	durationSeconds: count * 3.5,
	picture: { width: 1920, height: 1080 },
	transcript: talk(count),
	fillerCuts: [],
	music: null,
	musicAvailable: false,
	...more
})

const range = (startSeconds: number, endSeconds: number) => ({ startSeconds, endSeconds })
const clip = (id: string, startSeconds: number, endSeconds: number): Clip => ({
	id,
	ranges: [range(startSeconds, endSeconds)]
})

test('planContext: the user’s words include follow-ups; a screen gets no zoom cuts; no speech means the picture matters', () => {
	const context = planContext(
		input(
			{ subject: 'screen', transition: 'zoom_cut' },
			{ request: 'a promo', followUps: ['text only'] }
		)
	)
	assert.deepEqual(context.said, ['a promo', 'text only'])
	assert.equal(context.promo, true)
	assert.equal(context.screen, true)
	// The transition is the look's: Playful's zoom cut, but never on a screen.
	assert.equal(
		planContext(input({ subject: 'screen' }, { request: 'a playful promo' })).transition,
		'none'
	)
	assert.equal(context.known.endsWith(' a promo'), true)
	assert.equal(planContext(input({}, { request: 'a playful one' })).transition, 'zoom_cut')
	const silent = planContext(input({}, { transcript: null }))
	assert.equal(silent.pictureMatters, true)
	assert.equal(silent.hasWords, false)
})

test('cutEdit: the opening moment plays first, and only filler cuts in what is kept apply', () => {
	const context = planContext(
		input(
			{},
			{
				fillerCuts: [range(1, 1.2), range(8, 8.2)]
			}
		)
	)
	// Sentence 3 (7–10 s) taken out; the moment of sentence 6 (17.5–20.5 s) opens.
	const cut = cutEdit(context, [3], null, { from: 5, to: 5 })
	assert.equal(cut.kept[0]?.startSeconds, 17.25)
	assert.deepEqual(cut.cuts, [range(1, 1.2)])
	assert.equal(cut.clips[0]?.id, 'make-1')
	// A cap keeps only the first seconds of source.
	assert.ok(cutEdit(context, [], 10).editedSeconds <= 10)
})

test('transitionJoins: the biggest jumps first, at most three, each fitted to its clips', () => {
	const clips = [
		clip('a', 0, 4),
		clip('b', 6, 10), // 2 s out
		clip('c', 20, 24), // 10 s out
		clip('d', 25, 29), // 1 s: too little to mark
		clip('e', 35, 39), // 6 s out
		clip('f', 44, 44.3) // 5 s out, but too short for a dissolve
	]
	assert.deepEqual(transitionJoins(clips, 'dissolve'), [2, 4, 5])
	assert.equal(clips[2]?.transition?.kind, 'dissolve')
	assert.equal(clips[2]?.transition?.after, 'b')
	assert.equal(clips[5]?.transition, undefined)
	assert.equal(clips[1]?.transition, undefined)
	// Zoom cuts are chosen at the same joins, but nothing is set on a clip.
	const plain = [clip('a', 0, 4), clip('b', 10, 14)]
	assert.deepEqual(transitionJoins(plain, 'zoom_cut'), [1])
	assert.equal(plain[1]?.transition, undefined)
})

test('lengthLimits: short form under a minute; an asked length limits and is filled to 85%', () => {
	assert.deepEqual(lengthLimits({ format: 'other', maxSeconds: null }, 'tidy this up'), {
		shortForm: false,
		asked: null,
		limitSeconds: null,
		target: SHORT_FORM_TARGET_SECONDS
	})
	assert.deepEqual(lengthLimits({ format: 'other', maxSeconds: null }, 'make it a reel'), {
		shortForm: true,
		asked: null,
		limitSeconds: SHORT_FORM_MAX_SECONDS,
		target: SHORT_FORM_TARGET_SECONDS
	})
	assert.deepEqual(lengthLimits({ format: 'other', maxSeconds: 30 }, 'tidy this up'), {
		shortForm: false,
		asked: 30,
		limitSeconds: 30,
		target: 30 * 0.85
	})
	assert.equal(
		lengthLimits({ format: 'tiktok', maxSeconds: 90 }, '').limitSeconds,
		SHORT_FORM_MAX_SECONDS
	)
})

test('openingMoment: the first moment, either way round, only for short form', () => {
	assert.deepEqual(openingMoment([{ first: 5, last: 3 }], 10, true), { from: 2, to: 4 })
	assert.deepEqual(openingMoment([{ first: 8, last: 20 }], 10, true), { from: 7, to: 9 })
	assert.equal(openingMoment([{ first: 5, last: 3 }], 10, false), null)
	assert.equal(openingMoment([], 10, true), null)
})

test('fitToLimit: over the limit, whole moments are chosen to fit; under it, nothing changes', () => {
	const context = planContext(input({ moments: [{ first: 30, last: 31 }] }, {}, 40))
	const limits = lengthLimits({ format: 'other', maxSeconds: null }, 'a reel')
	const fitted = fitToLimit(context, limits, null)
	assert.equal(fitted.trimmedToFit, true)
	assert.ok(fitted.cut.editedSeconds <= SHORT_FORM_MAX_SECONDS)
	assert.ok(fitted.cut.editedSeconds >= SHORT_FORM_TARGET_SECONDS)
	// The moment (sentences 30 and 31) is in it.
	assert.equal(fitted.removeSentences.includes(30), false)
	assert.equal(fitted.removeSentences.includes(31), false)
	const short = planContext(input({ removeSentences: [2] }, {}, 5))
	const untouched = fitToLimit(short, limits, null)
	assert.equal(untouched.trimmedToFit, false)
	assert.deepEqual(untouched.removeSentences, [2])
})

test('lengthenForCheck: a short reel takes back sentences, never the check’s own drops', () => {
	const removeSentences = Array.from({ length: 30 }, (_, i) => i + 6)
	const context = planContext(input({ removeSentences }, {}, 40))
	const limits = lengthLimits({ format: 'other', maxSeconds: null }, 'a reel')
	const fitted = fitToLimit(context, limits, null)
	const longer = lengthenForCheck(context, fitted, limits, { keepOut: [6, 7] }, null)
	assert.equal(longer.lengthened, true)
	assert.ok(longer.cut.editedSeconds > fitted.cut.editedSeconds)
	assert.ok(longer.removeSentences.includes(6) && longer.removeSentences.includes(7))
	// Not told it's too short, or a length was asked for: as it was.
	assert.equal(lengthenForCheck(context, fitted, limits, null, null).lengthened, false)
	const asked = lengthLimits({ format: 'other', maxSeconds: 59 }, 'a reel')
	assert.equal(lengthenForCheck(context, fitted, asked, { keepOut: [] }, null).lengthened, false)
})

test('shortLabel: under 50 s of a longer video, or short of what the check wants; never with an asked length', () => {
	const reel = { asked: null, limitSeconds: SHORT_FORM_MAX_SECONDS }
	assert.equal(shortLabel(reel, 40, 120, null), 'short_form')
	assert.equal(shortLabel(reel, 49.6, 120, null), null) // rounds to 50
	assert.equal(shortLabel(reel, 40, 45, null), null) // the video is shorter than 50 s
	assert.equal(shortLabel({ asked: null, limitSeconds: null }, 40, 120, { keepOut: [] }), 'asked')
	assert.equal(shortLabel({ asked: null, limitSeconds: null }, 40, 120, null), null)
	assert.equal(shortLabel({ asked: 30, limitSeconds: 30 }, 10, 120, { keepOut: [] }), null)
})

test('screenTreatment: the user’s words decide, then a promo, else whole; unchecked is always whole', () => {
	const screen = (said: string[], unchecked = false) =>
		screenTreatment(
			{ screen: true, said, promo: said.some((text) => /\b(ad|promo)\b/.test(text)) },
			unchecked
		)
	assert.deepEqual(screen(['make a promo ad']), { treatment: 'designed', why: 'promo' })
	assert.deepEqual(screen(['shorten this walkthrough']), { treatment: 'whole', why: 'default' })
	assert.deepEqual(screen(['text only']), { treatment: 'designed', why: 'asked' })
	assert.deepEqual(screen(['make a promo ad, show the screen']), {
		treatment: 'whole',
		why: 'asked'
	})
	assert.deepEqual(screen(['make a promo ad', 'text only']), {
		treatment: 'designed',
		why: 'asked'
	})
	for (const said of [['make a promo ad'], ['text only'], ['show the screen']]) {
		assert.deepEqual(screen(said, true), { treatment: 'whole', why: 'unchecked' })
	}
	assert.equal(screenTreatment({ screen: false, said: ['text only'], promo: true }, false), null)
})

test('shapeAndFit: a screen is never zoomed; a designed one shows no picture; one person is followed', () => {
	const context = (reply: Partial<MakeReply>, said = ['tidy this up']) => ({
		...planContext(input(reply, { durationSeconds: 20 })),
		said
	})
	// A screen recording, vertical, fill asked for: shown whole with bars, not zoomed.
	const screen = shapeAndFit(
		context({ subject: 'screen', shape: 'vertical', fit: 'fill', fitAsked: true }, ['zoom in']),
		false,
		'whole'
	)
	assert.equal(screen.shape.how, 'whole')
	assert.equal(screen.shape.fit, 'bars')
	// Designed: the palette, no picture, the shape fitted.
	const designed = shapeAndFit(context({ subject: 'screen', style: 'ad' }), false, 'designed')
	assert.deepEqual(designed.design, {
		palette: 'ad',
		picture: 'hidden',
		look: presetLook('bold', null).design
	})
	assert.equal(designed.shape.how, 'designed')
	// One person, a face in every frame: a reel follows it.
	const faces = frameTimes(20).map((_, i) => ({ frame: i + 1, x: 500, y: 300 }))
	const face = shapeAndFit(context({ shape: 'vertical', fit: 'fill', faces }), true, null)
	assert.equal(face.shape.how, 'face')
	assert.equal(face.shape.asked, false)
	// The same as an ad isn't zoomed unless asked, in the user's own words.
	assert.equal(
		shapeAndFit(context({ shape: 'vertical', fit: 'fill', faces, style: 'ad' }), true, null).shape
			.how,
		'whole'
	)
	const asked = shapeAndFit(
		context({ shape: 'vertical', fit: 'fill', fitAsked: true, faces, style: 'ad' }, ['zoom in']),
		true,
		null
	)
	assert.deepEqual([asked.shape.how, asked.shape.asked], ['face', true])
	// Gemini saying a fit was asked counts only with the user's words.
	assert.equal(
		shapeAndFit(context({ shape: 'square', fit: 'blur', fitAsked: true }), false, null).shape.asked,
		false
	)
	// A meeting reel whose picture doesn't carry it: designed, with the card asked for.
	const meeting = shapeAndFit(
		context({ subject: 'meeting', shape: 'vertical', card: 'corner' }),
		true,
		null
	)
	assert.deepEqual(meeting.design, {
		palette: 'reel',
		picture: 'corner',
		look: presetLook('bold', null).design
	})
	// Already the shape, or kept as it is.
	assert.equal(shapeAndFit(context({ shape: 'horizontal' }), false, null).shape.how, 'matches')
	assert.equal(shapeAndFit(context({ shape: 'original' }), false, null).shape.how, 'kept')
})

test('planZooms: zoom cuts at the joins, zooms on key words, none on a screen or a design', () => {
	const context = planContext(
		input({
			keyLines: [
				{ sentence: 2, text: 'Step2' },
				{ sentence: 4, text: 'Step4' },
				{ sentence: 99, text: 'Step99' }
			],
			style: 'funny'
		})
	)
	const cut = cutEdit(context, [])
	const starts = editedStarts(cut.segments)
	const zooms = planZooms(context, cut, starts, null, 'centred')
	// Nothing is cut, so sentences 2 and 4 play where they were said; 99 doesn't exist.
	// Playful (a funny video's look) pushes in at 1.35.
	assert.deepEqual(
		zooms.map((zoom) => [zoom.startSeconds, zoom.direction, zoom.amount]),
		[
			[3.5, 'in', 1.35],
			[10.5, 'in', 1.35]
		]
	)
	assert.deepEqual(planZooms({ ...context, screen: true }, cut, starts, null, 'centred'), [])
	assert.deepEqual(
		planZooms(context, cut, starts, { palette: 'reel', picture: 'hidden' }, 'centred'),
		[]
	)
	const joins = { ...cut, joins: [1] }
	const zoomCut = planZooms({ ...context, transition: 'zoom_cut' }, joins, starts, null, 'kept')
	assert.equal(zoomCut[0]?.direction, 'out')
})

test('musicBed: the track repeated to fill the edit, the last piece cut short; none without one', () => {
	const music = { name: 'beat.mp3', file: new Blob(['x']), buffer: 'decoded', seconds: 20 }
	const items = musicBed(music, 50)
	assert.deepEqual(
		items.map((item) => [item.atSeconds, item.seconds]),
		[
			[0, 20],
			[20, 20],
			[40, 10]
		]
	)
	assert.ok(items.every((item) => item.duck && item.volume === 0.35))
	assert.deepEqual(musicBed(null, 50), [])
	assert.deepEqual(musicBed({ ...music, seconds: 0 }, 50), [])
})

test('planTitle: never with a name nobody said; bigger in a designed frame, at the top when tall', () => {
	const known = 'hello this is sarah'
	const make = (title: string, design = false, tall = false) =>
		planTitle(
			{ reply: { ...REPLY, title }, known, look: presetLook('clean', null) },
			30,
			design ? { palette: 'reel', picture: 'hidden' } : null,
			tall
		)
	assert.deepEqual(make('Meet Jordan').title, null)
	assert.equal(make('Meet Jordan').titleDropped, true)
	const plain = make('Meet Sarah').title
	assert.equal(plain?.durationSeconds, 3)
	assert.deepEqual(plain?.at, { x: 0.5, y: 0.4 })
	assert.deepEqual(make('Meet Sarah', false, true).title?.at, { x: 0.5, y: 0.18 })
	assert.ok((make('Meet Sarah', true).title?.style?.size ?? 0) > (plain?.style?.size ?? 0))
	assert.deepEqual(
		planTitle({ reply: REPLY, known, look: presetLook('clean', null) }, 30, null, false),
		{
			title: null,
			titleDropped: false
		}
	)
})

test('keyLineTitles: only quoted words, after the title, never two at once, at most four', () => {
	const context = planContext(
		input({
			keyLines: [
				{ sentence: 1, text: 'Step1' }, // under the title
				{ sentence: 2, text: 'Not said' },
				{ sentence: 3, text: 'Step3' },
				{ sentence: 3, text: 'Step3' }, // the same moment again
				{ sentence: 5, text: 'Step5' },
				{ sentence: 6, text: 'Step6' },
				{ sentence: 7, text: 'Step7' },
				{ sentence: 8, text: 'Step8' }
			]
		})
	)
	const cut = cutEdit(context, [])
	const title: TitleCard = { text: 'Title', startSeconds: 0, durationSeconds: 3 }
	const lines = keyLineTitles(context, cut, editedStarts(cut.segments), title)
	assert.deepEqual(
		lines.map((line) => line.text),
		['Step3', 'Step5', 'Step6', 'Step7']
	)
})

test('withCallToAction: said words only, over the end, key lines it meets left out, in order', () => {
	const line = (text: string, startSeconds: number): TitleCard => ({
		text,
		startSeconds,
		durationSeconds: 2
	})
	const reply = (callToAction: string) => ({
		...REPLY,
		brief: { ...REPLY.brief, callToAction }
	})
	const known = 'follow me for more'
	const made = withCallToAction(
		{ reply: reply('Follow me for more'), known, look: presetLook('clean', null) },
		[line('late', 27), line('early', 10), line('middle', 20)],
		30,
		null
	)
	assert.equal(made.callToAction, 'Follow me for more')
	assert.deepEqual(
		made.autoTitles.map((title) => [title.text, title.startSeconds]),
		[
			['early', 10],
			['middle', 20],
			['Follow me for more', 27]
		]
	)
	const invented = withCallToAction(
		{ reply: reply('Visit Acme'), known, look: presetLook('clean', null) },
		[line('b', 15), line('a', 5)],
		30,
		null
	)
	assert.equal(invented.callToAction, null)
	// With none, the key lines still come out in the order they show.
	assert.deepEqual(
		invented.autoTitles.map((title) => title.text),
		['a', 'b']
	)
})

test('captionSettings: the look’s captions, or off with no words or when the reply has none', () => {
	const bold = presetLook('bold', null)
	assert.deepEqual(captionSettings(bold, { captions: 'large' }, true, false).captionStyle.size, 1.8)
	assert.equal(captionSettings(bold, { captions: 'classic' }, true, false).captionMode, 'words')
	const cinematic = captionSettings(
		presetLook('cinematic', null),
		{ captions: 'large' },
		true,
		false
	)
	assert.deepEqual([cinematic.captionMode, cinematic.captionStyle.font], ['lines', 'serif'])
	const off = captionSettings(bold, { captions: 'large' }, false, false)
	assert.deepEqual([off.captions, off.captionsOn, off.captionMode], ['off', false, 'lines'])
	assert.equal(captionSettings(bold, { captions: 'off' }, true, false).captionsOn, false)
})

test('planSummary: a brief part is the user’s only in their own words; counts leave out the extras', () => {
	const context = planContext(
		input(
			{
				brief: {
					audience: 'new users',
					tone: 'energetic',
					length: null,
					show: null,
					callToAction: null
				},
				transition: 'zoom_cut'
			},
			{ request: 'a playful promo for new users' }
		)
	)
	const limits = lengthLimits(context.reply, 'a playful promo for new users')
	const fitted = fitToLimit(context, limits, null)
	const made = { ...fitted, lengthened: false }
	const zoom = { startSeconds: 0, endSeconds: 1, direction: 'in' as const, amount: 1.2 }
	const summary = planSummary(context, {
		limits,
		made: { ...made, cut: { ...made.cut, joins: [1] } },
		short: null,
		opener: null,
		captions: 'classic',
		edit: {
			autoZooms: [zoom, zoom, zoom],
			autoTitles: [
				{ text: 'a', startSeconds: 0, durationSeconds: 1 },
				{ text: 'Call', startSeconds: 2, durationSeconds: 1 }
			],
			audioItems: [],
			title: null,
			design: null
		},
		callToAction: 'Call',
		titleDropped: false,
		music: null,
		musicAvailable: false,
		shape: { target: 'original', fit: null, how: 'kept', asked: false },
		screen: null
	})
	assert.equal(summary.brief.said.audience, true)
	assert.equal(summary.brief.said.tone, false)
	assert.equal(summary.brief.chosenFor, 'promo')
	assert.equal(summary.keyLines, 1)
	assert.equal(summary.zooms, 2)
	assert.equal(summary.musicMissing, true)
	assert.equal(summary.totalSentences, 10)
})
