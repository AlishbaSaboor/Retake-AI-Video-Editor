import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/transcript'
import { cardRect, wordPop } from '../../editor/design'
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
	quotedLine,
	applyCheck,
	chooseSentences,
	describePlan,
	SHORT_FORM_MAX_SECONDS,
	SHORT_FORM_TARGET_SECONDS,
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
	vertical: true,
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
	assert.equal(edit.autoTitles[0]?.animation?.in.kind, 'words')
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
			captions: 'bold_words',
			keyLines: 1,
			opensWith: null,
			zooms: 1,
			transition: 'dissolve',
			transitions: 2,
			music: 'upbeat.mp3',
			musicMissing: false,
			vertical: 'face',
			card: null,
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
			vertical: false
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
	const plan = (transition: MakeReply['transition']) =>
		planMake({
			reply: {
				...REPLY,
				transition,
				removeSentences: [],
				moments: [],
				zoomSentences: [],
				keyLines: [],
				vertical: false,
				format: 'other',
				style: 'professional'
			},
			request: 'make it professional',
			durationSeconds: 26,
			picture: { width: 1920, height: 1080 },
			transcript: talk,
			fillerCuts: [],
			music: null,
			musicAvailable: false
		})
	const slide = plan('slide')
	// Three of the four joins: not the 2 s one.
	assert.deepEqual(
		slide.edit.clips?.map((clip) => clip.transition?.kind ?? null),
		[null, 'slide', 'slide', null, 'slide']
	)
	assert.equal(slide.summary.transitions, 3)
	const plain = plan('none')
	near(slide.summary.editedSeconds, plain.summary.editedSeconds - 3 * 0.4)
	const zoomCut = plan('zoom_cut')
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
		}).summary.vertical
	assert.equal(
		plan([
			{ frame: 1, x: 500, y: 300 },
			{ frame: 2, x: 500, y: 300 }
		]),
		// Not following: a reel of a video its picture doesn't carry is designed around the speech.
		'designed'
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
		dropSentences: [5]
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
	assert.equal(designed.summary.vertical, 'designed')
	assert.equal(designed.summary.card, 'corner')
	assert.deepEqual(designed.edit.design, { palette: 'reel', picture: 'corner' })
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
	assert.deepEqual(plan({ card: 'hidden' }).edit.design, { palette: 'reel', picture: 'hidden' })
	assert.deepEqual(plan({ style: 'ad', format: 'other' }, 'make this an ad').edit.design, {
		palette: 'ad',
		picture: 'corner'
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
	assert.equal(wordPop(2, 1.9), 1)
	near(wordPop(2, 2), 1.3)
	assert.ok(wordPop(2, 2.1) < 1.3 && wordPop(2, 2.1) > 1)
	assert.equal(wordPop(2, 2.5), 1)
})
