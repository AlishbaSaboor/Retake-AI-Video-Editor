import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/transcript'
import { exportSize } from '../../editor/transform'
import {
	faceFollow,
	frameTimes,
	inventedNames,
	isShortForm,
	keptRanges,
	MAX_FRAMES,
	makeReplySchema,
	planMake,
	SHORT_FORM_MAX_SECONDS,
	type MakeReply
} from './make-plan'

// Five sentences over a 20 s take: a short pause between the first two, a
// false start (3), then long pauses before 4 and 5.
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
const sentences = transcript.segments
const DURATION = 20
const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const ranges = (list: Array<{ startSeconds: number; endSeconds: number }>) =>
	list.map((r) => [Number(r.startSeconds.toFixed(4)), Number(r.endSeconds.toFixed(4))])

const REPLY: MakeReply = {
	questions: [],
	style: 'reel',
	format: 'instagram_reel',
	subject: 'one_person',
	summary: 'A short talk; tightened into a reel.',
	pictureMatters: false,
	keyMoments: [4],
	removeSentences: [3],
	removeSpans: [],
	captions: 'words',
	zoomSentences: [4, 99, 1],
	transition: 'dissolve',
	vertical: true,
	// A face in the middle at 1 s, then right of centre from 9 s; frame 99 doesn't exist.
	faces: [
		{ frame: 1, x: 500, y: 300 },
		{ frame: 5, x: 800, y: 400 },
		{ frame: 99, x: 100, y: 100 }
	],
	music: 'upbeat.mp3',
	title: 'Meet Sarah now',
	cannotDo: []
}

test('pictures are taken every 2 s, from the middle of each stretch, at most 150', () => {
	assert.deepEqual(frameTimes(5), [1, 3, 4.95])
	assert.equal(frameTimes(400).length, MAX_FRAMES)
})

test('a talking video keeps its sentences with a little room, joined across short pauses only', () => {
	// Sentence 3 is dropped; 1 and 2 stay one piece; the long pause before 5 splits it off.
	assert.deepEqual(ranges(keptRanges(REPLY, sentences, DURATION)), [
		[0.25, 2.65],
		[8.75, 11.25],
		[13.75, 15.25]
	])
	// Removing every sentence removes none.
	assert.deepEqual(
		keptRanges({ ...REPLY, removeSentences: [1, 2, 3, 4, 5] }, sentences, DURATION),
		keptRanges({ ...REPLY, removeSentences: [] }, sentences, DURATION)
	)
})

test('when the picture matters, only named sentences and dead stretches go, never kept words', () => {
	const kept = keptRanges(
		{
			pictureMatters: true,
			removeSentences: [3],
			// The second runs into sentence 4's words (9–11 s): only its part after them goes.
			removeSpans: [
				{ startSeconds: 16, endSeconds: 19 },
				{ startSeconds: 13, endSeconds: 10 }
			]
		},
		sentences,
		DURATION
	)
	assert.deepEqual(ranges(kept), [
		[0, 4.75],
		[6.25, 11.25],
		[13, 16],
		[19, 20]
	])
})

test('the crop follows a face only once it drifts from the middle, and holds otherwise', () => {
	const times = frameTimes(DURATION)
	const width = 0.31640625
	const keys = faceFollow(REPLY.faces, times, width)
	assert.ok(keys)
	// A run at one place keeps only its ends, so the crop pans from 7 s to 9 s.
	assert.deepEqual(
		keys.map((k) => k.seconds),
		[1, 7, 9, 19]
	)
	near(keys[0]?.x ?? 0, 0.5 - width / 2)
	near(keys[1]?.x ?? 0, 0.5 - width / 2)
	near(keys[2]?.x ?? 0, 0.8 - width / 2)
	// A small drift (within a fifth of the crop's width) moves nothing.
	const still = faceFollow(
		[
			{ frame: 1, x: 500, y: 0 },
			{ frame: 2, x: 550, y: 0 }
		],
		times,
		width
	)
	assert.deepEqual(new Set(still?.map((k) => k.x)), new Set([0.5 - width / 2]))
	// Kept inside the frame at the edge; no face anywhere: nothing to follow.
	assert.equal(faceFollow([{ frame: 1, x: 990, y: 0 }], times, width)?.[0]?.x, 1 - width)
	assert.equal(faceFollow([], times, width), null)
	assert.equal(faceFollow([{ frame: 11, x: 500, y: 0 }], times, width), null)
})

test('on-screen text naming anyone or any handle never said or asked for is caught', () => {
	const known = 'hello this is sarah from the shop. Ask me anything'
	assert.deepEqual(inventedNames('Meet Sarah now', known), [])
	assert.deepEqual(inventedNames('Meet Jordan now', known), ['Jordan'])
	assert.deepEqual(inventedNames('Follow @shopdeals', known), ['@shopdeals'])
	// A capital at the start of a sentence is not a name.
	assert.deepEqual(inventedNames('Big news. Today only', known), [])
	assert.deepEqual(inventedNames('I love it', known), [])
})

