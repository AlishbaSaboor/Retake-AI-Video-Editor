import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript, type Transcript } from '../../editor/audio/transcript'
import {
	applyCheck,
	checkFound,
	checkReplySchema,
	makeReplySchema,
	planMake,
	type CheckReply,
	type MakeInput,
	type MakeReply
} from './make-plan'

// Today's plans, kept: every scenario below is planned and compared, whole
// (the edit, the summary and the reply as used), with what the planner made
// of it when this file was written (e2e/fixtures/make-plan-replay.json). A
// change in any decision the planner makes shows up here as a difference.
// The owner's three real replies (and the second check's replies to them)
// are replayed the way the Make it page does: planned, checked, planned
// again with the check's fixes, or again unchecked.

const fixture = (name: string): unknown =>
	JSON.parse(readFileSync(new URL(`../../../../../e2e/fixtures/${name}`, import.meta.url), 'utf-8'))
const reply = (run: 1 | 2 | 3) => makeReplySchema.parse(fixture(`real-run${run}-reply.json`))
const check = (run: 1 | 2 | 3) => checkReplySchema.parse(fixture(`real-run${run}-check.json`))

function longTalk(count: number) {
	return toTranscript(
		Array.from({ length: count }, (_, i) => ({
			word: `Step${i + 1}.`,
			start: i * 3.5,
			end: i * 3.5 + 3
		}))
	)
}

// Five sentences over a 20 s take: a short pause between the first two, a
// false start (3), then long pauses before 4 and 5.
const shortTalk = toTranscript([
	{ word: 'Hello.', start: 0.5, end: 1 },
	{ word: 'This', start: 1.3, end: 1.6 },
	{ word: 'is', start: 1.6, end: 1.8 },
	{ word: 'good.', start: 1.8, end: 2.4 },
	{ word: 'Oops', start: 5, end: 5.4 },
	{ word: 'wrong.', start: 5.4, end: 6 },
	{ word: 'Key', start: 9, end: 9.5 },
	{ word: 'point', start: 9.5, end: 10 },
	{ word: 'here.', start: 10, end: 11 },
	{ word: 'Bye', start: 13, end: 13.4 },
	{ word: 'Sarah', start: 13.4, end: 14 },
	{ word: 'now.', start: 14, end: 15 }
])

const BASE: MakeReply = {
	questions: [],
	style: 'reel',
	format: 'instagram_reel',
	subject: 'one_person',
	summary: 'A short talk; tightened into a 55 second reel.',
	pictureMatters: false,
	moments: [
		{ first: 1, last: 2 },
		{ first: 4, last: 4 }
	],
	removeSentences: [3],
	removeSpans: [],
	captions: 'bold_words',
	zoomSentences: [4, 99, 1],
	transition: 'dissolve',
	keyLines: [
		{ sentence: 4, text: 'Key point' },
		{ sentence: 2, text: 'invented words' }
	],
	shape: 'vertical',
	fit: 'fill',
	fitAsked: false,
	treatment: null,
	maxSeconds: null,
	brief: { audience: null, tone: null, length: null, show: null, callToAction: null },
	faces: [
		...[1, 2, 3, 4].map((frame) => ({ frame, x: 500, y: 300 })),
		...[5, 6, 7, 8, 9, 10].map((frame) => ({ frame, x: 800, y: 400 })),
		{ frame: 99, x: 100, y: 100 }
	],
	card: 'corner',
	music: 'upbeat.mp3',
	title: 'Meet Sarah now',
	cannotDo: ['Nothing to add']
}

const MUSIC = { name: 'upbeat.mp3', file: new Blob(['music']), buffer: 'decoded', seconds: 7 }
const WIDE = { width: 1920, height: 1080 }

type Scenario = Omit<MakeInput<string>, 'fillerCuts' | 'music' | 'musicAvailable'> &
	Partial<Pick<MakeInput<string>, 'fillerCuts' | 'music' | 'musicAvailable'>>

/** One plan, as JSON keeps it (the music's file as its size). */
function planned(scenario: Scenario) {
	const made = planMake<string>({ fillerCuts: [], music: null, musicAvailable: false, ...scenario })
	return JSON.parse(
		JSON.stringify(made, (_, value: unknown) =>
			value instanceof Blob ? `blob of ${value.size} bytes` : value
		)
	) as unknown
}

/** As the Make it page plans: the reply, then the check's fixes, or unchecked when it couldn't run. */
function checked(scenario: Scenario, found: CheckReply | null) {
	const first = planned(scenario)
	const made =
		found === null
			? planned({ ...scenario, unchecked: true })
			: checkFound(found)
				? planned({
						...scenario,
						reply: applyCheck(scenario.reply, found),
						tooShort: found.tooShort ? { keepOut: found.dropSentences } : null
					})
				: first
	return { first, made }
}

