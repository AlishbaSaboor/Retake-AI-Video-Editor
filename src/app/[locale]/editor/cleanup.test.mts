import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	keptSeconds,
	mergeCuts,
	planCleanup,
	SILENCE_PADDING_SECONDS as PAD,
	skipCuts,
	type Edit
} from './cleanup'

const DURATION = 60
const untouched: Edit = { trim: { startSeconds: 0, endSeconds: DURATION }, cuts: [] }
const close = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)

test('a silence in the middle becomes one padded cut', () => {
	const plan = planCleanup(untouched, [{ startSeconds: 10, endSeconds: 20 }], DURATION)
	assert.deepEqual(plan.trim, untouched.trim)
	assert.equal(plan.cuts.length, 1)
	close(plan.cuts[0]?.startSeconds ?? NaN, 10 + PAD)
	close(plan.cuts[0]?.endSeconds ?? NaN, 20 - PAD)
})

test('silences at the edges move the trim edges instead of cutting', () => {
	const plan = planCleanup(
		untouched,
		[
			{ startSeconds: 0, endSeconds: 8 },
			{ startSeconds: 50, endSeconds: 60 }
		],
		DURATION
	)
	assert.deepEqual(plan.cuts, [])
	close(plan.trim.startSeconds, 8 - PAD)
	close(plan.trim.endSeconds, 50 + PAD)
})

test('nothing outside a silence is ever removed', () => {
	const silences = [
		{ startSeconds: 10, endSeconds: 18 },
		{ startSeconds: 25, endSeconds: 33 },
		{ startSeconds: 40, endSeconds: 47.5 }
	]
	const plan = planCleanup(untouched, silences, DURATION)
	for (const cut of plan.cuts) {
		assert.ok(
			silences.some((s) => cut.startSeconds >= s.startSeconds && cut.endSeconds <= s.endSeconds),
			`cut ${cut.startSeconds}-${cut.endSeconds} leaves its silence`
		)
	}
	assert.equal(plan.cuts.length, 3)
})

test('silences outside the trimmed clip are ignored, and straddling ones are clipped to it', () => {
	const trimmed: Edit = { trim: { startSeconds: 20, endSeconds: 40 }, cuts: [] }
	const plan = planCleanup(
		trimmed,
		[
			{ startSeconds: 2, endSeconds: 12 },
			{ startSeconds: 36, endSeconds: 50 }
		],
		DURATION
	)
	assert.deepEqual(plan.cuts, [])
	close(plan.trim.startSeconds, 20)
	close(plan.trim.endSeconds, 36 + PAD)
})

test('the estimate is exactly the time the plan removes', () => {
	const plan = planCleanup(
		untouched,
		[
			{ startSeconds: 0, endSeconds: 8 },
			{ startSeconds: 10, endSeconds: 20 }
		],
		DURATION
	)
	close(keptSeconds(untouched) - keptSeconds(plan), 8 - PAD + (10 - 2 * PAD))
})

test('cleaning up twice removes nothing more', () => {
	const silences = [{ startSeconds: 10, endSeconds: 20 }]
	const once = planCleanup(untouched, silences, DURATION)
	const twice = planCleanup(once, silences, DURATION)
	assert.deepEqual(twice, once)
	close(keptSeconds(once) - keptSeconds(twice), 0)
})

test('overlapping and touching cuts merge; separate ones do not', () => {
	assert.deepEqual(
		mergeCuts([
			{ startSeconds: 5, endSeconds: 8 },
			{ startSeconds: 1, endSeconds: 3 },
			{ startSeconds: 3, endSeconds: 4 },
			{ startSeconds: 7, endSeconds: 9 }
		]),
		[
			{ startSeconds: 1, endSeconds: 4 },
			{ startSeconds: 5, endSeconds: 9 }
		]
	)
})

test('playback inside a cut continues from its end, and nowhere else is moved', () => {
	const cuts = [{ startSeconds: 10, endSeconds: 20 }]
	assert.equal(skipCuts(12, cuts), 20)
	assert.equal(skipCuts(10, cuts), 20)
	assert.equal(skipCuts(20, cuts), 20)
	assert.equal(skipCuts(9.99, cuts), 9.99)
	assert.equal(skipCuts(25, cuts), 25)
})
