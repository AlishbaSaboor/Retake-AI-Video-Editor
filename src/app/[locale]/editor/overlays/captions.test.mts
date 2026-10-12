import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionAt, editedCaptions, highlightColor, spokenWordAt } from './captions'

const word = (text: string, startSeconds: number, endSeconds: number) => ({
	text,
	startSeconds,
	endSeconds
})
const whole = (seconds: number) => [{ startSeconds: 0, endSeconds: seconds }]
const lines = (captions: ReturnType<typeof editedCaptions>) => captions.map((c) => c.lines)

test('a caption ends at a sentence, and its times are its words', () => {
	const captions = editedCaptions(
		[
			word('Hello', 0.2, 0.5),
			word('there.', 0.5, 1.0),
			word('Next', 1.1, 1.4),
			word('one.', 1.4, 1.8)
		],
		whole(10)
	)
	assert.deepEqual(captions, [
		{ lines: ['Hello there.'], startSeconds: 0.2, endSeconds: 1.0 },
		{ lines: ['Next one.'], startSeconds: 1.1, endSeconds: 1.8 }
	])
})

test('a long pause ends a caption, even mid-sentence', () => {
	const captions = editedCaptions([word('and', 1, 1.2), word('then', 2.5, 2.8)], whole(10))
	assert.deepEqual(lines(captions), [['and'], ['then']])
})

test('long speech wraps onto a second line, then starts a new caption', () => {
	const text = 'one two three four five six seven eight nine ten eleven twelve thirteen'.split(' ')
	const captions = editedCaptions(
		text.map((t, i) => word(t, i * 0.3, i * 0.3 + 0.25)),
		whole(10)
	)
	for (const caption of captions) {
		assert.ok(caption.lines.length <= 2)
		for (const line of caption.lines) assert.ok(line.length <= 24, line)
	}
	assert.deepEqual(lines(captions).flat().join(' ').split(' '), text)
	assert.ok(captions.length >= 2)
})

test('cut words never show, and later words move up to where they now play', () => {
	// 1–3 s is cut: the edit plays 0–1 then 3–5.
	const segments = [
		{ startSeconds: 0, endSeconds: 1 },
		{ startSeconds: 3, endSeconds: 5 }
	]
	const captions = editedCaptions(
		[word('Kept.', 0.2, 0.8), word('Gone.', 1.5, 2.5), word('Later.', 3.5, 4)],
		segments
	)
	assert.deepEqual(captions, [
		{ lines: ['Kept.'], startSeconds: 0.2, endSeconds: 0.8 },
		{ lines: ['Later.'], startSeconds: 1.5, endSeconds: 2 }
	])
})

test('reordered clips take their words with them', () => {
	const swapped = [
		{ startSeconds: 2, endSeconds: 4 },
		{ startSeconds: 0, endSeconds: 2 }
	]
	const captions = editedCaptions([word('First.', 0.5, 1), word('Second.', 2.5, 3)], swapped)
	assert.deepEqual(lines(captions), [['Second.'], ['First.']])
	assert.equal(captions[1]?.startSeconds, 2.5)
})

test('a re-recorded sentence shows its original words, spread over the take', () => {
	// The sentence 2–4 s is replaced by a 1 s take: the picture cuts at 3 s.
	const take = { span: { startSeconds: 2, endSeconds: 4 }, takeSeconds: 1 }
	const segments = [
		{ startSeconds: 0, endSeconds: 2 },
		{ startSeconds: 2, endSeconds: 3, voiceOver: { replacement: take, holdSeconds: 0 } },
		{ startSeconds: 4, endSeconds: 6 }
	]
	const captions = editedCaptions(
		[word('Original', 2, 3), word('words.', 3, 4), word('After.', 4.5, 5)],
		segments
	)
	// Both words fit into the take's 1 s at half speed, even the one past the cut picture.
	assert.deepEqual(captions, [
		{ lines: ['Original words.'], startSeconds: 2, endSeconds: 3 },
		{ lines: ['After.'], startSeconds: 3.5, endSeconds: 4 }
	])
})

