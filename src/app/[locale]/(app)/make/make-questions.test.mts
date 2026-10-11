import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/audio/transcript'
import { askedLength, makeReplySchema, planMake, type MakeReply } from './make-plan'
import {
	applyChoices,
	choiceWords,
	decideAll,
	namesAd,
	namesKind,
	namesLength,
	namesShortVideo,
	QUESTIONS,
	questionsToAsk,
	type MakeChoices
} from './make-questions'

const ALL_ASKED = ['kind', 'length', 'tone', 'callToAction']

test('a request that says nothing gets every built question; one that says it all gets none', () => {
	assert.deepEqual(questionsToAsk('shorten this walkthrough'), ALL_ASKED)
	assert.deepEqual(
		questionsToAsk(
			'A 45 second Instagram reel for small business owners, upbeat hip hop, energetic tone, end with "Follow for more tips"'
		),
		[]
	)
	assert.deepEqual(
		questionsToAsk(
			'An ad in 16:9 for new users, 20 seconds, calm tone, close with "Sign up today"'
		),
		[]
	)
})

test('what it is: skipped when the request names a reel, TikTok, Short, story or an ad', () => {
	for (const request of [
		'make this an Instagram reel',
		'a reel please',
		'insta version',
		'make a TikTok',
		'tik tok cut',
		'YouTube Short',
		'yt shorts',
		'turn it into shorts',
		'for my story',
		'make an ad',
		'a 30 s advert',
		'an advertisement',
		'a promo',
		'promotional cut',
		'a commercial'
	]) {
		assert.equal(questionsToAsk(request).includes('kind'), false, request)
	}
	assert.equal(questionsToAsk('tidy it up').includes('kind'), true)
})

test('whole words only: "add captions", "advice", "adjust" are no ad; "short" and "story" never inside a word', () => {
	for (const text of [
		'add captions',
		'advice for new founders',
		'adjust the colors',
		'made for teachers',
		'download the file',
		'bad audio'
	]) {
		assert.equal(namesAd(text), false, text)
	}
	for (const text of [
		'make it short',
		'shorten this',
		'shortly after',
		'a shortcut',
		'history of the company',
		'storyboard first',
		'from the store'
	]) {
		assert.equal(namesShortVideo(text), false, text)
		assert.equal(namesKind(text), false, text)
	}
	// So these still ask what it is.
	assert.equal(questionsToAsk('add captions and adjust it').includes('kind'), true)
})

test("an ad's shape: asked for an ad only, unless a shape or a short-video platform is named", () => {
	assert.equal(questionsToAsk('make an ad').includes('adShape'), true)
	assert.equal(questionsToAsk('make this an Instagram reel').includes('adShape'), false)
	assert.equal(questionsToAsk('tidy it up').includes('adShape'), false)
	for (const request of [
		'a vertical ad',
		'an ad in portrait',
		'a horizontal ad',
		'a landscape ad',
		'an ad, 9:16',
		'an ad, 16 : 9',
		'a square ad',
		'an ad, 1:1',
		'an ad, 4:5',
		'an ad, keep its own shape',
		'an ad in the original aspect ratio',
		'a TikTok ad',
		'an ad for my Instagram story'
	]) {
		assert.equal(questionsToAsk(request).includes('adShape'), false, request)
	}
	// Picked on the screen: Ad shows it, a reel doesn't.
	assert.equal(questionsToAsk('tidy it up', { kind: 'ad' }).includes('adShape'), true)
	assert.equal(questionsToAsk('tidy it up', { kind: 'tiktok' }).includes('adShape'), false)
	assert.deepEqual(questionsToAsk('tidy it up', { kind: 'ad' }), [
		'kind',
		'adShape',
		'length',
		'tone',
		'callToAction'
	])
})

