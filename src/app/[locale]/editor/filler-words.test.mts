import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFillerWords } from './filler-words'

const words = (...texts: string[]) =>
	detectFillerWords({
		segments: texts.map((text, i) => ({ startSeconds: i * 10, endSeconds: i * 10 + 10, text }))
	}).map((filler) => filler.word)

test('hesitation sounds are flagged, in any length or case', () => {
	assert.deepEqual(words('Um, so I think, uh, we start. Ummm. UHH, erm, er.'), [
		'um',
		'uh',
		'ummm',
		'uhh',
		'erm',
		'er'
	])
})

test('real words that contain or resemble a hesitation are not', () => {
	assert.deepEqual(words('The umbrella album was humming. I erred, err, hmm.'), [])
	assert.deepEqual(words('Uh-huh, and um-hmm, both mean yes.'), [])
})

test('"like" is a filler only when set off by punctuation on both sides', () => {
	assert.deepEqual(words('It was, like, huge.'), ['like'])
	assert.deepEqual(words('Like, I really do not know.'), ['like'])
	assert.deepEqual(words('Fine. Like, whatever.'), ['like'])
})

test('"like" as a verb, preposition or "like I said" is normal speech', () => {
	assert.deepEqual(
		words(
			'I like this take.',
			'It looks like rain, honestly.',
			'Like I said, we go again.',
			'Things like that, you know.'
		),
		[]
	)
})

test('each filler is timed by its position within the segment', () => {
	const [filler] = detectFillerWords({
		segments: [{ startSeconds: 20, endSeconds: 30, text: 'Okay so this is, um, it.' }]
	})
	// "um" starts 17 characters into a 24-character segment that spans 20-30s.
	assert.equal(filler?.word, 'um')
	assert.ok(filler && Math.abs(filler.atSeconds - (20 + (17 / 24) * 10)) < 1e-9)
})

test('an empty transcript has no filler words', () => {
	assert.deepEqual(detectFillerWords({ segments: [] }), [])
})
