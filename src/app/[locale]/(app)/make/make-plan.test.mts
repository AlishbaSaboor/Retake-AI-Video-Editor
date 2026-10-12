import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/audio/transcript'
import { cardRect, wordPop } from '../../editor/overlays/design'
import { exportSize, type Size } from '../../editor/model/transform'
import {
	faceFollow,
	frameTimes,
	inventedNames,
	isShortForm,
	keptRanges,
	MAX_FRAMES,
	makeReplySchema,
	planMake,
	quotedLine,
	applyCheck,
	askedTreatment,
	followUpPlan,
	isPlanEdit,
	MAKE_REPLY_JSON_SCHEMA,
	planChanges,
	checkFound,
	clipText,
	summaryWithLength,
	chooseSentences,
	describePlan,
	SHORT_FORM_MAX_SECONDS,
	SHORT_FORM_TARGET_SECONDS,
	type MakeReply
} from './make-plan'
import { presetLook } from './make-presets'

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
	moments: [
		{ first: 1, last: 2 },
		{ first: 4, last: 4 }
	],
	removeSentences: [3],
	removeSpans: [],
	captions: 'bold_words',
	zoomSentences: [4, 99, 1],
	transition: 'dissolve',
	keyLines: [{ sentence: 4, text: 'Key point' }],
	shape: 'vertical',
	fit: 'fill',
	fitAsked: false,
	treatment: null,
	maxSeconds: null,
	brief: { audience: null, tone: null, length: null, show: null, callToAction: null },
	// A face in the middle until 7 s, then right of centre from 9 s; frame 99 doesn't exist.
	faces: [
		...[1, 2, 3, 4].map((frame) => ({ frame, x: 500, y: 300 })),
		...[5, 6, 7, 8, 9, 10].map((frame) => ({ frame, x: 800, y: 400 })),
		{ frame: 99, x: 100, y: 100 }
	],
	card: 'corner',
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
	// A slide at both joins (a reel's look, Bold): each follows a long stretch taken out.
	assert.deepEqual(
		edit.clips?.map((clip) => clip.transition),
		[
			undefined,
			{ kind: 'slide', seconds: 0.4, after: 'make-1' },
			{ kind: 'slide', seconds: 0.4, after: 'make-2' }
		]
	)
	assert.equal(edit.captionsOn, true)
	assert.equal(edit.captionMode, 'words')
	assert.equal(edit.captionStyle.size, 1.8)
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
	// The key line quotes sentence 4, over it, near the top, coming in word by word.
	assert.equal(edit.autoTitles.length, 1)
	assert.equal(edit.autoTitles[0]?.text, 'Key point')
	near(edit.autoTitles[0]?.startSeconds ?? 0, 2.15)
	assert.deepEqual(edit.autoTitles[0]?.at, { x: 0.5, y: 0.18 })
	assert.equal(edit.autoTitles[0]?.animation?.in.kind, 'slide')
	assert.deepEqual(
		{ ...summary, editedSeconds: 0 },
		{
			style: 'reel',
			making: 'instagram_reel',
			summary: 'A short talk; tightened into a reel.',
			limitSeconds: SHORT_FORM_MAX_SECONDS,
			trimmedToFit: false,
			maxSeconds: null,
			lengthened: false,
			// A 20 s video: under 50 s, but there is no more to it.
			short: null,
			keptSentences: 4,
			totalSentences: 5,
			originalSeconds: DURATION,
			editedSeconds: 0,
			removedParts: 4,
			fillerCuts: 1,
			captions: 'bold_words',
			keyLines: 1,
			opensWith: null,
			zooms: 1,
			transition: 'slide',
			transitions: 2,
			music: 'upbeat.mp3',
			musicMissing: false,
			shape: { target: 'vertical', fit: 'fill', how: 'face', asked: false },
			screen: null,
			brief: {
				audience: null,
				tone: null,
				show: null,
				lengthSeconds: null,
				callToAction: null,
				said: {
					audience: false,
					tone: false,
					show: false,
					lengthSeconds: false,
					callToAction: false
				},
				chosenFor: 'you'
			},
			card: null,
			title: null,
			titleDropped: true,
			pictureMatters: false,
			cannotDo: [],
			look: { preset: 'bold', said: false }
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
	assert.equal(summary.shape.how, 'whole')
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
	assert.equal(summary.shape.how, 'matches')
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

test('a reel fills 50 to 59 seconds with whole moments, opening with the strongest', () => {
	// 40 sentences: 140 s, and the reply cut only one of them.
	const talk = longTalk(40)
	const moments = [
		{ first: 30, last: 31 },
		{ first: 2, last: 4 },
		{ first: 17, last: 19 },
		{ first: 9, last: 9 }
	]
	const { edit, summary } = planMake({
		reply: {
			...REPLY,
			removeSentences: [40],
			moments,
			transition: 'none',
			zoomSentences: [],
			keyLines: []
		},
		request: 'make this an Instagram reel',
		durationSeconds: 140,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.ok(summary.editedSeconds <= SHORT_FORM_MAX_SECONDS, `${summary.editedSeconds} s`)
	assert.ok(summary.editedSeconds >= SHORT_FORM_TARGET_SECONDS, `${summary.editedSeconds} s`)
	assert.equal(summary.trimmedToFit, true)
	assert.equal(summary.limitSeconds, SHORT_FORM_MAX_SECONDS)
	assert.ok(summary.keptSentences < 40)
	// Every moment is in it, every sentence of it whole.
	const kept = edit.clips?.flatMap((clip) => clip.ranges) ?? []
	for (const number of moments.flatMap(({ first, last }) =>
		Array.from({ length: last - first + 1 }, (_, i) => first + i)
	)) {
		const sentence = talk.segments[number - 1]
		assert.ok(
			sentence &&
				kept.some(
					(range) =>
						range.startSeconds <= sentence.startSeconds && range.endSeconds >= sentence.endSeconds
				),
			`sentence ${number} kept`
		)
	}
	// The strongest moment (sentences 30 and 31) opens, ahead of the rest in order.
	const opening = talk.segments[29]
	assert.ok(opening && kept[0] && kept[0].startSeconds <= opening.startSeconds)
	assert.ok(kept[0] && kept[0].endSeconds >= (talk.segments[30]?.endSeconds ?? 0))
	assert.equal(summary.opensWith, 'Step30.')
	assert.ok(
		kept.slice(1).every((range, i) => i === 0 || range.startSeconds > (kept[i]?.startSeconds ?? 0))
	)
	// The sentence the reply cut stays cut.
	const last = talk.segments[39]
	assert.ok(last && !kept.some((range) => range.endSeconds > last.startSeconds))
})

test('one long stretch over a minute keeps only its first 59 seconds; other edits have no limit', () => {
	const speech = toTranscript([{ word: 'Long.', start: 0, end: 100 }])
	const reel = planMake({
		reply: { ...REPLY, moments: [], zoomSentences: [], keyLines: [] },
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
		reply: {
			...REPLY,
			format: 'other',
			style: 'professional',
			moments: [],
			keyLines: [],
			shape: 'original'
		},
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

test('a screen demo whose picture matters keeps the whole picture, with black bars, faces or not', () => {
	const picture = { width: 1920, height: 1080 }
	const { edit, summary } = planMake({
		reply: { ...REPLY, subject: 'screen', pictureMatters: true },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture,
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(summary.shape.how, 'whole')
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

test('moments are taken whole or not at all, never dead sentences, and stop once long enough', () => {
	// 10 sentences of 5 s: 3–5 fits, 4–6 then overlaps it, 9 is dead.
	const lengthOf = (chosen: ReadonlySet<number>) => chosen.size * 5
	const chosen = chooseSentences(
		[
			{ first: 3, last: 5 },
			{ first: 4, last: 6 },
			{ first: 8, last: 10 },
			{ first: 1, last: 1 }
		],
		10,
		new Set([8]),
		(trial) => ({ fits: lengthOf(trial) <= 30, enough: lengthOf(trial) >= 25 })
	)
	// 3–5 (15 s), then 8 and 10 (9 is dead: 25 s), enough.
	assert.deepEqual(
		[...chosen].sort((a, b) => a - b),
		[2, 3, 4, 7, 9]
	)
})

test('a key line must quote its sentence, briefly', () => {
	assert.equal(quotedLine('Key point', 'Key point here.'), 'Key point')
	assert.equal(quotedLine('key POINT!', 'Key point here.'), 'key POINT!')
	assert.equal(quotedLine('Key idea', 'Key point here.'), null)
	assert.equal(
		quotedLine(
			'one two three four five six seven eight nine',
			'one two three four five six seven eight nine'
		),
		null
	)
	assert.equal(quotedLine('', 'Key point here.'), null)
})

test('transitions go only at the few joins where the most was cut: slide overlaps, a zoom cut punches in', () => {
	// Five sentences, each a piece: gaps of 3, 5, 2 and 6 s between them.
	const talk = toTranscript([
		{ word: 'One.', start: 0, end: 2 },
		{ word: 'Two.', start: 5, end: 7 },
		{ word: 'Three.', start: 12, end: 14 },
		{ word: 'Four.', start: 16, end: 18 },
		{ word: 'Five.', start: 24, end: 26 }
	])
	const plan = (look: string) =>
		planMake({
			reply: {
				...REPLY,
				removeSentences: [],
				moments: [],
				zoomSentences: [],
				keyLines: [],
				shape: 'original',
				format: 'other',
				style: 'professional'
			},
			request: `make it professional, ${look}`,
			durationSeconds: 26,
			picture: { width: 1920, height: 1080 },
			transcript: talk,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	const slide = plan('bold')
	// Three of the four joins: not the 2 s one.
	assert.deepEqual(
		slide.edit.clips?.map((clip) => clip.transition?.kind ?? null),
		[null, 'slide', 'slide', null, 'slide']
	)
	assert.equal(slide.summary.transitions, 3)
	const plain = plan('cinematic')
	near(slide.summary.editedSeconds, plain.summary.editedSeconds - 3 * 0.4)
	const zoomCut = plan('playful')
	assert.ok(zoomCut.edit.clips?.every((clip) => !clip.transition))
	assert.equal(zoomCut.summary.transitions, 3)
	assert.equal(zoomCut.summary.zooms, 0)
	const punches = zoomCut.edit.autoZooms
	assert.equal(punches.length, 3)
	for (const zoom of punches) {
		assert.equal(zoom.direction, 'out')
		assert.equal(zoom.amount, 1.15)
		near(zoom.endSeconds - zoom.startSeconds, 0.4)
	}
	near(zoomCut.summary.editedSeconds, plain.summary.editedSeconds)
})

test('the crop follows a face only when one person is clearly the subject: in half the pictures', () => {
	const plan = (faces: MakeReply['faces']) =>
		planMake({
			reply: { ...REPLY, faces },
			request: 'make this an Instagram reel',
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		}).summary.shape.how
	assert.equal(
		plan([
			{ frame: 1, x: 500, y: 300 },
			{ frame: 2, x: 500, y: 300 }
		]),
		// Not following: the whole picture (only a meeting is designed around the speech).
		'whole'
	)
	assert.equal(plan([1, 2, 3, 4, 5].map((frame) => ({ frame, x: 500, y: 300 }))), 'face')
})

test('the second check reads the plan in play order, and its fixes apply only when it found a problem', () => {
	const { edit, summary } = planMake({
		reply: REPLY,
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	const text = describePlan(REPLY, summary, edit.clips ?? [], sentences)
	assert.match(text, /^Making: instagram_reel \(style reel\), \d+\.\d s long, must be under 60 s\./)
	assert.match(text, /\[1\] Hello\.\n\[2\] This is good\.\n\[4\] Key point here\.\n\[5\] Bye\./)
	assert.match(text, /Key lines: \[4\] "Key point"/)
	const fixes = {
		problems: [],
		title: 'Fixed title',
		keyLines: [],
		captions: 'highlight' as const,
		transition: 'slide' as const,
		dropSentences: [5],
		tooShort: false
	}
	assert.equal(applyCheck(REPLY, fixes), REPLY)
	const fixed = applyCheck(REPLY, {
		...fixes,
		problems: ['The title names someone never mentioned.']
	})
	assert.equal(fixed.title, 'Fixed title')
	assert.deepEqual(fixed.keyLines, [])
	assert.equal(fixed.captions, 'highlight')
	assert.equal(fixed.transition, 'slide')
	assert.deepEqual(fixed.removeSentences, [3, 5])
})

test('the strongest moment opens even from the middle of one long stretch, cut out at its pauses', () => {
	// Twenty 3 s sentences, half a second apart: one continuous piece.
	const talk = longTalk(20)
	const { edit, summary } = planMake({
		reply: {
			...REPLY,
			removeSentences: [],
			moments: [{ first: 12, last: 14 }],
			transition: 'none',
			zoomSentences: [],
			keyLines: []
		},
		request: 'make this an Instagram reel',
		durationSeconds: 70,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	const kept = edit.clips?.flatMap((clip) => clip.ranges) ?? []
	const first = talk.segments[11]
	const last = talk.segments[13]
	// The first piece is sentences 12 to 14, from the pause before to the pause after.
	assert.ok(first && last && kept[0])
	assert.ok(
		kept[0].startSeconds <= first.startSeconds && kept[0].startSeconds > first.startSeconds - 0.5
	)
	assert.ok(kept[0].endSeconds >= last.endSeconds && kept[0].endSeconds < last.endSeconds + 0.5)
	assert.equal(summary.opensWith, 'Step12.')
	assert.ok(summary.editedSeconds >= SHORT_FORM_TARGET_SECONDS && summary.editedSeconds <= 59)
})

test('a reel of a meeting or a still screen is designed around the speech: the picture a card, or hidden', () => {
	const plan = (fields: Partial<MakeReply>, request = 'make this an Instagram reel') =>
		planMake({
			reply: { ...REPLY, subject: 'meeting', faces: [], ...fields },
			request,
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	const designed = plan({})
	assert.equal(designed.summary.shape.how, 'designed')
	assert.equal(designed.summary.card, 'corner')
	assert.deepEqual(designed.edit.design, {
		palette: 'reel',
		picture: 'corner',
		look: presetLook('bold', null).design
	})
	// The frame is 9:16 (recorded at 1080 × 1920), the whole picture kept for the card.
	assert.equal(designed.edit.transform.crop?.fit, true)
	assert.deepEqual(exportSize({ width: 1920, height: 1080 }, designed.edit.transform), {
		width: 1080,
		height: 1920
	})
	// No push-ins on a picture that isn't what's being said; the captions and cuts as ever.
	assert.equal(designed.edit.autoZooms.length, 0)
	assert.equal(designed.edit.captionsOn, true)
	assert.deepEqual(
		designed.edit.clips?.map((clip) => ranges(clip.ranges)),
		[[[0.25, 2.65]], [[8.75, 11.25]], [[13.75, 15.25]]]
	)
	// Hidden when the picture shows nothing to keep; the ad's colours for an ad.
	assert.deepEqual(plan({ card: 'hidden' }).edit.design, {
		palette: 'reel',
		picture: 'hidden',
		look: presetLook('bold', null).design
	})
	assert.deepEqual(plan({ style: 'ad', format: 'other' }, 'make this an ad').edit.design, {
		palette: 'ad',
		picture: 'corner',
		look: presetLook('bold', null).design
	})
	// Not for a picture that matters, nor a professional edit, nor a video with nothing said.
	assert.equal(plan({ pictureMatters: true }).edit.design, null)
	assert.equal(
		plan({ style: 'professional', format: 'other' }, 'make it professional').edit.design,
		null
	)
	const silent = planMake({
		reply: { ...REPLY, subject: 'meeting', faces: [] },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript: null,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(silent.edit.design, null)
})

test("a designed frame's card sits low on the left in the picture's own shape, and words pop as they're said", () => {
	const card = cardRect({ width: 1080, height: 1920 }, { width: 1920, height: 1080 })
	near(card.x, 0.06)
	near(card.width, 0.44)
	// 0.44 of 1080 wide, 16:9: 267.3 px high of 1920.
	near(card.height * 1920, 0.44 * 1080 * (9 / 16))
	near(card.y + card.height, 0.92)
	// A word grows to 1.3× within 0.05 s of being said, then settles; never a jump.
	assert.equal(wordPop(2, 1.9), 1)
	assert.equal(wordPop(2, 2), 1)
	near(wordPop(2, 2.05), 1.3)
	assert.ok(wordPop(2, 2.1) < 1.3 && wordPop(2, 2.1) > 1)
	assert.equal(wordPop(2, 2.5), 1)
	for (let t = 1.9; t < 2.5; t += 0.001) {
		assert.ok(Math.abs(wordPop(2, t + 0.001) - wordPop(2, t)) < 0.01, `a jump at ${t}`)
	}
})

test('notes are cut at a word, never inside one; the summary has room for two sentences', () => {
	const text = 'Shortened the walkthrough, keeping the strongest intro and the key demos, and long'
	const clipped = clipText(text, 60)
	assert.ok(clipped.length <= 60, clipped)
	assert.equal(clipped, 'Shortened the walkthrough, keeping the strongest intro and…')
	// Short enough: as it was, trimmed.
	assert.equal(clipText('  Kept the intro.  ', 60), 'Kept the intro.')
	// One word longer than the limit is the only thing cut through.
	assert.equal(clipText('x'.repeat(30), 10), `${'x'.repeat(9)}…`)
	// The real run's summary (over 200 characters) is kept whole now.
	const real =
		'Shortened the 180s walkthrough to 55 seconds, keeping the strongest intro on the clone, ' +
		'the key feature demos and the file processing highlights, while cutting out filler words, ' +
		'dead navigation and long pauses.'
	assert.ok(real.length > 200)
	const parse = (summary: string) => makeReplySchema.parse({ ...REPLY, summary }).summary
	assert.equal(parse(real), real)
	// Longer than 400: it ends on a whole word.
	const twice = `${real} ${real}`
	const long = parse(twice)
	assert.ok(long.length <= 400 && long.endsWith('…'), long)
	assert.equal(twice[long.length - 1], ' ', 'cut where a word ends')
	assert.ok(twice.startsWith(long.slice(0, -1)))
	// Other notes still stop at 200, on a word.
	const question = makeReplySchema.parse({ ...REPLY, questions: [real] }).questions[0] ?? ''
	assert.ok(question.length <= 200 && question.endsWith('…'), question)
	assert.ok(real.startsWith(question.slice(0, -1)))
	assert.equal(real[question.length - 1], ' ', 'cut where a word ends')
})

test("the summary's length for the result is the edit's own; the original's and the parts' stay", () => {
	assert.equal(
		summaryWithLength('Shortened the 180s walkthrough to 55 seconds, keeping the intro.', 50.2),
		'Shortened the 180s walkthrough to 50 seconds, keeping the intro.'
	)
	assert.equal(
		summaryWithLength('A 55-second reel of the demos; 10 seconds of silence cut.', 49.6),
		'A 50-second reel of the demos; 10 seconds of silence cut.'
	)
	assert.equal(summaryWithLength('Cut from 3:00 to 0:55.', 50), 'Cut from 3:00 to 0:50.')
	assert.equal(summaryWithLength('Now about 1 minute long.', 50), 'Now about 0:50 long.')
	assert.equal(summaryWithLength('Cut down to 1.5 min.', 125), 'Cut down to 2:05.')
	// Already right (within a second), or not a length of the result: untouched.
	assert.equal(summaryWithLength('Tightened to 50 s.', 50.4), 'Tightened to 50 s.')
	assert.equal(
		summaryWithLength('Kept the best 30 seconds; removed 12 s of pauses.', 50),
		'Kept the best 30 seconds; removed 12 s of pauses.'
	)

	// planMake shows the edit's real length, whatever the reply guessed.
	const { summary } = planMake({
		reply: { ...REPLY, summary: 'Shortened the 20s take to 55 seconds, dropping the false start.' },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(
		summary.summary,
		`Shortened the 20s take to ${Math.round(summary.editedSeconds)} seconds, dropping the false start.`
	)
})

test("a reel the check finds too short takes back sentences the plan left out, never the check's drops", () => {
	// 40 sentences, 140 s; the reply keeps only the first 12 (about 42 s).
	const talk = longTalk(40)
	const reply: MakeReply = {
		...REPLY,
		summary: 'Kept the first steps, as a 42 second reel.',
		moments: [
			{ first: 1, last: 2 },
			{ first: 20, last: 21 }
		],
		removeSentences: Array.from({ length: 28 }, (_, i) => i + 13),
		transition: 'none',
		zoomSentences: [],
		keyLines: []
	}
	const make = (tooShort: { keepOut: number[] } | null, fields: Partial<MakeReply> = {}) =>
		planMake({
			reply: { ...reply, ...fields },
			request: fields.format === 'other' ? 'make it professional' : 'make this an Instagram reel',
			durationSeconds: 140,
			picture: { width: 1920, height: 1080 },
			transcript: talk,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			tooShort
		})
	const keeps = (plan: ReturnType<typeof make>, number: number) => {
		const sentence = talk.segments[number - 1]
		return (plan.edit.clips ?? []).some((clip) =>
			clip.ranges.some(
				(range) =>
					sentence !== undefined &&
					range.startSeconds <= sentence.startSeconds &&
					range.endSeconds >= sentence.endSeconds
			)
		)
	}

	// As planned: short, and said so, not lengthened.
	const asPlanned = make(null)
	assert.ok(asPlanned.summary.editedSeconds < SHORT_FORM_TARGET_SECONDS)
	assert.equal(asPlanned.summary.lengthened, false)
	assert.equal(asPlanned.summary.short, 'short_form')
	assert.equal(
		asPlanned.summary.summary,
		`Kept the first steps, as a ${Math.round(asPlanned.summary.editedSeconds)} second reel.`
	)

	// The check said too short, and dropped 13 and 14: filled to 50–59 s,
	// the plan's next moment first, 13 and 14 still out.
	const longer = make({ keepOut: [13, 14] })
	const seconds = longer.summary.editedSeconds
	assert.ok(seconds >= SHORT_FORM_TARGET_SECONDS && seconds <= SHORT_FORM_MAX_SECONDS, `${seconds}`)
	assert.equal(longer.summary.lengthened, true)
	assert.equal(longer.summary.short, null)
	assert.ok(keeps(longer, 20) && keeps(longer, 21), 'the next moment is put back')
	assert.ok(!keeps(longer, 13) && !keeps(longer, 14), "the check's drops stay out")
	for (let number = 1; number <= 12; number++) assert.ok(keeps(longer, number), `${number} kept`)
	// Its summary says the new length.
	assert.equal(
		longer.summary.summary,
		`Kept the first steps, as a ${Math.round(seconds)} second reel.`
	)

	// Nothing left to put back: as it was, and said so.
	const nothing = make({ keepOut: Array.from({ length: 28 }, (_, i) => i + 13) })
	assert.equal(nothing.summary.lengthened, false)
	assert.equal(nothing.summary.short, 'short_form')
	near(nothing.summary.editedSeconds, asPlanned.summary.editedSeconds)

	// Not a reel: there's no length to fill to, so it's only said.
	const other = make({ keepOut: [] }, { format: 'other', style: 'professional' })
	assert.equal(other.summary.limitSeconds, null)
	assert.equal(other.summary.lengthened, false)
	assert.equal(other.summary.short, 'asked')
	assert.equal(make(null, { format: 'other', style: 'professional' }).summary.short, null)

	// A reel of a video under 50 s isn't short: there's nothing more.
	const brief = planMake({
		reply: REPLY,
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		tooShort: { keepOut: [] }
	})
	assert.equal(brief.summary.short, null)
})

test('the check makes the plan again for a problem or for too short, not otherwise', () => {
	const none = {
		problems: [],
		title: null,
		keyLines: [],
		captions: 'classic' as const,
		transition: 'none' as const,
		dropSentences: [],
		tooShort: false
	}
	assert.equal(checkFound(none), false)
	assert.equal(checkFound({ ...none, tooShort: true }), true)
	assert.equal(checkFound({ ...none, problems: ['A key line misquotes.'] }), true)
	// Too short alone keeps the reply as it was: the lengthening is planMake's.
	assert.equal(applyCheck(REPLY, { ...none, tooShort: true }), REPLY)
})

test('a follow-up asking for a length cuts the plan to it, fills most of it, and is never called short', () => {
	// 40 sentences, 140 s: a reel of 50 to 59 s, then "make it 30 seconds".
	const talk = longTalk(40)
	const reply: MakeReply = {
		...REPLY,
		removeSentences: [],
		moments: [{ first: 5, last: 6 }],
		transition: 'none',
		zoomSentences: [],
		keyLines: []
	}
	// The follow-up's own words ask the length (Gemini's number only counts then).
	const make = (maxSeconds: number | null, request = 'make this an Instagram reel') =>
		planMake({
			reply: { ...reply, maxSeconds },
			request,
			durationSeconds: 140,
			picture: { width: 1920, height: 1080 },
			transcript: talk,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			followUps: maxSeconds === null ? [] : [`make it ${maxSeconds} seconds`]
		})
	const reel = make(null)
	assert.ok(reel.summary.editedSeconds >= SHORT_FORM_TARGET_SECONDS)
	assert.equal(reel.summary.maxSeconds, null)

	const asked = make(30)
	assert.ok(asked.summary.editedSeconds <= 30, `${asked.summary.editedSeconds}`)
	assert.ok(asked.summary.editedSeconds >= 30 * 0.85, `${asked.summary.editedSeconds}`)
	assert.equal(asked.summary.maxSeconds, 30)
	assert.equal(asked.summary.limitSeconds, 30)
	assert.equal(asked.summary.trimmedToFit, true)
	// Asked for: never "shorter than a reel usually runs".
	assert.equal(asked.summary.short, null)
	// The reply as used names the sentences cut to fit, so planning it again changes nothing.
	assert.ok(asked.used.removeSentences.length > 0)
	const again = planMake({
		reply: asked.used,
		request: 'make this an Instagram reel',
		durationSeconds: 140,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		followUps: ['make it 30 seconds']
	})
	near(again.summary.editedSeconds, asked.summary.editedSeconds)

	// Any edit, not only short-form: a professional one asked for 40 s.
	const pro = planMake({
		reply: { ...reply, format: 'other', style: 'professional', maxSeconds: 40 },
		request: 'make it professional',
		durationSeconds: 140,
		picture: { width: 1920, height: 1080 },
		transcript: talk,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		followUps: ['make it 40 seconds']
	})
	assert.ok(pro.summary.editedSeconds <= 40 && pro.summary.editedSeconds >= 34)
	// A length over a minute doesn't lift a reel's limit.
	assert.equal(make(90).summary.limitSeconds, SHORT_FORM_MAX_SECONDS)
})

test('what changed between two plans is listed in the plan card order, and nothing when nothing did', () => {
	const make = (fields: Partial<MakeReply>, followUps: string[] = []) =>
		planMake({
			reply: { ...REPLY, ...fields },
			request: 'make this an Instagram reel',
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			followUps
		}).summary
	const before = make({})
	assert.deepEqual(planChanges(before, make({})), [])
	// Sentence 4 out (so the transitions at the joins change too), a
	// cinematic look (its captions), no key lines (so no zooms), a different title.
	const after = make(
		{
			removeSentences: [3, 4],
			zoomSentences: [],
			keyLines: [],
			title: 'Hello this is good'
		},
		['make it cinematic']
	)
	const changes = planChanges(before, after)
	assert.deepEqual(
		changes.map((change) => change.kind),
		['look', 'length', 'sentences', 'captions', 'title', 'keyLines', 'zooms', 'transitions']
	)
	// The look first, as the plan card shows it.
	assert.deepEqual(changes[0], { kind: 'look', from: 'bold', to: 'cinematic' })
	assert.deepEqual(changes[1], {
		kind: 'length',
		from: Math.round(before.editedSeconds),
		to: Math.round(after.editedSeconds)
	})
	assert.deepEqual(changes[2], { kind: 'sentences', from: 4, to: 3 })
	assert.deepEqual(changes[3], { kind: 'captions', from: 'bold_words', to: 'classic' })
	// The first plan's title named someone never said ("Sarah"): it had none.
	assert.deepEqual(changes[4], { kind: 'title', from: null, to: 'Hello this is good' })
	// Lengths compare as the plan shows them: in whole seconds.
	assert.deepEqual(
		planChanges(before, { ...before, editedSeconds: before.editedSeconds + 0.2 }).filter(
			(change) => change.kind === 'length'
		),
		Math.round(before.editedSeconds + 0.2) === Math.round(before.editedSeconds)
			? []
			: [
					{
						kind: 'length',
						from: Math.round(before.editedSeconds),
						to: Math.round(before.editedSeconds + 0.2)
					}
				]
	)
	assert.deepEqual(
		planChanges(before, {
			...before,
			shape: { target: 'square', fit: 'bars', how: 'whole', asked: true },
			music: 'calm.mp3'
		}),
		[
			{ kind: 'shape', from: 'vertical', to: 'square' },
			{ kind: 'fit', from: 'fill', to: 'bars' },
			{ kind: 'music', from: null, to: 'calm.mp3' }
		]
	)
})

test("a follow-up's answer keeps what only the pictures told, and its shape is checked", () => {
	const answer = {
		...REPLY,
		captions: 'large' as const,
		subject: 'screen' as const,
		faces: [],
		pictureMatters: true,
		maxSeconds: 30
	}
	const used = followUpPlan(REPLY, answer)
	assert.equal(used.captions, 'large')
	// The pictures weren't sent again: what they showed stays as the first plan saw it.
	assert.equal(used.subject, REPLY.subject)
	assert.equal(used.faces, REPLY.faces)
	assert.equal(used.pictureMatters, REPLY.pictureMatters)
	// What it changed stays: the length asked for with it.
	assert.equal(used.maxSeconds, 30)
	assert.deepEqual(Object.keys(used).sort(), Object.keys(REPLY).sort())
	assert.equal(makeReplySchema.safeParse(answer).success, true)
	assert.equal(makeReplySchema.safeParse({ ...answer, maxSeconds: -5 }).success, false)
	const withoutLength: Partial<typeof answer> = { ...answer }
	delete withoutLength.maxSeconds
	assert.equal(makeReplySchema.safeParse(withoutLength).success, false)
	// Every field asked of Gemini is one the reply is checked for.
	assert.deepEqual(
		[...MAKE_REPLY_JSON_SCHEMA.required].sort(),
		Object.keys(makeReplySchema.shape).sort()
	)
})

test("the edit is known as a plan while it holds that plan's own values, not after a change by hand", () => {
	const made = planMake({
		reply: REPLY,
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(isPlanEdit(made.edit, { ...made.edit }), true)
	// Captions turned off by hand; a clip moved (a new list, the same clips).
	assert.equal(isPlanEdit(made.edit, { ...made.edit, captionsOn: false }), false)
	assert.equal(isPlanEdit(made.edit, { ...made.edit, clips: [...(made.edit.clips ?? [])] }), false)
	// The same plan made again is a different plan: equal values, not the same ones.
	const again = planMake({
		reply: REPLY,
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(isPlanEdit(made.edit, again.edit), false)
})

test('each shape and fit: the crop, and the size the export records, for a wide, a tall and a matching video', () => {
	const WIDE = { width: 1920, height: 1080 }
	const TALL = { width: 1080, height: 1920 }
	const make = (fields: Partial<MakeReply>, picture: Size, request = 'make an ad') =>
		planMake({
			// An ad of a product demo filmed (not a screen recording): no face to
			// follow, and its picture carries it.
			reply: {
				...REPLY,
				style: 'ad',
				format: 'other',
				subject: 'other',
				faces: [],
				pictureMatters: true,
				...fields
			},
			request,
			durationSeconds: DURATION,
			picture,
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	const recorded = (plan: ReturnType<typeof make>, picture: Size) =>
		exportSize(picture, plan.edit.transform)

	// Wide made vertical, bars: the whole picture, black above and below, recorded 1080 × 1920.
	const bars = make({ shape: 'vertical', fit: 'bars' }, WIDE)
	assert.deepEqual(bars.summary.shape, {
		target: 'vertical',
		fit: 'bars',
		how: 'whole',
		asked: false
	})
	assert.equal(bars.edit.transform.crop?.fit, true)
	assert.equal(bars.edit.transform.crop?.blur, undefined)
	assert.equal(bars.edit.transform.crop?.aspect, '9:16')
	assert.deepEqual(recorded(bars, WIDE), { width: 1080, height: 1920 })
	// The same over a blur.
	const blur = make({ shape: 'vertical', fit: 'blur' }, WIDE)
	assert.deepEqual(blur.summary.shape, {
		target: 'vertical',
		fit: 'blur',
		how: 'whole',
		asked: false
	})
	assert.equal(blur.edit.transform.crop?.blur, true)
	assert.deepEqual(recorded(blur, WIDE), { width: 1080, height: 1920 })
	// Fill unasked, in an ad: the whole picture all the same.
	const unasked = make({ shape: 'vertical', fit: 'fill' }, WIDE)
	assert.equal(unasked.summary.shape.how, 'whole')
	assert.equal(unasked.summary.shape.fit, 'bars')
	// Fill asked for: zoomed in, centred, the edges cut: 608 × 1080 of the picture.
	const fill = make(
		{ shape: 'vertical', fit: 'fill', fitAsked: true },
		WIDE,
		'make an ad, zoomed in'
	)
	assert.deepEqual(fill.summary.shape, {
		target: 'vertical',
		fit: 'fill',
		how: 'centred',
		asked: true
	})
	assert.equal(fill.edit.transform.crop?.fit, undefined)
	assert.deepEqual(recorded(fill, WIDE), { width: 608, height: 1080 })

	// Tall made horizontal: bars at the sides, recorded 1920 × 1080; filled, 1080 × 608.
	const wideBars = make({ shape: 'horizontal', fit: 'bars' }, TALL)
	assert.deepEqual(wideBars.summary.shape, {
		target: 'horizontal',
		fit: 'bars',
		how: 'whole',
		asked: false
	})
	assert.deepEqual(recorded(wideBars, TALL), { width: 1920, height: 1080 })
	assert.deepEqual(
		recorded(
			make(
				{ shape: 'horizontal', fit: 'fill', fitAsked: true },
				TALL,
				'a wide ad, cropped to fill the frame'
			),
			TALL
		),
		{
			width: 1080,
			height: 608
		}
	)
	// Square and portrait from wide, over a blur.
	assert.deepEqual(recorded(make({ shape: 'square', fit: 'blur' }, WIDE), WIDE), {
		width: 1920,
		height: 1920
	})
	assert.deepEqual(recorded(make({ shape: 'portrait', fit: 'bars' }, WIDE), WIDE), {
		width: 1536,
		height: 1920
	})

	// Already the shape: nothing cropped or barred, whatever the fit.
	for (const [shape, picture] of [
		['horizontal', WIDE],
		['vertical', TALL],
		['square', { width: 1080, height: 1080 }]
	] as const) {
		const same = make({ shape, fit: 'fill', fitAsked: true }, picture)
		assert.deepEqual(same.summary.shape, { target: shape, fit: null, how: 'matches', asked: false })
		assert.equal(same.edit.transform.crop, null)
		assert.deepEqual(recorded(same, picture), picture)
	}
	// Its own shape (an ad that names none): nothing changes.
	const own = make({ shape: 'original', fit: 'fill' }, TALL)
	assert.equal(own.summary.shape.how, 'kept')
	assert.equal(own.edit.transform.crop, null)
	// A reel is vertical, whatever the reply says.
	const reel = make({ shape: 'horizontal', fit: 'bars' }, WIDE, 'make this an Instagram reel')
	assert.equal(reel.summary.shape.target, 'vertical')
	assert.deepEqual(recorded(reel, WIDE), { width: 1080, height: 1920 })
})

test('a fill zooms in on its own only to follow one person in a reel; bars asked for are never designed', () => {
	const reel = (fields: Partial<MakeReply>, request = 'make this an Instagram reel') =>
		planMake({
			reply: { ...REPLY, ...fields },
			request,
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		}).summary.shape
	// One person, a face in most pictures: the crop follows it, and says why.
	assert.deepEqual(reel({}), { target: 'vertical', fit: 'fill', how: 'face', asked: false })
	// "Keep the black bars" on the same video: bars, as asked.
	assert.deepEqual(
		reel({ fit: 'bars', fitAsked: true }, 'make this an Instagram reel, keep the black bars'),
		{
			target: 'vertical',
			fit: 'bars',
			how: 'whole',
			asked: true
		}
	)
	// A vertical ad of the same person, its picture carrying it: the whole
	// picture, unless a zoom is asked for.
	const ad = { style: 'ad', format: 'other', pictureMatters: true } as const
	assert.equal(reel(ad, 'a vertical ad').how, 'whole')
	assert.equal(reel({ ...ad, fitAsked: true }, 'a vertical ad, zoomed in on me').how, 'face')
	// A meeting reel is designed around the speech, but not when bars or a blur were asked for.
	assert.equal(reel({ subject: 'meeting', faces: [], fit: 'bars' }).how, 'designed')
	assert.equal(
		reel(
			{ subject: 'meeting', faces: [], fit: 'blur', fitAsked: true },
			'make this an Instagram reel with a blurred background'
		).how,
		'whole'
	)
})

test("a brief's parts are kept in its own words, and its call to action closes the edit", () => {
	const make = (brief: Partial<MakeReply['brief']>, fields: Partial<MakeReply> = {}) =>
		planMake({
			reply: {
				...REPLY,
				keyLines: [{ sentence: 5, text: 'Bye' }],
				brief: { ...REPLY.brief, ...brief },
				...fields
			},
			request: 'An ad for small business owners, friendly, 15 seconds. End with: Try it free today',
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	const plan = make(
		{ audience: 'small business owners', tone: 'friendly', callToAction: 'Try it free today' },
		{ maxSeconds: 15 }
	)
	assert.deepEqual(plan.summary.brief, {
		audience: 'small business owners',
		tone: 'friendly',
		show: null,
		lengthSeconds: 15,
		callToAction: 'Try it free today',
		// Each in the request's own words; none given to show.
		said: { audience: true, tone: true, show: false, lengthSeconds: true, callToAction: true },
		chosenFor: 'promo'
	})
	// The call to action over the last 3 s; the key line it would have met left out.
	const end = plan.summary.editedSeconds
	const last = plan.edit.autoTitles.at(-1)
	assert.equal(last?.text, 'Try it free today')
	near(last?.startSeconds ?? 0, end - 3)
	near((last?.startSeconds ?? 0) + (last?.durationSeconds ?? 0), end)
	assert.equal(
		plan.edit.autoTitles.some((line) => line.text === 'Bye'),
		false
	)
	assert.equal(plan.summary.keyLines, 0)
	// Naming anyone never said nor asked for: left out, like a title.
	const named = make({ callToAction: 'Follow @retakehq' })
	assert.equal(named.summary.brief.callToAction, null)
	assert.equal(
		named.edit.autoTitles.some((line) => line.text.includes('@retakehq')),
		false
	)
	// None: the key line stays.
	assert.equal(
		make({}).edit.autoTitles.some((line) => line.text === 'Bye'),
		true
	)

	// The reply's parts are clipped on a word, and an empty one is none.
	const parsed = makeReplySchema.parse({
		...REPLY,
		brief: { ...REPLY.brief, audience: '  ', show: `the dashboard ${'demo '.repeat(40)}` }
	}).brief
	assert.equal(parsed.audience, null)
	assert.ok((parsed.show ?? '').length <= 120 && parsed.show?.endsWith('…'))
})

test('only a meeting is ever a card in a corner: any other label, or an unknown one, is as wide as the frame, centred', () => {
	// An unknown label is read as other, and doesn't stop the plan.
	const unknown = makeReplySchema.parse({ ...REPLY, subject: 'webcam_over_screen' }).subject
	assert.equal(unknown, 'other')
	const make = (
		subject: MakeReply['subject'],
		shape: MakeReply['shape'],
		request: string,
		fields: Partial<MakeReply> = {}
	) =>
		planMake({
			// Judged by its speech (the picture doesn't carry it): what used to be designed around a card.
			reply: {
				...REPLY,
				style: shape === 'vertical' ? 'reel' : 'ad',
				format: 'other',
				subject,
				pictureMatters: false,
				faces: [],
				fit: 'bars',
				shape,
				...fields
			},
			request,
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	for (const subject of ['screen', 'slides', 'other', unknown, 'one_person'] as const) {
		for (const [shape, request, ratio] of [
			['vertical', 'make this an Instagram reel', 9 / 16],
			['square', 'a square video', 1],
			['portrait', 'a 4:5 video', 4 / 5]
		] as const) {
			const { edit, summary } = make(subject, shape, request)
			const label = `${subject}, ${shape}`
			assert.equal(edit.design, null, label)
			assert.equal(summary.shape.how, 'whole', label)
			// The whole picture across the frame's width, the same space above as below it.
			const rect = edit.transform.crop?.rect
			assert.ok(rect && edit.transform.crop?.fit, label)
			assert.equal(rect.x, 0, label)
			assert.equal(rect.width, 1, label)
			near(rect.height, 16 / 9 / ratio)
			near(rect.y, -(rect.height - 1) / 2)
		}
		// 16:9 is already its shape.
		assert.equal(make(subject, 'horizontal', 'a horizontal video').summary.shape.how, 'matches')
	}
	// Over a blur, the same place.
	assert.equal(
		make('screen', 'vertical', 'make this an Instagram reel', { fit: 'blur' }).edit.transform.crop
			?.blur,
		true
	)
	// A meeting is designed around the speech, unless the user asked for a fit.
	assert.equal(
		make('meeting', 'vertical', 'make this an Instagram reel').summary.shape.how,
		'designed'
	)
	assert.equal(
		make('meeting', 'vertical', 'a reel with black bars', { fitAsked: true }).summary.shape.how,
		'whole'
	)
})

test('a screen recording is the whole screen by default, designed with no picture for an ad, a promo or text only', () => {
	const make = (request: string, fields: Partial<MakeReply> = {}, unchecked = false) =>
		planMake({
			reply: {
				...REPLY,
				subject: 'screen',
				pictureMatters: false,
				faces: [],
				// Everything that would zoom into a part of it.
				fit: 'fill',
				fitAsked: true,
				zoomSentences: [1, 2, 4],
				transition: 'zoom_cut',
				...fields
			},
			request,
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			unchecked
		})
	/** The whole picture across a 9:16 frame's width, centred; no design, no zooms of any kind. */
	const whole = (plan: ReturnType<typeof make>, why: string) => {
		assert.deepEqual(plan.summary.screen, { treatment: 'whole', why }, why)
		assert.equal(plan.edit.design, null, why)
		assert.equal(plan.summary.shape.how, 'whole', why)
		const rect = plan.edit.transform.crop?.rect
		assert.ok(rect && plan.edit.transform.crop?.fit, why)
		assert.equal(rect.x, 0, why)
		assert.equal(rect.width, 1, why)
		near(rect.y, -(rect.height - 1) / 2)
		assert.deepEqual(plan.edit.autoZooms, [], why)
		assert.notEqual(plan.summary.transition, 'zoom_cut', why)
	}
	/** Designed around what's said: no picture at all, never the corner card. */
	const designed = (plan: ReturnType<typeof make>, why: string) => {
		assert.deepEqual(plan.summary.screen, { treatment: 'designed', why }, why)
		assert.deepEqual(
			plan.edit.design,
			{ palette: plan.used.style, picture: 'hidden', look: presetLook('bold', null).design },
			why
		)
		assert.equal(plan.summary.card, 'hidden', why)
		assert.equal(plan.summary.shape.how, 'designed', why)
		assert.deepEqual(plan.edit.autoZooms, [], why)
	}

	// The default: the whole screen, even asked to fill (never a cut-out of one part).
	whole(make('make this an Instagram reel'), 'default')
	// An ad, a promo, a teaser or a highlights reel: designed.
	for (const request of [
		'make an ad from this',
		'a promo reel for the launch',
		'cut a teaser',
		'a highlights reel of the demo'
	]) {
		designed(make(request), 'promo')
	}
	// "Text only" (the reply says so): designed; "show the screen" on a promo: whole.
	designed(make('make this an Instagram reel, text only', { treatment: 'designed' }), 'asked')
	whole(make('a promo reel, show the screen', { treatment: 'whole' }), 'asked')
	// The second check couldn't run: whole, even for a promo or text only.
	whole(make('a promo reel', {}, true), 'unchecked')
	whole(make('a reel', { treatment: 'designed' }, true), 'unchecked')
	// Designed in its own shape too: a horizontal ad keeps no picture, uncropped.
	const wideAd = make('make an ad from this', { shape: 'original', format: 'other', style: 'ad' })
	assert.deepEqual(wideAd.edit.design, {
		palette: 'ad',
		picture: 'hidden',
		look: presetLook('bold', null).design
	})
	assert.equal(wideAd.edit.transform.crop, null)

	// An unknown label is other: never designed, whatever the request.
	const unknown = makeReplySchema.parse({ ...REPLY, subject: 'screencast_with_webcam' })
	const fallback = planMake({
		reply: { ...unknown, pictureMatters: false, faces: [], fit: 'bars' },
		request: 'a promo reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false
	})
	assert.equal(fallback.summary.screen, null)
	assert.equal(fallback.edit.design, null)
	assert.equal(fallback.summary.shape.how, 'whole')

	// The meeting and person purposes are as they were.
	const meeting = make('make this an Instagram reel', {
		subject: 'meeting',
		fit: 'bars',
		fitAsked: false,
		transition: 'none'
	})
	assert.equal(meeting.summary.shape.how, 'designed')
	assert.equal(meeting.summary.card, 'corner')
	assert.equal(meeting.summary.screen, null)
	assert.equal(
		planMake({
			reply: REPLY,
			request: 'make this an Instagram reel',
			durationSeconds: DURATION,
			picture: { width: 1920, height: 1080 },
			transcript,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		}).summary.shape.how,
		'face'
	)
})

test("the owner's two real replies: Gemini's filled-in treatment never decides, the user's words do", () => {
	// Gemini's own replies from two real runs of a 4:41 screen recording, both
	// with treatment "whole" filled in though nobody asked for it.
	const real = (run: 1 | 2) =>
		makeReplySchema.parse(
			JSON.parse(
				readFileSync(
					new URL(`../../../../../e2e/fixtures/real-run${run}-reply.json`, import.meta.url),
					'utf-8'
				)
			)
		)
	const run1 = real(1)
	const run2 = real(2)
	assert.equal(run1.treatment, 'whole')
	assert.equal(run2.treatment, 'whole')
	// The recording's 79 sentences, 4:41 long, as the replies number them.
	const talk = longTalk(79)
	const make = (reply: MakeReply, request: string, followUps: string[] = []) =>
		planMake({
			reply,
			request,
			durationSeconds: 281,
			picture: { width: 1920, height: 1080 },
			transcript: talk,
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			followUps
		}).summary

	// Run 2, "make a promo ad": designed, because it's a promo, not "as you asked".
	const promo = make(run2, 'make a promo ad')
	assert.deepEqual(promo.screen, { treatment: 'designed', why: 'promo' })
	assert.equal(promo.card, 'hidden')
	assert.equal(promo.shape.how, 'designed')
	// Run 1, "shorten this walkthrough": the whole screen, the plain reason.
	const shorter = make(run1, 'shorten this walkthrough')
	assert.deepEqual(shorter.screen, { treatment: 'whole', why: 'default' })
	assert.equal(shorter.shape.asked, false)

	// The user's own words still win: "show the screen" on a promo, "text only" on a walkthrough.
	assert.deepEqual(make(run2, 'make a promo ad, show the screen').screen, {
		treatment: 'whole',
		why: 'asked'
	})
	assert.deepEqual(make(run1, 'shorten this walkthrough, text only').screen, {
		treatment: 'designed',
		why: 'asked'
	})
	// In a follow-up too, the latest ask winning.
	assert.deepEqual(make(run1, 'shorten this walkthrough', ['text only']).screen, {
		treatment: 'designed',
		why: 'asked'
	})
	assert.deepEqual(make(run2, 'make a promo ad', ['text only', 'show the screen']).screen, {
		treatment: 'whole',
		why: 'asked'
	})
	// Gemini saying "designed" without being asked counts for nothing.
	assert.deepEqual(make({ ...run1, treatment: 'designed' }, 'shorten this walkthrough').screen, {
		treatment: 'whole',
		why: 'default'
	})
	// A value not on the list is read as not asked.
	const odd = makeReplySchema.parse({ ...run1, treatment: 'sideways' })
	assert.equal(odd.treatment, null)
	assert.deepEqual(make(odd, 'make a promo ad').screen, { treatment: 'designed', why: 'promo' })

	// Close variants of each ask; both at once, or neither, is no ask.
	for (const text of [
		'text-only please',
		'just the text',
		'captions only',
		'no screen',
		'hide my screen'
	]) {
		assert.equal(askedTreatment([text]), 'designed', text)
	}
	for (const text of [
		'show the screen',
		'show my whole screen',
		'keep the screen',
		'full screen'
	]) {
		assert.equal(askedTreatment([text]), 'whole', text)
	}
	assert.equal(askedTreatment(['text only, but show the screen']), null)
	assert.equal(askedTreatment(['make a promo ad']), null)

	// A fit Gemini says was asked for is asked for only in the user's words.
	const filled = { ...run1, fit: 'blur' as const, fitAsked: true, shape: 'vertical' as const }
	assert.equal(make(filled, 'shorten this walkthrough').shape.asked, false)
	assert.equal(make(filled, 'shorten this walkthrough, blurred background').shape.asked, true)
})

test("the owner's third real reply: a brief part is the user's only in their own words", () => {
	// Gemini's reply to "make a promo ad" on the 4:41 screen recording, with
	// a tone ("energetic") filled in though nobody gave one.
	const run3 = makeReplySchema.parse(
		JSON.parse(
			readFileSync(
				new URL('../../../../../e2e/fixtures/real-run3-reply.json', import.meta.url),
				'utf-8'
			)
		)
	)
	assert.equal(run3.brief.tone, 'energetic')
	const brief = (request: string, followUps: string[] = [], reply: MakeReply = run3) =>
		planMake({
			reply,
			request,
			durationSeconds: 281,
			picture: { width: 1920, height: 1080 },
			transcript: longTalk(79),
			fillerCuts: [],
			music: null,
			musicAvailable: false,
			followUps
		}).summary.brief

	// "make a promo ad": the tone is kept, but chosen for a promo, not the user's.
	const promo = brief('make a promo ad')
	assert.equal(promo.tone, 'energetic')
	assert.equal(promo.said.tone, false)
	assert.equal(promo.chosenFor, 'promo')
	// "make it energetic": the user's own word.
	const energetic = brief('make it energetic')
	assert.equal(energetic.said.tone, true)
	assert.equal(energetic.chosenFor, 'you')
	// In a follow-up too, case and punctuation aside.
	assert.equal(brief('make a promo ad', ['More ENERGETIC!']).said.tone, true)
	// Every word of a part must be the user's: "energetic" alone doesn't give "upbeat, energetic".
	const both = { ...run3, brief: { ...run3.brief, tone: 'upbeat, energetic' } }
	assert.equal(brief('make it energetic', [], both).said.tone, false)
	assert.equal(brief('make it upbeat and energetic', [], both).said.tone, true)
	// Who it's for and what it shows, likewise; a length only when the user gives one.
	const full = {
		...run3,
		maxSeconds: 30,
		brief: { ...run3.brief, audience: 'small business owners', show: 'the dashboard' }
	}
	const filledIn = brief('make a promo ad', [], full)
	assert.deepEqual(
		[filledIn.said.audience, filledIn.said.show, filledIn.said.lengthSeconds],
		[false, false, false]
	)
	const given = brief('a 30 second ad for small business owners showing the dashboard', [], full)
	assert.deepEqual(
		[given.said.audience, given.said.show, given.said.lengthSeconds],
		[true, true, true]
	)
})

// The captions the user's own words asked about: Gemini's caption look is
// kept (its mode and size), in the preset's colours and font; otherwise the
// preset decides everything about them.
const captionPlan = (captions: MakeReply['captions'], followUps: string[] = []) =>
	planMake({
		reply: { ...REPLY, captions },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		followUps
	})

test('"make the captions bigger" keeps Gemini’s caption choice, in the look’s colours and font', () => {
	const { edit, summary } = captionPlan('large', ['make the captions bigger'])
	// Still Bold (a reel's look), but large captions in lines, as Gemini read the words.
	assert.deepEqual(summary.look, { preset: 'bold', said: false })
	assert.equal(summary.captions, 'large')
	assert.equal(edit.captionMode, 'lines')
	assert.deepEqual(edit.captionStyle, { ...presetLook('bold', null).captions.picture, size: 1.7 })
	// "subtitles" is a caption word too; "captioned" inside another word is not.
	assert.equal(captionPlan('large', ['bigger subtitles please']).edit.captionStyle.size, 1.7)
	assert.equal(captionPlan('large', ['uncaptioned is fine']).edit.captionMode, 'words')
})

test('a request with no caption words lets the look decide the captions', () => {
	const { edit, summary } = captionPlan('large', ['make it shorter'])
	// Gemini said large; Bold's own captions are one word at a time, at its size.
	assert.equal(summary.captions, 'bold_words')
	assert.equal(edit.captionMode, 'words')
	assert.deepEqual(edit.captionStyle, presetLook('bold', null).captions.picture)
	// Off is kept either way: a request for none is the user's.
	assert.equal(captionPlan('off').edit.captionsOn, false)
	assert.equal(captionPlan('off', ['bigger captions']).edit.captionsOn, false)
})

test('"more cinematic" then "bigger captions": the look switch and the caption ask both hold', () => {
	const { edit, summary } = captionPlan('large', ['more cinematic', 'bigger captions'])
	assert.deepEqual(summary.look, { preset: 'cinematic', said: true })
	assert.equal(summary.captions, 'large')
	assert.equal(edit.captionMode, 'lines')
	const cinematic = presetLook('cinematic', null)
	assert.deepEqual(edit.captionStyle, { ...cinematic.captions.picture, size: 1.7 })
	assert.equal(edit.captionStyle.font, 'serif')
	assert.deepEqual(edit.color, cinematic.grade)
	// The other order holds too: the caption ask stays after a later look switch.
	const later = captionPlan('large', ['bigger captions', 'more cinematic'])
	assert.deepEqual(later.edit.captionStyle, { ...cinematic.captions.picture, size: 1.7 })
})

const followedUp = (followUps: string[], fields: Partial<MakeReply> = {}) =>
	planMake({
		reply: { ...REPLY, ...fields },
		request: 'make this an Instagram reel',
		durationSeconds: DURATION,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		followUps
	}).summary

test('a follow-up that only switches the look lists the look alone, so it can be applied', () => {
	const before = followedUp([])
	// Bold to Cinematic with the captions asked to stay as they were: only the look changes.
	const changes = planChanges(before, {
		...followedUp(['more cinematic']),
		captions: before.captions,
		transitions: before.transitions,
		editedSeconds: before.editedSeconds
	})
	assert.deepEqual(changes, [{ kind: 'look', from: 'bold', to: 'cinematic' }])
	// Clean to Cinematic, end to end: both a line or two at a time, so only the look (and the
	// transitions' length it sets) changes, never nothing.
	const clean = followedUp(['make it clean'])
	const cinematic = followedUp(['make it clean', 'now more cinematic'])
	assert.equal(clean.captions, cinematic.captions)
	assert.deepEqual(planChanges(clean, cinematic)[0], {
		kind: 'look',
		from: 'clean',
		to: 'cinematic'
	})
})

test('a follow-up that changes nothing still lists nothing; one that changes the look and more lists both', () => {
	const before = followedUp([])
	// No look named, nothing else different: nothing would change.
	assert.deepEqual(planChanges(before, followedUp(['add stock footage of a city'])), [])
	// The look and the sentences: both, the look first.
	const both = planChanges(before, followedUp(['more cinematic'], { removeSentences: [3, 4] }))
	assert.deepEqual(both[0], { kind: 'look', from: 'bold', to: 'cinematic' })
	assert.ok(both.some((change) => change.kind === 'sentences'))
})
