import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	cardLines,
	editedSecondsAt,
	fitInside,
	lineReveals,
	saidWordAt,
	titleShownAt,
	watermarkRect,
	type Watermark
} from './overlays'
import { revealedWords } from './motion'

test('a title shows from its start for its duration, and not at its end', () => {
	const title = { text: 'Hello', startSeconds: 1, durationSeconds: 2 }
	assert.equal(titleShownAt(title, 0.99), false)
	assert.equal(titleShownAt(title, 1), true)
	assert.equal(titleShownAt(title, 2.99), true)
	assert.equal(titleShownAt(title, 3), false)
})

test('the watermark sits in its corner, a margin in from both edges', () => {
	const logo: Watermark = { image: '', aspect: 2, corner: 'bottom-right' }
	// 15% of 1000 wide, half as tall; 30 px in from the edges.
	assert.deepEqual(watermarkRect(logo, 1000, 500), { x: 820, y: 395, width: 150, height: 75 })
	assert.deepEqual(watermarkRect({ ...logo, corner: 'top-left' }, 1000, 500), {
		x: 30,
		y: 30,
		width: 150,
		height: 75
	})
})

test('edited time counts what played before, in play order, not source time', () => {
	// Reordered: 4–10 plays first, then 0–4.
	const segments = [
		{ startSeconds: 4, endSeconds: 10 },
		{ startSeconds: 0, endSeconds: 4 }
	]
	assert.equal(editedSecondsAt(4, segments), 0)
	assert.equal(editedSecondsAt(7, segments), 3)
	assert.equal(editedSecondsAt(1, segments), 7)
	// Paused at the very end of the last segment.
	assert.equal(editedSecondsAt(4, [{ startSeconds: 0, endSeconds: 4 }]), 4)
})

test('a time that ends one segment and starts another is in the one playback is in', () => {
	const swapped = [
		{ startSeconds: 4, endSeconds: 10 },
		{ startSeconds: 0, endSeconds: 4 }
	]
	// At 4 s: the start of the edit, or its end once playback has got there.
	assert.equal(editedSecondsAt(4, swapped, 0), 0)
	assert.equal(editedSecondsAt(4, swapped, 1), 10)
	// An index that doesn't hold the time is ignored.
	assert.equal(editedSecondsAt(7, swapped, 1), 3)
})

test('a held frame under a longer take counts toward the edited time after it', () => {
	const take = { span: { startSeconds: 2, endSeconds: 3 }, takeSeconds: 1.5 }
	const segments = [
		{ startSeconds: 2, endSeconds: 3, voiceOver: { replacement: take, holdSeconds: 0.5 } },
		{ startSeconds: 5, endSeconds: 8 }
	]
	assert.equal(editedSecondsAt(6, segments), 2.5)
})

test('a source time that is cut away has no edited time', () => {
	assert.equal(editedSecondsAt(4.5, [{ startSeconds: 0, endSeconds: 4 }]), null)
})

test('the picture fills the frame one way and letterboxes the other', () => {
	assert.deepEqual(fitInside(16 / 9, 16 / 9), { widthPercent: 100, heightPercent: 100 })
	// 4:3 in 16:9: full height, three quarters of the width.
	assert.deepEqual(fitInside(4 / 3, 16 / 9), { widthPercent: 75, heightPercent: 100 })
	// 32:9 in 16:9: full width, half the height.
	assert.deepEqual(fitInside(32 / 9, 16 / 9), { widthPercent: 100, heightPercent: 50 })
})

test("a designed frame's title card wraps between words to fit, a long word on its own line", () => {
	// Every letter 1 wide, a space too.
	const measure = (text: string) => text.length
	assert.deepEqual(cardLines('This is the key point', 12, measure), ['This is the', 'key point'])
	assert.deepEqual(cardLines('Short', 12, measure), ['Short'])
	assert.deepEqual(cardLines('a extraordinarily b', 5, measure), ['a', 'extraordinarily', 'b'])
})

test('word by word across lines: the first line comes in, then the next', () => {
	const lines = ['This is the', 'key point']
	// 5 words, 40% through: the first two words of the first line.
	// (The second line hasn't started: below 0, which shows none of its words.)
	assert.deepEqual(lineReveals(lines, 0.4), [2 / 3, -0.5])
	assert.ok(revealedWords('key point', -0.5).every((word) => word.opacity === 0))
	assert.deepEqual(lineReveals(lines, 1), [5 / 3, 1])
	assert.deepEqual(lineReveals(lines, undefined), [undefined, undefined])
})

test('the word being said: from the caption’s word times, or a one-word caption’s own start in a designed frame', () => {
	const timed = { lines: ['Hello there'], startSeconds: 1, endSeconds: 2, spoken: [1, 1.5] }
	assert.deepEqual(saidWordAt(timed, 1.6, false), { index: 1, start: 1.5 })
	const oneWord = { lines: ['Hello'], startSeconds: 1, endSeconds: 2 }
	assert.equal(saidWordAt(oneWord, 1.2, false), null)
	assert.deepEqual(saidWordAt(oneWord, 1.2, true), { index: 0, start: 1 })
	assert.equal(
		saidWordAt({ lines: ['Hello there'], startSeconds: 1, endSeconds: 2 }, 1.2, true),
		null
	)
})
