import { test } from 'node:test'
import assert from 'node:assert/strict'
import { speechRange, takeRange } from './re-record'
import {
	byEarPlan,
	initialJoins,
	joinBounds,
	joinViews,
	MIN_JOIN_SPAN_SECONDS,
	moveJoin,
	planSentenceSplice
} from './sentence-splice'
import { measureLoudness, type Loudness } from './take-audio'

const RATE = 16_000

/** Audio from [seconds, level] pieces: 'speech' (~-20 dBFS) or 'room' tone (~-60). */
function audio(pieces: Array<[number, 'speech' | 'room']>): Loudness {
	const amplitude = { speech: 0.14, room: 0.0014 }
	const out: number[] = []
	for (const [seconds, level] of pieces) {
		for (let i = 0; i < Math.round(seconds * RATE); i++) {
			out.push(Math.sin(i / 2.7) * amplitude[level])
		}
	}
	return measureLoudness(Float32Array.from(out), RATE)
}

const sentence = (startSeconds: number, endSeconds: number) => ({
	startSeconds,
	endSeconds,
	text: 'This is the sentence.'
})

// speech (0-1) | pause 0.3 | sentence 1.3-3.3, with a 0.1 s pause inside it | pause 0.3 |
// speech (3.6-4.6), then a long tail so the quiet floor and speech level are both represented.
const take = audio([
	[1, 'speech'],
	[0.3, 'room'],
	[1, 'speech'],
	[0.1, 'room'],
	[0.9, 'speech'],
	[0.3, 'room'],
	[1, 'speech'],
	[2, 'room']
])

test('a sentence with pauses either side is spliced inside both pauses, all of it, nothing else', () => {
	const plan = planSentenceSplice(sentence(1.3, 3.3), take)
	assert.equal(plan.kind, 'splice')
	if (plan.kind !== 'splice') return
	// Never into the speech either side (which ends at 1.0 and starts at 3.6)...
	assert.ok(plan.startSeconds >= 1.0 && plan.endSeconds <= 3.6, JSON.stringify(plan))
	// ...and the whole sentence goes, pause inside it included.
	assert.ok(plan.startSeconds <= 1.3 && plan.endSeconds >= 3.3, JSON.stringify(plan))
})

test("the transcriber's edges may be ~100 ms off — the splice still lands in the real pauses", () => {
	for (const [start, end] of [
		[1.2, 3.2],
		[1.4, 3.4],
		[1.35, 3.25]
	] as const) {
		const plan = planSentenceSplice(sentence(start, end), take)
		assert.equal(plan.kind, 'splice', `${start}-${end}`)
		if (plan.kind !== 'splice') continue
		assert.ok(
			plan.startSeconds >= 1.0 && plan.startSeconds <= 1.3,
			`${start}: ${JSON.stringify(plan)}`
		)
		assert.ok(plan.endSeconds >= 3.3 && plan.endSeconds <= 3.6, `${end}: ${JSON.stringify(plan)}`)
	}
})