test('tone and call to action: each asked only when the request gives none', () => {
	for (const request of [
		'a calm reel',
		'make it energetic',
		'a playful vibe',
		'keep the tone serious',
		'friendly and warm'
	]) {
		assert.equal(questionsToAsk(request).includes('tone'), false, request)
	}
	for (const request of [
		'end with "Follow us"',
		'ending with the link',
		'close with Sign up today',
		'add a call to action',
		'a CTA at the end',
		'link in bio at the end',
		'ask them to subscribe',
		'follow for more',
		'visit our site'
	]) {
		assert.equal(questionsToAsk(request).includes('callToAction'), false, request)
	}
	// One of the two given: only the other asked.
	assert.deepEqual(questionsToAsk('an energetic reel'), ['length', 'callToAction'])
	assert.deepEqual(questionsToAsk('a reel, end with "Follow us"'), ['length', 'tone'])
})

test('the voice and music questions are defined but never shown until music is built', () => {
	const hidden = QUESTIONS.filter(({ built }) => !built).map(({ id }) => id)
	assert.deepEqual(hidden, ['voice', 'music'])
	// A reel with no music named would ask both, were they built.
	for (const request of ['make this a reel', 'tidy it up', 'make an ad']) {
		const shown = questionsToAsk(request, { kind: 'tiktok' })
		assert.equal(shown.includes('voice'), false, request)
		assert.equal(shown.includes('music'), false, request)
	}
})

const choices = (fields: Partial<MakeChoices>): MakeChoices => ({
	...decideAll(['kind', 'adShape', 'tone', 'callToAction']),
	...fields
})

test('the answers are the user’s own words; Skip all leaves none', () => {
	assert.deepEqual(
		choiceWords(
			choices({ kind: 'ad', adShape: 'original', tone: 'calm', callToAction: 'Book a demo' })
		),
		['An ad.', "Keep the video's own shape.", 'Tone: calm.', 'Call to action: Book a demo.']
	)
	assert.deepEqual(choiceWords(choices({ kind: 'instagram_reel' })), ['An Instagram reel.'])
	assert.deepEqual(choiceWords(choices({ kind: 'youtube_shorts' })), ['YouTube Shorts.'])
	assert.deepEqual(choiceWords(choices({ kind: 'other' })), ['Another kind of video.'])
	assert.deepEqual(choiceWords(decideAll(['kind', 'tone'])), [])
	assert.deepEqual(choiceWords(null), [])
})

const REPLY: MakeReply = {
	questions: [],
	style: 'professional',
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
	shape: 'horizontal',
	fit: 'bars',
	fitAsked: false,
	treatment: null,
	maxSeconds: null,
	brief: { audience: null, tone: 'calm', length: null, show: null, callToAction: 'Visit Acme' },
	faces: [],
	card: 'corner',
	music: null,
	title: null,
	cannotDo: []
}

test('a clicked answer is put in place of Gemini’s guess; a later follow-up naming it wins', () => {
	const mine = choices({
		kind: 'ad',
		adShape: 'vertical',
		tone: 'energetic',
		callToAction: 'Follow for more'
	})
	const applied = applyChoices(REPLY, mine)
	assert.equal(applied.style, 'ad')
	assert.equal(applied.format, 'other')
	assert.equal(applied.shape, 'vertical')
	assert.equal(applied.brief.tone, 'energetic')
	assert.equal(applied.brief.callToAction, 'Follow for more')
	// A reel clicked: its format, and an ad's style goes.
	const reel = applyChoices({ ...REPLY, style: 'ad' }, choices({ kind: 'tiktok' }))
	assert.deepEqual([reel.format, reel.style], ['tiktok', 'reel'])
	// "You decide" on all: Gemini's reply, as it was.
	assert.equal(applyChoices(REPLY, decideAll(['kind', 'tone'])), REPLY)
	assert.equal(applyChoices(REPLY, null), REPLY)
	// Later in the chat: "make it square" and "a calmer tone" are the latest asks.
	const later = applyChoices(REPLY, mine, ['make it square', 'a calmer tone please'])
	assert.equal(later.shape, 'horizontal')
	assert.equal(later.brief.tone, 'calm')
	assert.equal(later.brief.callToAction, 'Follow for more')
	assert.equal(
		applyChoices(REPLY, mine, ['end with "Visit Acme"']).brief.callToAction,
		'Visit Acme'
	)
	assert.equal(applyChoices(REPLY, mine, ['make it a TikTok']).style, 'professional')
})

