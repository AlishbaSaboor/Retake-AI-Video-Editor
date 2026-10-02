import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Edit } from './cleanup'
import { matchingGain, reRecordBlocker, speechLevelDb, speechRange, takeRange } from './re-record'
import type { SplicePlan } from './sentence-splice'
import { wholeTake, type Clip } from './sequence'
import { measureLoudness, type Loudness } from './take-audio'

const RATE = 16_000

/** Audio from [seconds, amplitude] pieces of a steady tone; 0.0014 is room tone (~-60 dBFS). */
function audio(pieces: Array<[number, number]>): Loudness {
	const out: number[] = []
	for (const [seconds, amplitude] of pieces) {
		for (let i = 0; i < Math.round(seconds * RATE); i++) out.push(Math.sin(i / 2.7) * amplitude)
	}
	return measureLoudness(Float32Array.from(out), RATE)
}
const ROOM = 0.0014
const near = (actual: number, expected: number, within = 0.011) =>
	assert.ok(Math.abs(actual - expected) <= within, `${actual} is not ${expected} ±${within}`)

// The original: sentence speech 2.0-3.5, inside a span 1.92-3.58 (80 ms of
// pause kept each side).
const plan: Extract<SplicePlan, { kind: 'splice' }> = {
	kind: 'splice',
	startSeconds: 1.92,
	endSeconds: 3.58,
	speech: { startSeconds: 2, endSeconds: 3.5 }
}

test("a take is trimmed to its speech, keeping the same quiet either side as the original's span", () => {
	// 0.7 s of room (button press, breath in), 1.2 s of speech, 1 s of room.
	const take = audio([
		[0.7, ROOM],
		[1.2, 0.1],
		[1, ROOM]
	])
	const speech = speechRange(take)
	assert.ok(speech)
	near(speech.startSeconds, 0.7)
	near(speech.endSeconds, 1.9)
	const range = takeRange(take, plan, 2.9)
	assert.ok(range)
	near(range.startSeconds, 0.62)
	near(range.endSeconds, 1.98)
})

test('speech right at the start of the recording is kept, without reaching outside it', () => {
	const take = audio([
		[1.2, 0.1],
		[1, ROOM]
	])
	const range = takeRange(take, plan, 2.2)
	assert.ok(range)
	assert.equal(range.startSeconds, 0)
	near(range.endSeconds, 1.28)
})

test('the click of pressing Stop, at the end of the recording, is neither speech nor played', () => {
	// Speech, a second of room tone, then a full-scale click 0.15 s before the end.
	const take = audio([
		[0.5, ROOM],
		[1.2, 0.1],
		[1, ROOM],
		[0.02, 1],
		[0.13, ROOM]
	])
	const speech = speechRange(take)
	assert.ok(speech)
	near(speech.endSeconds, 1.7)
	// Speech that runs right up to the press is cut off before it.
	const late = audio([
		[0.5, ROOM],
		[1.2, 0.1]
	])
	const range = takeRange(late, plan, 1.7)
	assert.ok(range)
	assert.ok(range.endSeconds <= 1.4 + 1e-9, JSON.stringify(range))
})

test('a recording with no speech in it has no take, whether digital silence or room tone', () => {
	const silent = measureLoudness(new Float32Array(RATE), RATE)
	assert.equal(speechRange(silent), null)
	assert.equal(takeRange(silent, plan, 1), null)
	assert.equal(speechRange(audio([[2, ROOM]])), null)
})

test("the take's gain matches its speech level to the original's, capped at 12 dB either way", () => {
	// A tone at amplitude a sits at 20·log10(a/√2) dBFS.
	const loud = audio([[1, 0.2]])
	const quiet = audio([[1, 0.05]])
	const whole = { startSeconds: 0, endSeconds: 1 }
	const loudDb = speechLevelDb(loud, whole)
	const quietDb = speechLevelDb(quiet, whole)
	near(loudDb - quietDb, 20 * Math.log10(4), 0.1)
	// The quiet take is brought up by the 12 dB between them...
	near(matchingGain(loudDb, quietDb), 4, 0.05)
	// ...and no further than 12 dB, up or down.
	near(matchingGain(-10, -40), 10 ** (12 / 20), 1e-9)
	near(matchingGain(-40, -10), 10 ** (-12 / 20), 1e-9)
})

test('re-recording is blocked with the reason: no pause, trimmed, split, or overlapping another take', () => {
	const untouched: Edit = { trim: { startSeconds: 0, endSeconds: 10 }, cuts: [] }
	const whole = wholeTake(10)
	assert.equal(reRecordBlocker(plan, untouched, whole, []), null)
	assert.equal(
		reRecordBlocker({ kind: 'review', reason: 'no_gap_after' }, untouched, whole, []),
		'no_gap_after'
	)
	assert.equal(
		reRecordBlocker(plan, { ...untouched, trim: { startSeconds: 3, endSeconds: 10 } }, whole, []),
		'trimmed'
	)
	const split: Clip[] = [
		{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 3 }] },
		{ id: 'b', ranges: [{ startSeconds: 3, endSeconds: 10 }] }
	]
	assert.equal(reRecordBlocker(plan, untouched, split, []), 'split')
	const neighbour = { span: { startSeconds: 3.5, endSeconds: 5 }, takeSeconds: 1 }
	assert.equal(reRecordBlocker(plan, untouched, whole, [neighbour]), 'overlaps')
	// The same sentence again is allowed: the new take replaces the old one.
	const same = { span: { startSeconds: 1.92, endSeconds: 3.58 }, takeSeconds: 1 }
	assert.equal(reRecordBlocker(plan, untouched, whole, [same]), null)
})