test('a reply is planned into one edit: clips, transitions, word captions, zooms, crop, music', () => {
	const { edit, summary } = planMake({
		reply: REPLY,
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		// One filler inside a kept piece, one in the dropped sentence.
		fillerCuts: [
			{ startSeconds: 1.65, endSeconds: 1.75 },
			{ startSeconds: 5.5, endSeconds: 5.6 }
		],
		music: { name: 'upbeat.mp3', file: new Blob(), buffer: 'sound', seconds: 2 },
		musicAvailable: true
	})
	assert.deepEqual(
		edit.clips?.map((clip) => ranges(clip.ranges)),
		[[[0.25, 2.65]], [[8.75, 11.25]], [[13.75, 15.25]]]
	)
	assert.deepEqual(edit.cuts, [{ startSeconds: 1.65, endSeconds: 1.75 }])
	// A dissolve at both joins: each follows a long stretch taken out.
	assert.deepEqual(
		edit.clips?.map((clip) => clip.transition),
		[
			undefined,
			{ kind: 'dissolve', seconds: 0.4, after: 'make-1' },
			{ kind: 'dissolve', seconds: 0.4, after: 'make-2' }
		]
	)
	assert.equal(edit.captionsOn, true)
	assert.equal(edit.captionWords, true)
	assert.equal(edit.captionStyle.size, 1.5)
	// 2.3 s (less the filler) + 2.5 + 1.5, each dissolve overlapping 0.4 s.
	near(summary.editedSeconds, 5.5)
	// Sentence 4 (9–11 s of the take) plays from 2.15 s; too-short sentence 1 and 99 are skipped.
	assert.equal(edit.autoZooms.length, 1)
	near(edit.autoZooms[0]?.startSeconds ?? 0, 2.15)
	near(edit.autoZooms[0]?.endSeconds ?? 0, 4.14)
	assert.equal(edit.autoZooms[0]?.amount, 1.25)
	assert.deepEqual(edit.autoZooms[0]?.focus, { x: 0.5, y: 0.4 })
	// Vertical, following the face: starting where it is, then panning.
	assert.equal(edit.transform.crop?.aspect, '9:16')
	near(edit.transform.crop?.rect.x ?? 0, 0.5 - 0.31640625 / 2)
	assert.equal(edit.transform.crop?.follow?.length, 4)
	// A 2 s track three times over, the last cut to the end; each ducking under speech.
	assert.deepEqual(
		edit.audioItems.map((item) => [item.atSeconds, Number(item.seconds.toFixed(4)), item.duck]),
		[
			[0, 2, true],
			[2, 2, true],
			[4, 1.5, true]
		]
	)
	// "Sarah" was never said nor asked for: no title.
	assert.equal(edit.title, null)
	assert.deepEqual(
		{ ...summary, editedSeconds: 0 },
		{
			style: 'reel',
			making: 'instagram_reel',
			summary: 'A short talk; tightened into a reel.',
			limitSeconds: SHORT_FORM_MAX_SECONDS,
			trimmedToFit: false,
			keptSentences: 4,
			totalSentences: 5,
			originalSeconds: DURATION,
			editedSeconds: 0,
			removedParts: 4,
			fillerCuts: 1,
			captions: 'words',
			zooms: 1,
			transition: 'dissolve',
			transitions: 2,
			music: 'upbeat.mp3',
			musicMissing: false,
			vertical: 'face',
			title: null,
			titleDropped: true,
			pictureMatters: false,
			cannotDo: []
		}
	)
})