/** Twenty sentences of 3 s: "Step1." to "Step20.". */
const talk = toTranscript(
	Array.from({ length: 20 }, (_, i) => ({
		word: `Step${i + 1}.`,
		start: i * 3.5,
		end: i * 3.5 + 3
	}))
)
const plan = (reply: MakeReply, request: string, picked: MakeChoices | null) =>
	planMake({
		reply,
		request,
		durationSeconds: 71,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		choices: picked
	})

test('the plan follows what was clicked when Gemini disagrees: the shape, the tone, the call to action', () => {
	const made = plan(
		REPLY,
		'tidy it up',
		choices({ kind: 'ad', adShape: 'vertical', tone: 'energetic', callToAction: 'Follow for more' })
	)
	assert.equal(made.summary.shape.target, 'vertical')
	assert.equal(made.summary.style, 'ad')
	assert.equal(made.summary.brief.tone, 'energetic')
	assert.equal(made.summary.brief.callToAction, 'Follow for more')
	// The call to action is on screen, its words the user's own.
	assert.equal(made.edit.autoTitles?.at(-1)?.text, 'Follow for more')
	// Each reads as the user's, on the plan card.
	assert.equal(made.summary.brief.said.tone, true)
	assert.equal(made.summary.brief.said.callToAction, true)
	assert.deepEqual(made.summary.questions, {
		kind: { value: 'ad', said: true },
		shape: { value: 'vertical', said: true }
	})
	// An ad keeps the whole picture: bars, not zoomed in.
	assert.deepEqual([made.summary.shape.how, made.summary.shape.fit], ['whole', 'bars'])
	// Keep the video's shape: kept, whatever Gemini said.
	assert.equal(
		plan(REPLY, 'tidy it up', choices({ kind: 'ad', adShape: 'original' })).summary.shape.target,
		'original'
	)
	// A reel clicked: vertical and under a minute.
	const reel = plan(REPLY, 'tidy it up', choices({ kind: 'instagram_reel' }))
	assert.equal(reel.summary.shape.target, 'vertical')
	assert.equal(reel.summary.limitSeconds, 59)
})

test('left to "You decide" or Skip all: Gemini’s choice, labelled as chosen for the user', () => {
	const skipped = plan(REPLY, 'tidy it up', decideAll(['kind', 'adShape', 'tone', 'callToAction']))
	assert.deepEqual(skipped.summary.questions, {
		kind: { value: 'professional', said: false },
		shape: { value: 'horizontal', said: false }
	})
	assert.equal(skipped.summary.brief.tone, 'calm')
	assert.equal(skipped.summary.brief.said.tone, false)
	// Only the questions shown are labelled; none shown, nothing added.
	assert.deepEqual(plan(REPLY, 'make an ad', decideAll(['tone'])).summary.questions, {})
	assert.equal(plan(REPLY, 'tidy it up', null).summary.questions, undefined)
	// "Other" clicked reads as the user's, by its own name.
	assert.deepEqual(plan(REPLY, 'tidy it up', choices({ kind: 'other' })).summary.questions?.kind, {
		value: 'other',
		said: true
	})
})

test('a screen recording clicked as an ad is designed, as a promo; skipped, it shows whole', () => {
	const screen = { ...REPLY, subject: 'screen' as const, shape: 'original' as const }
	const ad = plan(screen, 'tidy up this walkthrough', choices({ kind: 'ad' }))
	assert.deepEqual(ad.summary.screen, { treatment: 'designed', why: 'promo' })
	const skipped = plan(screen, 'tidy up this walkthrough', decideAll(['kind']))
	assert.deepEqual(skipped.summary.screen, { treatment: 'whole', why: 'default' })
})

// The length: asked only when the request states none; a click is the
// plan's most, a follow-up's later ask wins, and Gemini's own number counts
// only when the user's words asked for a length.