test('a sentence that runs straight into the speech beside it is left for review, never guessed at', () => {
	const noPauseBefore = audio([
		[2.3, 'speech'],
		[0.3, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.deepEqual(planSentenceSplice(sentence(1.3, 2.3), noPauseBefore), {
		kind: 'review',
		reason: 'no_gap_before'
	})
	const noPauseAfter = audio([
		[1, 'speech'],
		[0.3, 'room'],
		[3, 'speech'],
		[2, 'room']
	])
	assert.deepEqual(planSentenceSplice(sentence(1.3, 3.3), noPauseAfter), {
		kind: 'review',
		reason: 'no_gap_after'
	})
})

test('an edge the transcriber stretched into a pause is spliced in that pause, at the real speech', () => {
	// speech (0-1) | pause 1.0-1.6 | sentence 1.6-2.6 | pause 2.6-3.2 | speech (3.2-4.2)
	const pauses = audio([
		[1, 'speech'],
		[0.6, 'room'],
		[1, 'speech'],
		[0.6, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	// Reported edges 0.3 s inside each pause: too far for the search beside
	// the edge, but each pause contains its edge.
	const plan = planSentenceSplice(sentence(1.3, 2.9), pauses)
	assert.equal(plan.kind, 'splice')
	if (plan.kind !== 'splice') return
	// Within 80 ms of the sentence's real speech, which the audio puts at 1.6-2.6.
	assert.ok(plan.startSeconds >= 1.52 - 0.011 && plan.startSeconds <= 1.6, JSON.stringify(plan))
	assert.ok(plan.endSeconds >= 2.6 && plan.endSeconds <= 2.68 + 0.011, JSON.stringify(plan))
	// And the speech it reports is the audio's, not the transcriber's 1.3-2.9.
	assert.ok(Math.abs(plan.speech.startSeconds - 1.6) <= 0.011, JSON.stringify(plan))
	assert.ok(Math.abs(plan.speech.endSeconds - 2.6) <= 0.011, JSON.stringify(plan))
})

test('a pause near the edge that does not contain it is still not used', () => {
	// The pause ends at 1.0 and speech runs on from there; the transcriber
	// says the sentence starts at 1.2, in that speech, 0.2 s past the pause.
	const nearMiss = audio([
		[0.8, 'speech'],
		[0.2, 'room'],
		[1.5, 'speech'],
		[0.3, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.deepEqual(planSentenceSplice(sentence(1.2, 2.5), nearMiss), {
		kind: 'review',
		reason: 'no_gap_before'
	})
})

test('a long pause beside the sentence is only nibbled, so the original pacing is kept', () => {
	const longPauses = audio([
		[1, 'speech'],
		[2, 'room'],
		[1, 'speech'],
		[2, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	const plan = planSentenceSplice(sentence(3, 4), longPauses)
	assert.equal(plan.kind, 'splice')
	if (plan.kind !== 'splice') return
	// At most 80 ms of each 2 s pause goes with the sentence.
	assert.ok(plan.startSeconds >= 2.92 - 1e-9 && plan.startSeconds < 3, JSON.stringify(plan))
	assert.ok(plan.endSeconds > 4 && plan.endSeconds <= 4.08 + 1e-9, JSON.stringify(plan))
})

test('the first and last sentences splice against the quiet at the ends of the take', () => {
	const quietEnds = audio([
		[0.3, 'room'],
		[1, 'speech'],
		[0.3, 'room'],
		[1, 'speech'],
		[0.3, 'room'],
		[1, 'room']
	])
	assert.equal(planSentenceSplice(sentence(0.3, 1.3), quietEnds).kind, 'splice')
	assert.equal(planSentenceSplice(sentence(1.6, 2.6), quietEnds).kind, 'splice')
	// Speech from the very first sample has no pause before it.
	const speechFirst = audio([
		[1, 'speech'],
		[0.3, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.deepEqual(planSentenceSplice(sentence(0, 1), speechFirst), {
		kind: 'review',
		reason: 'no_gap_before'
	})
})

// --- joins set by ear

/** Like `audio`, with a 'dip': speech that drops for a moment but never to a pause (~-34 dBFS). */
function audioWithDips(pieces: Array<[number, 'speech' | 'dip' | 'room']>): Loudness {
	const amplitude = { speech: 0.14, dip: 0.028, room: 0.0014 }
	const out: number[] = []
	for (const [seconds, level] of pieces) {
		for (let i = 0; i < Math.round(seconds * RATE); i++) {
			out.push(Math.sin(i / 2.7) * amplitude[level])
		}
	}
	return measureLoudness(Float32Array.from(out), RATE)
}

const near = (actual: number, expected: number, within: number) =>
	assert.ok(Math.abs(actual - expected) <= within, `${actual} not within ${within} of ${expected}`)

// Speech runs into the sentence (2-4) and out of it with no pause, only a
// dip 0.1 s after the reported start and 0.15 s before the reported end.
const runOn = audioWithDips([
	[2.1, 'speech'],
	[0.03, 'dip'],
	[1.72, 'speech'],
	[0.03, 'dip'],
	[2.12, 'speech'],
	[2, 'room']
])
const runOnSentence = sentence(2, 4)
const whole = { startSeconds: 0, endSeconds: 8 }

test('a sentence that runs into speech both ways is refused, and its joins start at the nearest dips', () => {
	assert.equal(planSentenceSplice(runOnSentence, runOn).kind, 'review')
	const bounds = joinBounds(runOnSentence, whole, [])
	const joins = initialJoins(runOnSentence, runOn, bounds)
	near(joins.startSeconds, 2.115, 0.02)
	near(joins.endSeconds, 3.865, 0.02)
})

test('a side with a pause starts in it, as an automatic splice would; the other at its dip', () => {
	// The take above: pause before the sentence at 1.0-1.3; make the end run on.
	const oneSided = audioWithDips([
		[1, 'speech'],
		[0.3, 'room'],
		[1.9, 'speech'],
		[0.03, 'dip'],
		[2, 'speech'],
		[2, 'room']
	])
	const s = sentence(1.3, 3.3)
	assert.deepEqual(planSentenceSplice(s, oneSided), { kind: 'review', reason: 'no_gap_after' })
	const joins = initialJoins(s, oneSided, joinBounds(s, whole, []))
	// In the pause, MAX_GAP_TRIM_SECONDS from the speech.
	near(joins.startSeconds, 1.22, 0.02)
	near(joins.endSeconds, 3.215, 0.02)
})

test('joins stay within a second of the sentence, inside what plays, clear of cuts and spans beside it', () => {
	assert.deepEqual(joinBounds(runOnSentence, whole, []), { startSeconds: 1, endSeconds: 5 })
	// Inside the clip range (trimmed) that plays the sentence.
	assert.deepEqual(joinBounds(runOnSentence, { startSeconds: 1.6, endSeconds: 4.3 }, []), {
		startSeconds: 1.6,
		endSeconds: 4.3
	})
	// A cut ending before the sentence and a re-recorded span starting after it
	// fence the joins in; a cut inside the sentence doesn't (the take wins over it).
	const obstacles = [
		{ startSeconds: 0.5, endSeconds: 1.8 },
		{ startSeconds: 2.5, endSeconds: 2.8 },
		{ startSeconds: 4.4, endSeconds: 6 }
	]
	assert.deepEqual(joinBounds(runOnSentence, whole, obstacles), {
		startSeconds: 1.8,
		endSeconds: 4.4
	})
})

test('a join moves only within its bounds and never closer than the minimum to the other', () => {
	const bounds = { startSeconds: 1, endSeconds: 5 }
	const joins = { startSeconds: 2, endSeconds: 4 }
	assert.deepEqual(moveJoin(joins, 'start', 0.2, bounds), { startSeconds: 1, endSeconds: 4 })
	assert.deepEqual(moveJoin(joins, 'end', 9, bounds), { startSeconds: 2, endSeconds: 5 })
	near(moveJoin(joins, 'start', 4.5, bounds).startSeconds, 4 - MIN_JOIN_SPAN_SECONDS, 1e-9)
	near(moveJoin(joins, 'end', 1.5, bounds).endSeconds, 2 + MIN_JOIN_SPAN_SECONDS, 1e-9)
	// Starting joins obey the same rules when a dip lies outside the bounds.
	const fenced = initialJoins(runOnSentence, runOn, { startSeconds: 2.2, endSeconds: 3.8 })
	assert.ok(fenced.startSeconds >= 2.2 && fenced.endSeconds <= 3.8, JSON.stringify(fenced))
})

test('a by-ear splice replaces exactly the joins, and its take is trimmed to its own speech', () => {
	const plan = byEarPlan({ startSeconds: 2.1, endSeconds: 3.9 })
	assert.deepEqual(plan, {
		kind: 'splice',
		startSeconds: 2.1,
		endSeconds: 3.9,
		speech: { startSeconds: 2.1, endSeconds: 3.9 },
		byEar: true
	})
	// A recording: 0.5 s of room, 1.5 s of speech, 1 s of room (Stop pressed late).
	const recording = audio([
		[0.5, 'room'],
		[1.5, 'speech'],
		[1, 'room']
	])
	assert.deepEqual(takeRange(recording, plan, 3), speechRange(recording))
})

test("each join's waveform shows its edge of the sentence with a second's context, inside the bounds", () => {
	assert.deepEqual(joinViews(runOnSentence, { startSeconds: 1.5, endSeconds: 5 }), {
		start: { startSeconds: 1.5, endSeconds: 3 },
		end: { startSeconds: 3, endSeconds: 5 }
	})
})