test('with no speech, no faces and no music: no captions, the whole picture fitted, and it says so', () => {
	const { edit, summary } = planMake({
		reply: { ...REPLY, faces: [], title: 'This is good', removeSentences: [] },
		request: 'make it a reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript: null,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.deepEqual(
		edit.clips?.map((clip) => ranges(clip.ranges)),
		[[[0, 20]]]
	)
	assert.equal(edit.captionsOn, false)
	assert.equal(summary.captions, 'off')
	assert.equal(summary.pictureMatters, true)
	assert.equal(summary.vertical, 'fit')
	assert.equal(edit.transform.crop?.follow, undefined)
	assert.equal(edit.transform.crop?.fit, true)
	assert.equal(summary.music, null)
	assert.equal(summary.musicMissing, true)
	assert.deepEqual(edit.audioItems, [])
	// Words from the request and nothing named: kept, popping in at the start.
	assert.equal(edit.title?.text, 'This is good')
	assert.equal(edit.title?.startSeconds, 0)
})

test('a video already vertical is not cropped again', () => {
	const { edit, summary } = planMake({
		reply: REPLY,
		request: 'reel',
		durationSeconds: DURATION,
		picture: { width: 1080, height: 1920 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: true
	})
	assert.equal(summary.vertical, 'already')
	assert.equal(edit.transform.crop, null)
	assert.equal(summary.musicMissing, false)
})

test("a reply that isn't the shape asked for fails to parse", () => {
	assert.equal(makeReplySchema.safeParse(REPLY).success, true)
	assert.equal(makeReplySchema.safeParse({ ...REPLY, style: 'epic' }).success, false)
	assert.equal(
		makeReplySchema.safeParse({ ...REPLY, questions: ['a', 'b', 'c', 'd'] }).success,
		false
	)
})

/** A talk of `count` sentences, each 3 s with half a second between: about 3.5 s a sentence. */
function longTalk(count: number) {
	return toTranscript(
		Array.from({ length: count }, (_, i) => ({
			word: `Step${i + 1}.`,
			start: i * 3.5,
			end: i * 3.5 + 3
		}))
	)
}

test('a reel, TikTok or Short comes out under a minute, keeping the key moments', () => {
	// 40 sentences: 140 s, and the reply cut only one of them.
	const talk = longTalk(40)
	const keyMoments = [30, 2, 17, 9, 25]
	const { edit, summary } = planMake({
		reply: { ...REPLY, removeSentences: [40], keyMoments, transition: 'none', zoomSentences: [] },
		request: 'make this an Instagram reel',
		durationSeconds: 140,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.ok(summary.editedSeconds <= SHORT_FORM_MAX_SECONDS, `${summary.editedSeconds} s`)
	// Not much under it either: only what had to go went.
	assert.ok(summary.editedSeconds > SHORT_FORM_MAX_SECONDS - 4, `${summary.editedSeconds} s`)
	assert.equal(summary.trimmedToFit, true)
	assert.equal(summary.limitSeconds, SHORT_FORM_MAX_SECONDS)
	assert.ok(summary.keptSentences < 40)
	// Every key moment is still in it, whole.
	const kept = edit.clips?.flatMap((clip) => clip.ranges) ?? []
	for (const number of keyMoments) {
		const sentence = talk.segments[number - 1]
		assert.ok(
			sentence &&
				kept.some(
					(range) =>
						range.startSeconds <= sentence.startSeconds && range.endSeconds >= sentence.endSeconds
				),
			`key moment ${number} kept`
		)
	}
	// The sentence the reply cut stays cut.
	const last = talk.segments[39]
	assert.ok(last && !kept.some((range) => range.endSeconds > last.startSeconds))
})

test('one long stretch over a minute keeps only its first 59 seconds; other edits have no limit', () => {
	const speech = toTranscript([{ word: 'Long.', start: 0, end: 100 }])
	const reel = planMake({
		reply: { ...REPLY, keyMoments: [], zoomSentences: [] },
		request: 'make it a TikTok',
		durationSeconds: 100,
		picture: { width: 1920, height: 1080 },
		transcript: speech,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.ok(reel.summary.editedSeconds <= SHORT_FORM_MAX_SECONDS)
	assert.ok(reel.summary.editedSeconds > SHORT_FORM_MAX_SECONDS - 1)
	const professional = planMake({
		reply: { ...REPLY, format: 'other', style: 'professional', keyMoments: [], vertical: false },
		request: 'make it professional',
		durationSeconds: 100,
		picture: { width: 1920, height: 1080 },
		transcript: speech,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(professional.summary.limitSeconds, null)
	assert.ok(professional.summary.editedSeconds > 99)
	assert.equal(professional.summary.making, 'professional')
	assert.equal(professional.edit.transform.crop, null)
})

test('short-form is known from the format or the request itself', () => {
	assert.equal(isShortForm('tiktok', 'make it fun'), true)
	assert.equal(isShortForm('other', 'make this an Instagram Reel'), true)
	assert.equal(isShortForm('other', 'turn it into YouTube Shorts'), true)
	assert.equal(isShortForm('other', 'make it a TikTok'), true)
	assert.equal(isShortForm('other', 'make it professional'), false)
	assert.equal(isShortForm('other', 'keep it short'), false)
})

test('a screen recording made vertical keeps the whole picture, with black bars, faces or not', () => {
	const picture = { width: 1920, height: 1080 }
	const { edit, summary } = planMake({
		reply: { ...REPLY, subject: 'screen', pictureMatters: false },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture,
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(summary.vertical, 'fit')
	const crop = edit.transform.crop
	assert.ok(crop)
	assert.equal(crop.fit, true)
	assert.equal(crop.follow, undefined)
	// All of the width; the height reaches past the picture equally above and below.
	assert.equal(crop.rect.x, 0)
	assert.equal(crop.rect.width, 1)
	near(crop.rect.height, 1920 / (9 / 16) / 1080)
	near(crop.rect.y, (1 - crop.rect.height) / 2)
	// Recorded at 1080 × 1920: never bigger than the picture's longest side.
	assert.deepEqual(exportSize(picture, edit.transform), {
		width: 1080,
		height: 1920
	})
})