test('length: asked only when the request states none, in whole words', () => {
	for (const request of [
		'make a 30 second ad',
		'a 45-second reel',
		'make it 0:45',
		'keep it to 1 minute',
		'under 1.5 min',
		'30s please',
		'a 15 s teaser'
	]) {
		assert.equal(namesLength(request), true, request)
		assert.equal(questionsToAsk(request).includes('length'), false, request)
	}
	for (const request of [
		'make an ad',
		'make it short',
		'a short reel',
		'make it 30',
		'every second counts'
	]) {
		assert.equal(questionsToAsk(request).includes('length'), true, request)
	}
	// Shown after what it is and an ad's shape, before tone and call to action.
	assert.deepEqual(questionsToAsk('tidy it up', { kind: 'ad' }), [
		'kind',
		'adShape',
		'length',
		'tone',
		'callToAction'
	])
	// Clicked, it's the user's own words.
	assert.deepEqual(choiceWords({ ...decideAll(['length']), length: '30' }), ['At most 30 seconds.'])
})

const asked = (fields: Partial<MakeChoices> = {}): MakeChoices => ({
	...decideAll(['kind', 'adShape', 'length', 'tone', 'callToAction']),
	...fields
})
const ad = { maxSeconds: null, style: 'ad' as const, format: 'other' as const }

test('askedLength: a click, the default by type, and Gemini’s number only when the user asked', () => {
	// Clicked: the user's.
	assert.deepEqual(askedLength(ad, 'make an ad', asked({ length: '30' })), {
		seconds: 30,
		said: true
	})
	assert.deepEqual(askedLength(ad, 'make an ad', asked({ length: '15' })), {
		seconds: 15,
		said: true
	})
	// Left to "You decide": an ad's default, chosen for the user.
	assert.deepEqual(askedLength(ad, 'make an ad', asked()), { seconds: 30, said: false })
	// A reel, TikTok or Short keeps its own rule; anything else, no length.
	const reel = { ...ad, style: 'reel' as const, format: 'instagram_reel' as const }
	assert.deepEqual(askedLength(reel, 'make a reel', asked()), { seconds: null, said: false })
	assert.deepEqual(askedLength(ad, 'a TikTok ad', asked()), { seconds: null, said: false })
	const pro = { ...ad, style: 'professional' as const }
	assert.deepEqual(askedLength(pro, 'tidy it up', asked()), { seconds: null, said: false })
	// Gemini's own number, nobody having asked: not a length.
	assert.deepEqual(askedLength({ ...ad, maxSeconds: 59 }, 'make an ad', asked()), {
		seconds: 30,
		said: false
	})
	assert.deepEqual(askedLength({ ...pro, maxSeconds: 59 }, 'tidy it up', null), {
		seconds: null,
		said: false
	})
	// The request states one: Gemini's reading of it, the user's.
	assert.deepEqual(askedLength({ ...ad, maxSeconds: 45 }, 'a 45 second ad', null), {
		seconds: 45,
		said: true
	})
})

test('a later follow-up wins: 45 s after clicking 30, and "make it shorter" with no number is the user’s ask', () => {
	// Clicked 30, then "make it 45 seconds" in the chat: Gemini's 45 for it.
	assert.deepEqual(
		askedLength({ ...ad, maxSeconds: 45 }, 'make an ad', asked({ length: '30' }), [
			'make it 45 seconds'
		]),
		{ seconds: 45, said: true }
	)
	// "Make it shorter": no number, but asked; Gemini's shorter length counts, as the user's.
	assert.deepEqual(
		askedLength({ ...ad, maxSeconds: 20 }, 'make an ad', asked(), ['make it shorter']),
		{ seconds: 20, said: true }
	)
	assert.deepEqual(askedLength({ ...ad, maxSeconds: 50 }, 'make an ad', null, ['a bit longer']), {
		seconds: 50,
		said: true
	})
	// A follow-up about something else leaves the click as it was.
	assert.deepEqual(
		askedLength({ ...ad, maxSeconds: 59 }, 'make an ad', asked({ length: '30' }), [
			'make it square'
		]),
		{ seconds: 30, said: true }
	)
	// Through the whole plan: 45 is the most, the user's.
	const made = planMake({
		reply: { ...REPLY, style: 'ad', maxSeconds: 45 },
		request: 'make an ad',
		durationSeconds: 71,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		choices: asked({ length: '30' }),
		followUps: ['make it 45 seconds']
	})
	assert.equal(made.summary.maxSeconds, 45)
	assert.ok(made.summary.editedSeconds <= 45 && made.summary.editedSeconds > 30)
	assert.equal(made.summary.brief.said.lengthSeconds, true)
})

