import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSentenceSplice } from './sentence-splice'
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
