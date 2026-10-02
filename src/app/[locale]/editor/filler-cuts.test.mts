import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFillerCut } from './filler-cuts'
import { measureLoudness, type Loudness } from './take-audio'

const RATE = 16_000

/** Audio from [seconds, level] pieces: 'speech' (~-20 dBFS), 'room' tone (~-60), or 'silent'. */
function audio(pieces: Array<[number, 'speech' | 'room' | 'silent']>): Loudness {
	const amplitude = { speech: 0.14, room: 0.0014, silent: 0 }
	const out: number[] = []
	for (const [seconds, level] of pieces) {
		for (let i = 0; i < Math.round(seconds * RATE); i++) {
			out.push(Math.sin(i / 2.7) * amplitude[level])
		}
	}
	return measureLoudness(Float32Array.from(out), RATE)
}

// word (0-1.0) | room 0.1 | "um" (1.1-1.4) | room 0.1 | word (1.5-2.5), then a long tail
// so the recording's quiet floor and speech level are both well represented.
const clean = audio([
	[1, 'speech'],
	[0.1, 'room'],
	[0.3, 'speech'],
	[0.1, 'room'],
	[1, 'speech'],
	[2, 'room']
])
const um = (startSeconds: number, endSeconds: number) => ({ word: 'um', startSeconds, endSeconds })

test('a filler with a clear gap on both sides is cut, inside the gaps, covering all of it', () => {
	const plan = planFillerCut(um(1.1, 1.4), clean)
	assert.equal(plan.kind, 'cut')
	if (plan.kind !== 'cut') return
	// Never into the words either side (which end at 1.0 and start at 1.5)...
	assert.ok(plan.startSeconds >= 1.0 && plan.endSeconds <= 1.5, JSON.stringify(plan))
	// ...and the whole filler goes.
	assert.ok(plan.startSeconds <= 1.1 && plan.endSeconds >= 1.4, JSON.stringify(plan))
})

test("the transcriber's edges may be ~100 ms off — the cut still lands in the real gaps", () => {
	for (const [start, end] of [
		[1.0, 1.3],
		[1.2, 1.5],
		[1.15, 1.35]
	] as const) {
		const plan = planFillerCut(um(start, end), clean)
		assert.equal(plan.kind, 'cut', `${start}-${end}`)
		if (plan.kind !== 'cut') continue
		assert.ok(
			plan.startSeconds >= 1.0 && plan.endSeconds <= 1.5,
			`${start}-${end}: ${JSON.stringify(plan)}`
		)
		assert.ok(
			plan.startSeconds <= 1.1 && plan.endSeconds >= 1.4,
			`${start}-${end}: ${JSON.stringify(plan)}`
		)
	}
})

test('a filler that runs straight into a word is left for review, never guessed at', () => {
	const noGapBefore = audio([
		[1, 'speech'],
		[0.3, 'speech'],
		[0.1, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.deepEqual(planFillerCut(um(1.0, 1.3), noGapBefore), {
		kind: 'review',
		filler: um(1.0, 1.3),
		reason: 'no_gap_before'
	})
	const noGapAfter = audio([
		[1, 'speech'],
		[0.1, 'room'],
		[0.3, 'speech'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.equal(planFillerCut(um(1.1, 1.4), noGapAfter).kind, 'review')
})

test('a pause too short to be a gap (under 40 ms) does not count as one', () => {
	const blip = audio([
		[1, 'speech'],
		[0.02, 'room'],
		[0.3, 'speech'],
		[0.1, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	assert.equal(planFillerCut(um(1.02, 1.32), blip).kind, 'review')
})

test('gaps that bracket two separate sounds are unclear, not a filler', () => {
	// "um" then a short word inside the same pair of gaps.
	const twoSounds = audio([
		[1, 'speech'],
		[0.1, 'room'],
		[0.25, 'speech'],
		[0.06, 'room'],
		[0.25, 'speech'],
		[0.1, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	const plan = planFillerCut(um(1.1, 1.66), twoSounds)
	assert.equal(plan.kind, 'review')
})

test('a long pause next to a filler is only trimmed a little, not removed', () => {
	const pause = audio([
		[1, 'speech'],
		[2, 'room'],
		[0.3, 'speech'],
		[0.1, 'room'],
		[1, 'speech'],
		[2, 'room']
	])
	const plan = planFillerCut(um(3.0, 3.3), pause)
	assert.equal(plan.kind, 'cut')
	if (plan.kind !== 'cut') return
	assert.ok(plan.startSeconds >= 3.0 - 0.08 - 0.01, JSON.stringify(plan))
})

test('the gap threshold adapts to the recording, not a fixed level', () => {
	// Room tone at ~-60 dBFS is quiet here; on a clean digital file it's the
	// silent windows that are. Either way the room/silence reads as a gap.
	assert.ok(clean.gapThresholdDb > -60 && clean.gapThresholdDb < -30, String(clean.gapThresholdDb))
	const digital = audio([
		[1, 'speech'],
		[1, 'silent']
	])
	assert.ok(digital.gapThresholdDb < -100, String(digital.gapThresholdDb))
})