const screenRecording = (run: 1 | 2 | 3, request: string, followUps: string[] = []): Scenario => ({
	reply: reply(run),
	request,
	followUps,
	durationSeconds: 281,
	picture: WIDE,
	transcript: longTalk(79)
})

const talk = (overrides: Partial<MakeReply>, more: Partial<Scenario> = {}): Scenario => ({
	reply: { ...BASE, ...overrides },
	request: 'make this an Instagram reel',
	durationSeconds: 20,
	picture: WIDE,
	transcript: shortTalk,
	fillerCuts: [
		{ startSeconds: 1.2, endSeconds: 1.3 },
		{ startSeconds: 5.1, endSeconds: 5.2 }
	],
	music: MUSIC,
	musicAvailable: true,
	...more
})

const long = (count: number, overrides: Partial<MakeReply>, more: Partial<Scenario> = {}) =>
	talk(
		{ moments: [], removeSentences: [], keyLines: [], zoomSentences: [], ...overrides },
		{ durationSeconds: count * 3.5 + 1, transcript: longTalk(count), fillerCuts: [], ...more }
	)

/** Every scenario, by name: what each plans to. */
function scenarios(): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	// The owner's real runs, as the page made them.
	const runs: Array<[1 | 2 | 3, string]> = [
		[1, 'shorten this walkthrough'],
		[2, 'make a promo ad'],
		[3, 'make a promo ad']
	]
	for (const [run, request] of runs) {
		out[`real run ${run}, checked`] = checked(screenRecording(run, request), check(run))
		out[`real run ${run}, unchecked`] = checked(screenRecording(run, request), null)
	}
	// A screen recording's treatment and its reason, for each kind of ask, checked or not.
	for (const run of [1, 3] as const) {
		for (const request of [
			'make a promo ad',
			'shorten this walkthrough',
			'text only',
			'show the screen'
		]) {
			for (const unchecked of [false, true]) {
				out[`screen run ${run}: ${request}${unchecked ? ', unchecked' : ''}`] = planned({
					...screenRecording(run, request),
					unchecked
				})
			}
		}
	}
	out['screen, follow-ups: text only then show the screen'] = planned(
		screenRecording(3, 'make a promo ad', ['text only', 'show the screen'])
	)
	out['screen, Gemini says designed unasked'] = planned({
		...screenRecording(1, 'shorten this walkthrough'),
		reply: { ...reply(1), treatment: 'designed' }
	})
	out['screen, vertical blur asked'] = planned({
		...screenRecording(1, 'shorten this walkthrough, vertical with a blurred background'),
		reply: { ...reply(1), shape: 'vertical', fit: 'blur', fitAsked: true, zoomSentences: [5, 6] }
	})
	out['screen, a reel with zoom cuts asked'] = planned({
		...screenRecording(2, 'make a reel, zoom to fill'),
		reply: {
			...reply(2),
			format: 'instagram_reel',
			fit: 'fill',
			fitAsked: true,
			transition: 'zoom_cut'
		}
	})

	// Talking videos: each style, shape, fit and subject.
	for (const style of ['reel', 'professional', 'funny', 'ad'] as const) {
		for (const shape of ['vertical', 'square', 'portrait', 'horizontal', 'original'] as const) {
			out[`talk ${style} ${shape}`] = planned(talk({ style, shape, format: 'other' }))
		}
	}
	for (const fit of ['bars', 'blur', 'fill'] as const) {
		for (const fitAsked of [false, true]) {
			out[`talk fit ${fit}${fitAsked ? ' asked' : ''}`] = planned(
				talk(
					{ fit, fitAsked, format: 'other', style: 'professional', shape: 'square' },
					{ request: fitAsked ? 'square please, zoom in, blurred bars' : 'square please' }
				)
			)
		}
	}
	for (const subject of ['one_person', 'screen', 'meeting', 'slides', 'other'] as const) {
		out[`talk subject ${subject}`] = planned(talk({ subject }))
		out[`talk subject ${subject}, ad`] = planned(talk({ subject, style: 'ad', format: 'other' }))
	}
	out['meeting reel, card hidden'] = planned(talk({ subject: 'meeting', card: 'hidden' }))
	out['meeting reel, picture matters'] = planned(talk({ subject: 'meeting', pictureMatters: true }))
	out['already vertical'] = planned(talk({}, { picture: { width: 1080, height: 1920 } }))
	out['tall original'] = planned(
		talk({ shape: 'original', format: 'other' }, { picture: { width: 1080, height: 1920 } })
	)
	out['one face only, few frames'] = planned(talk({ faces: [{ frame: 1, x: 500, y: 300 }] }))
	out['no faces'] = planned(talk({ faces: [] }))
	out['picture matters, dead stretches'] = planned(
		talk({
			pictureMatters: true,
			removeSpans: [
				{ startSeconds: 16, endSeconds: 19 },
				{ startSeconds: 13, endSeconds: 10 }
			]
		})
	)
	for (const transition of ['none', 'fade', 'dissolve', 'slide', 'zoom_cut'] as const) {
		out[`transition ${transition}`] = planned(
			long(40, { transition, removeSentences: [3, 7, 8, 9, 15, 20, 21, 22, 30], format: 'other' })
		)
	}
	for (const captions of ['classic', 'bold_words', 'highlight', 'large', 'off'] as const) {
		out[`captions ${captions}`] = planned(talk({ captions }))
	}
	out['no transcript'] = planned(talk({}, { transcript: null }))
	out['empty transcript'] = planned(
		talk({}, { transcript: { segments: [], words: [] } as Transcript })
	)
	out['title invented'] = planned(talk({ title: 'Meet Jordan now' }))
	out['no title'] = planned(talk({ title: null }))
	out['no music'] = planned(talk({}, { music: null, musicAvailable: false }))
	out['call to action said'] = planned(
		talk(
			{
				brief: {
					audience: 'new users',
					tone: 'calm',
					length: null,
					show: 'the key point',
					callToAction: 'Bye Sarah now'
				}
			},
			{ request: 'a reel for new users, calm, show the key point, end with Bye Sarah now' }
		)
	)
	out['call to action invented'] = planned(
		talk({
			brief: {
				audience: null,
				tone: null,
				length: null,
				show: null,
				callToAction: 'Visit Acme today'
			}
		})
	)
	out['call to action, long edit'] = planned(
		long(20, {
			keyLines: [
				{ sentence: 18, text: 'Step18' },
				{ sentence: 19, text: 'Step19' },
				{ sentence: 5, text: 'Step5' }
			],
			brief: { audience: null, tone: null, length: null, show: null, callToAction: 'Step20' },
			format: 'other',
			title: 'Step1'
		})
	)

	// Length: fitting a reel, an asked length, lengthening when the check says too short.
	const moments = [
		{ first: 30, last: 31 },
		{ first: 2, last: 4 },
		{ first: 17, last: 19 },
		{ first: 9, last: 9 }
	]
	out['reel trimmed to fit'] = planned(long(40, { moments, removeSentences: [12] }))
	out['reel trimmed, picture matters'] = planned(long(40, { moments, pictureMatters: true }))
	out['reel, one long sentence capped'] = planned(
		talk(
			{},
			{ durationSeconds: 120, transcript: toTranscript([{ word: 'Long.', start: 0, end: 110 }]) }
		)
	)
	out['asked 30 seconds'] = planned(
		long(40, { moments, maxSeconds: 30, format: 'other' }, { request: 'make it 30 seconds' })
	)
	out['asked 30 seconds, reel'] = planned(
		long(40, { moments, maxSeconds: 30 }, { request: 'a 30 s reel' })
	)
	out['asked length, check too short'] = planned(
		long(
			40,
			{ moments, maxSeconds: 30, format: 'other' },
			{ request: 'make this a 30 second Instagram reel', tooShort: { keepOut: [] } }
		)
	)
	out['reel too short, lengthened'] = planned(
		long(
			40,
			{ moments, removeSentences: Array.from({ length: 34 }, (_, i) => i + 3) },
			{ tooShort: { keepOut: [5, 6] } }
		)
	)
	out['reel too short, nothing to add'] = planned(
		long(8, { moments: [] }, { tooShort: { keepOut: [] } })
	)
	out['reel short, video short'] = planned(long(10, {}))
	out['not short form, check too short'] = planned(
		long(
			20,
			{ format: 'other', style: 'professional' },
			{ request: 'tidy this up', tooShort: { keepOut: [] } }
		)
	)
	out['reel of a long video left short'] = planned(
		long(20, { removeSentences: Array.from({ length: 14 }, (_, i) => i + 3) })
	)
	out['key lines that clash'] = planned(
		long(20, {
			format: 'other',
			title: null,
			keyLines: [
				{ sentence: 5, text: 'Step5' },
				{ sentence: 5, text: 'Step5' },
				{ sentence: 6, text: 'Step6' },
				{ sentence: 12, text: 'Step12' },
				{ sentence: 14, text: 'Step14' },
				{ sentence: 16, text: 'Step16' },
				{ sentence: 18, text: 'Step18' }
			]
		})
	)
	out['shorts in the request only'] = planned(
		long(40, { moments, format: 'other' }, { request: 'turn this into youtube shorts' })
	)
	return out
}

const expected = fixture('make-plan-replay.json') as Record<string, unknown>
const actual = scenarios()

test('every scenario captured is still planned', () => {
	assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
})

for (const [name, plan] of Object.entries(actual)) {
	test(`plans as before: ${name}`, () => {
		assert.deepEqual(plan, expected[name])
	})
}