test('the plan follows the length clicked: at most 30 s, a reel capped at 59, a shorter recording never padded', () => {
	const ad30 = plan({ ...REPLY, style: 'ad' }, 'make an ad', asked({ length: '30' }))
	assert.equal(ad30.summary.maxSeconds, 30)
	assert.equal(ad30.summary.limitSeconds, 30)
	assert.ok(ad30.summary.editedSeconds <= 30, `${ad30.summary.editedSeconds}`)
	assert.ok(ad30.summary.editedSeconds >= 30 * 0.85, `${ad30.summary.editedSeconds}`)
	assert.equal(ad30.summary.brief.said.lengthSeconds, true)
	// Skip all on an ad: 30 s, chosen for the user.
	const skipped = plan({ ...REPLY, style: 'ad' }, 'make an ad', asked())
	assert.deepEqual(
		[skipped.summary.maxSeconds, skipped.summary.brief.said.lengthSeconds],
		[30, false]
	)
	// A reel clicked at 60: at most 59, its rule, while the user's 60 is kept to say so.
	const reel60 = plan(REPLY, 'tidy it up', asked({ kind: 'instagram_reel', length: '60' }))
	assert.deepEqual([reel60.summary.maxSeconds, reel60.summary.limitSeconds], [60, 59])
	// A recording shorter than the choice: as it is, nothing added.
	const short = toTranscript([
		{ word: 'One.', start: 0.2, end: 2 },
		{ word: 'Two.', start: 2.4, end: 5 },
		{ word: 'Three.', start: 5.4, end: 8 }
	])
	const of = (picked: MakeChoices | null) =>
		planMake({
			reply: { ...REPLY, style: 'ad' },
			request: 'make an ad',
			durationSeconds: 9,
			picture: { width: 1920, height: 1080 },
			transcript: short,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			choices: picked
		}).summary
	const free = of(null)
	const thirty = of(asked({ length: '30' }))
	assert.ok(thirty.editedSeconds < 30)
	assert.equal(thirty.editedSeconds, free.editedSeconds)
	assert.equal(thirty.trimmedToFit, false)
	assert.equal(thirty.lengthened, false)
})

test('the owner’s fourth real reply: Gemini’s unasked 59 s no longer limits; left to You decide, an ad runs at most 30 s', () => {
	// Gemini's reply to "make an ad" on the 4:41 screen recording, with a
	// 59 s limit nobody asked for.
	const run4 = makeReplySchema.parse(
		JSON.parse(
			readFileSync(
				new URL('../../../../../e2e/fixtures/real-run4-reply.json', import.meta.url),
				'utf-8'
			)
		)
	)
	assert.equal(run4.maxSeconds, 59)
	const longTalk = toTranscript(
		Array.from({ length: 79 }, (_, i) => ({
			word: `Step${i + 1}.`,
			start: i * 3.5,
			end: i * 3.5 + 3
		}))
	)
	const make = (picked: MakeChoices | null) =>
		planMake({
			reply: run4,
			request: 'make an ad',
			durationSeconds: 281,
			picture: { width: 1920, height: 1080 },
			transcript: longTalk,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			choices: picked
		}).summary
	// No question shown, nothing asked: no length at all, 59 or otherwise.
	const none = make(null)
	assert.deepEqual([none.maxSeconds, none.limitSeconds], [null, null])
	// The question left to "You decide": an ad's 30 s, chosen for the user.
	const decided = make(asked({ adShape: 'vertical', callToAction: 'Follow for more' }))
	assert.deepEqual([decided.maxSeconds, decided.limitSeconds], [30, 30])
	assert.equal(decided.brief.said.lengthSeconds, false)
	assert.ok(decided.editedSeconds <= 30)
	// Clicked 15: at most 15, the user's.
	const fifteen = make(asked({ adShape: 'vertical', length: '15' }))
	assert.ok(fifteen.editedSeconds <= 15)
	assert.equal(fifteen.brief.said.lengthSeconds, true)
	// Everything else as before: designed, vertical, a promo.
	assert.deepEqual(decided.screen, { treatment: 'designed', why: 'promo' })
	assert.equal(decided.shape.target, 'vertical')
})