test('captionAt finds the caption on screen, and none between captions', () => {
	const captions = editedCaptions([word('A.', 1, 2), word('B.', 3, 4)], whole(10))
	assert.deepEqual(captionAt(captions, 1.5)?.lines, ['A.'])
	assert.equal(captionAt(captions, 2.5), undefined)
	assert.equal(captionAt(captions, 4), undefined)
})

test('word by word, each word shows alone, held to the next unless a pause comes first', () => {
	const captions = editedCaptions(
		[word('Hello', 0.2, 0.5), word('there.', 0.6, 1.0), word('Later', 2.5, 2.9)],
		whole(10),
		'words'
	)
	assert.deepEqual(captions, [
		{ lines: ['Hello'], startSeconds: 0.2, endSeconds: 0.6 },
		{ lines: ['there.'], startSeconds: 0.6, endSeconds: 1.0 },
		{ lines: ['Later'], startSeconds: 2.5, endSeconds: 2.9 }
	])
	// A cut word never shows; later ones move up.
	const cut = editedCaptions(
		[word('Hello', 0.2, 0.5), word('there.', 0.6, 1.0)],
		[{ startSeconds: 0.55, endSeconds: 10 }],
		'words'
	)
	assert.equal(lines(cut).join(), 'there.')
	assert.ok(Math.abs((cut[0]?.startSeconds ?? 0) - 0.05) < 1e-9)
})

test('highlighted captions keep their lines and say which word is being said', () => {
	const [caption] = editedCaptions(
		[word('Hello', 0.2, 0.5), word('there', 0.6, 0.9), word('friend.', 1.0, 1.4)],
		whole(10),
		'highlight'
	)
	assert.ok(caption)
	assert.deepEqual(caption.lines, ['Hello there friend.'])
	assert.equal(spokenWordAt(caption, 0.3), 0)
	assert.equal(spokenWordAt(caption, 0.95), 1)
	assert.equal(spokenWordAt(caption, 1.2), 2)
	// Other modes pick no word out.
	const [plain] = editedCaptions([word('Hello', 0.2, 0.5)], whole(10))
	assert.equal(plain && spokenWordAt(plain, 0.3), null)
	assert.equal(highlightColor('#ffffff'), '#ffd400')
	assert.equal(highlightColor('#FFD400'), '#ffffff')
})

test('word by word never leaves a blank inside a spoken line: each word holds until the next starts', () => {
	// Two spoken lines: words with short gaps between them (one a sentence end), then a long
	// pause, then the second line.
	const spoken = [
		word('This', 0.2, 0.4),
		word('is', 0.55, 0.7),
		word('the', 0.75, 0.9),
		word('key', 1.3, 1.6),
		word('point.', 1.65, 2.1),
		word('And', 2.5, 2.7),
		word('more', 2.75, 3.0),
		word('Later', 4.5, 4.9),
		word('on.', 5.0, 5.4)
	]
	const byWord = editedCaptions(spoken, whole(10), 'words')
	const byLine = editedCaptions(spoken, whole(10), 'lines')
	// Within each spoken line, one word's caption ends exactly where the next one's starts.
	for (const line of byLine) {
		const inLine = byWord.filter(
			(c) => c.startSeconds >= line.startSeconds - 1e-9 && c.startSeconds < line.endSeconds
		)
		for (let i = 0; i + 1 < inLine.length; i++) {
			assert.equal(inLine[i]?.endSeconds, inLine[i + 1]?.startSeconds, inLine[i]?.lines[0])
		}
		// Every moment of the line shows a word.
		for (let t = line.startSeconds; t < line.endSeconds; t += 0.05) {
			assert.ok(
				captionAt(byWord, t),
				`a blank at ${t.toFixed(2)} s inside "${line.lines.join(' ')}"`
			)
		}
	}
	// Held across a short pause between sentences too ("point." until "And").
	assert.equal(captionAt(byWord, 2.3)?.lines[0], 'point.')
	// Only a long pause, between spoken lines, shows nothing.
	assert.equal(captionAt(byWord, 3.5), undefined)
	assert.equal(captionAt(byWord, 4.6)?.lines[0], 'Later')
})
