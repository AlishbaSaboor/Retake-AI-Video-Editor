import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFillerWords } from './filler-words'
import { toTranscript } from './transcript'

/** A transcript from words spoken back to back, 0.5 s each. */
const transcriptOf = (sentence: string) =>
	toTranscript(
		sentence.split(' ').map((punctuated_word, i) => ({
			word: punctuated_word.toLowerCase().replace(/[^a-z'-]/g, ''),
			punctuated_word,
			start: i * 0.5,
			end: i * 0.5 + 0.4
		}))
	)
const fillersIn = (sentence: string) => detectFillerWords(transcriptOf(sentence)).map((f) => f.word)

test('hesitation sounds are flagged, in any length or case', () => {
	assert.deepEqual(fillersIn('Um, so I think, uh, we start. Ummm. UHH, erm, er.'), [
		'um',
		'uh',
		'ummm',
		'uhh',
		'erm',
		'er'
	])
})

test('real words that contain or resemble a hesitation are not', () => {
	assert.deepEqual(fillersIn('The umbrella album was humming. I erred, err, hmm.'), [])
	assert.deepEqual(fillersIn('Uh-huh, and um-hmm, both mean yes.'), [])
})

test('"like" is a filler only when set off by punctuation on both sides', () => {
	assert.deepEqual(fillersIn('It was, like, huge.'), ['like'])
	assert.deepEqual(fillersIn('Like, I really do not know.'), ['like'])
	assert.deepEqual(fillersIn('Fine. Like, whatever.'), ['like'])
})

test('"like" as a verb, preposition or "like I said" is normal speech', () => {
	assert.deepEqual(fillersIn('I like this take.'), [])
	assert.deepEqual(fillersIn('It looks like rain, honestly.'), [])
	assert.deepEqual(fillersIn('Like I said, we go again.'), [])
	assert.deepEqual(fillersIn('It was like really hard.'), [])
})

test('each filler carries the measured timing of its own word', () => {
	const [filler] = detectFillerWords(transcriptOf('Okay so um we start.'))
	assert.deepEqual(filler, { word: 'um', startSeconds: 1, endSeconds: 1.4 })
})

test('words are grouped into sentence lines for the transcript panel', () => {
	const transcript = transcriptOf('So, um, we start. Then we stop! Done?')
	assert.deepEqual(
		transcript.segments.map((s) => s.text),
		['So, um, we start.', 'Then we stop!', 'Done?']
	)
	assert.deepEqual(transcript.segments[1], {
		startSeconds: 2,
		endSeconds: 3.4,
		text: 'Then we stop!'
	})
})

test('an empty transcript has no filler words and no lines', () => {
	const empty = toTranscript([])
	assert.deepEqual(detectFillerWords(empty), [])
	assert.deepEqual(empty.segments, [])
})
