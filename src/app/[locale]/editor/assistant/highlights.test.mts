import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	EDGE_PADDING_SECONDS,
	highlightsReplySchema,
	MAX_HIGHLIGHTS,
	MAX_TITLE_LENGTH,
	numberedSentences,
	planHighlights,
	type HighlightPick
} from './highlights'
import { toTranscript } from '../audio/transcript'

// Six sentences, a pause after each but the third; the take is 20 s long.
const { segments: sentences } = toTranscript([
	{ word: 'One.', start: 0.2, end: 1 },
	{ word: 'Two', start: 2, end: 2.5 },
	{ word: 'too.', start: 2.5, end: 3 },
	{ word: 'Three.', start: 3.05, end: 4 },
	{ word: 'Four.', start: 5, end: 6 },
	{ word: 'Five.', start: 8, end: 9 },
	{ word: 'Six.', start: 12, end: 19.95 }
])
const DURATION = 20

const pick = (firstSentence: number, lastSentence: number, title = 'A moment'): HighlightPick => ({
	firstSentence,
	lastSentence,
	title,
	description: 'Why it is good.'
})

test("a moment runs from its first sentence's first word to its last sentence's last word", () => {
	const [moment] = planHighlights(sentences, [pick(2, 4)], DURATION)
	assert.ok(moment)
	assert.equal(moment.startSeconds, 2 - EDGE_PADDING_SECONDS)
	assert.equal(moment.endSeconds, 6 + EDGE_PADDING_SECONDS)
})

test('the padding is taken only from the pause, never from a neighbouring sentence', () => {
	// Sentence 3 starts 0.05 s after sentence 2 ends: the start stops at that end.
	const [moment] = planHighlights(sentences, [pick(3, 3)], DURATION)
	assert.ok(moment)
	assert.equal(moment.startSeconds, 3)
	// The last sentence ends 0.05 s before the take does.
	const [last] = planHighlights(sentences, [pick(6, 6)], DURATION)
	assert.equal(last?.endSeconds, DURATION)
	// And the first starts 0.2 s in: padded, but not before 0.
	const [first] = planHighlights(sentences, [pick(1, 1)], DURATION)
	assert.equal(first?.startSeconds, 0.2 - EDGE_PADDING_SECONDS)
})

test('a pick with its sentences the wrong way round is read the right way round', () => {
	const [moment] = planHighlights(sentences, [pick(4, 2)], DURATION)
	assert.equal(moment?.startSeconds, 2 - EDGE_PADDING_SECONDS)
	assert.equal(moment?.endSeconds, 6 + EDGE_PADDING_SECONDS)
})

test('picks naming sentences that do not exist are dropped', () => {
	const moments = planHighlights(sentences, [pick(0, 1), pick(6, 7), pick(5, 5)], DURATION)
	assert.deepEqual(
		moments.map((m) => m.startSeconds),
		[8 - EDGE_PADDING_SECONDS]
	)
})

test('a pick overlapping a better one is dropped, and the rest play in order', () => {
	const moments = planHighlights(
		sentences,
		[pick(5, 6, 'best'), pick(1, 2, 'second'), pick(2, 3, 'overlaps second'), pick(4, 4, 'third')],
		DURATION
	)
	assert.deepEqual(
		moments.map((m) => m.title),
		['second', 'third', 'best']
	)
})

test('at most five are kept, the best five', () => {
	const many = [6, 5, 4, 3, 2, 1].map((n) => pick(n, n, `#${n}`))
	const moments = planHighlights(sentences, many, DURATION)
	assert.equal(moments.length, MAX_HIGHLIGHTS)
	assert.deepEqual(
		moments.map((m) => m.title),
		['#2', '#3', '#4', '#5', '#6']
	)
})

test('no sentences: no moments', () => {
	assert.deepEqual(planHighlights([], [pick(1, 1)], DURATION), [])
})

test('the model reads each sentence numbered from 1, with its times', () => {
	assert.equal(
		numberedSentences(sentences.slice(0, 2)),
		'[1] (0.2-1.0 s) One.\n[2] (2.0-3.0 s) Two too.'
	)
})

test("a reply's titles are trimmed and cut to length, and an empty one is refused", () => {
	const long = 'x'.repeat(MAX_TITLE_LENGTH + 10)
	const parsed = highlightsReplySchema.parse({
		highlights: [{ firstSentence: 1, lastSentence: 2, title: `  ${long} `, description: ' Good. ' }]
	})
	assert.equal(parsed.highlights[0]?.title.length, MAX_TITLE_LENGTH)
	assert.equal(parsed.highlights[0]?.description, 'Good.')
	assert.equal(
		highlightsReplySchema.safeParse({
			highlights: [{ firstSentence: 1, lastSentence: 1, title: ' ', description: 'x' }]
		}).success,
		false
	)
})
