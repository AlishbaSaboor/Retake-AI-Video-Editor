import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	clampTime,
	formatTimecode,
	isKnownDuration,
	rulerTicks,
	timeToPercent
} from './timeline-scale'

test('a duration the browser could not determine is not usable', () => {
	// MediaRecorder WebM files report Infinity until fully scanned.
	assert.equal(isKnownDuration(Infinity), false)
	assert.equal(isKnownDuration(Number.NaN), false)
	assert.equal(isKnownDuration(0), false)
	assert.equal(isKnownDuration(12.5), true)
})

test('ruler ticks pick the smallest step that keeps ten intervals or fewer', () => {
	assert.deepEqual(rulerTicks(8), [0, 1, 2, 3, 4, 5, 6, 7, 8])
	assert.deepEqual(rulerTicks(20), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
	assert.deepEqual(rulerTicks(95), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
	assert.equal(rulerTicks(3600).length, 7)
})

test('ruler ticks are empty for an unknown duration rather than looping forever', () => {
	assert.deepEqual(rulerTicks(Infinity), [])
	assert.deepEqual(rulerTicks(0), [])
})

test('timecodes read m:ss, and h:mm:ss past the hour', () => {
	assert.equal(formatTimecode(0), '0:00')
	assert.equal(formatTimecode(9.99), '0:09')
	assert.equal(formatTimecode(75), '1:15')
	assert.equal(formatTimecode(3725), '1:02:05')
	assert.equal(formatTimecode(-3), '0:00')
})

test('seeks are clamped to the clip', () => {
	assert.equal(clampTime(-1, 10), 0)
	assert.equal(clampTime(11, 10), 10)
	assert.equal(clampTime(4, 10), 4)
})

test('positions are percentages of the duration, clamped', () => {
	assert.equal(timeToPercent(5, 20), '25%')
	assert.equal(timeToPercent(40, 20), '100%')
	assert.equal(timeToPercent(5, Infinity), '0%')
})
