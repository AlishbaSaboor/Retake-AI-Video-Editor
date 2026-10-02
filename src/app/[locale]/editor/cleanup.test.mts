import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	keptSeconds,
	mergeCuts,
	planCleanup,
	SILENCE_PADDING_SECONDS as PAD,
	type Edit
} from './cleanup'

const DURATION = 60
const untouched: Edit = { trim: { startSeconds: 0, endSeconds: DURATION }, cuts: [] }
const close = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)

test('a silence in the middle becomes one padded cut', () => {
	const plan = planCleanup(
		untouched,
		{ silences: [{ startSeconds: 10, endSeconds: 20 }], fillerCuts: [] },
		DURATION
	)
	assert.deepEqual(plan.trim, untouched.trim)
	assert.equal(plan.cuts.length, 1)
	close(plan.cuts[0]?.startSeconds ?? NaN, 10 + PAD)
	close(plan.cuts[0]?.endSeconds ?? NaN, 20 - PAD)
})

test('silences at the edges move the trim edges instead of cutting', () => {
	const plan = planCleanup(
		untouched,
		{
			silences: [
				{ startSeconds: 0, endSeconds: 8 },
				{ startSeconds: 50, endSeconds: 60 }
			],
			fillerCuts: []
		},
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
	const plan = planCleanup(untouched, { silences: silences, fillerCuts: [] }, DURATION)
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
		{
			silences: [
				{ startSeconds: 2, endSeconds: 12 },
				{ startSeconds: 36, endSeconds: 50 }
			],
			fillerCuts: []
		},
		DURATION
	)
	assert.deepEqual(plan.cuts, [])
	close(plan.trim.startSeconds, 20)
	close(plan.trim.endSeconds, 36 + PAD)
})

test('the estimate is exactly the time the plan removes', () => {
	const plan = planCleanup(
		untouched,
		{
			silences: [
				{ startSeconds: 0, endSeconds: 8 },
				{ startSeconds: 10, endSeconds: 20 }
			],
			fillerCuts: []
		},
		DURATION
	)
	close(keptSeconds(untouched) - keptSeconds(plan), 8 - PAD + (10 - 2 * PAD))
})

test('cleaning up twice removes nothing more', () => {
	const silences = [{ startSeconds: 10, endSeconds: 20 }]
	const once = planCleanup(untouched, { silences: silences, fillerCuts: [] }, DURATION)
	const twice = planCleanup(once, { silences: silences, fillerCuts: [] }, DURATION)
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

test('filler cuts are added as-is, clipped to the trim, and merged with overlapping cuts', () => {
	const trimmed: Edit = { trim: { startSeconds: 5, endSeconds: 40 }, cuts: [] }
	const plan = planCleanup(
		trimmed,
		{
			silences: [{ startSeconds: 20, endSeconds: 30 }],
			fillerCuts: [
				{ startSeconds: 10.2, endSeconds: 10.6 },
				{ startSeconds: 29.5, endSeconds: 30.2 }, // overlaps the silence cut
				{ startSeconds: 2, endSeconds: 2.4 } // trimmed away already
			]
		},
		DURATION
	)
	assert.equal(plan.cuts.length, 2)
	close(plan.cuts[0]?.startSeconds ?? NaN, 10.2)
	close(plan.cuts[0]?.endSeconds ?? NaN, 10.6)
	close(plan.cuts[1]?.startSeconds ?? NaN, 20 + PAD)
	close(plan.cuts[1]?.endSeconds ?? NaN, 30.2)
})

test('the estimate counts filler cuts too', () => {
	const plan = planCleanup(
		untouched,
		{ silences: [], fillerCuts: [{ startSeconds: 10, endSeconds: 10.3 }] },
		DURATION
	)
	close(keptSeconds(untouched) - keptSeconds(plan), 0.3)
})
