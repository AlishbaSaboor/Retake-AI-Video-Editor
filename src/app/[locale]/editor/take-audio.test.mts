import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectSilences, encodeWav, MIN_SILENCE_SECONDS } from './take-audio'

const RATE = 1000

/** A test signal: [seconds, loud?] pieces laid end to end. */
function signal(pieces: Array<[number, boolean]>): Float32Array {
	const out: number[] = []
	for (const [seconds, loud] of pieces) {
		for (let i = 0; i < seconds * RATE; i++) out.push(loud ? Math.sin(i / 3) * 0.5 : 0)
	}
	return Float32Array.from(out)
}

test('a quiet stretch at least the minimum long is a silence', () => {
	assert.deepEqual(
		detectSilences(
			signal([
				[1, true],
				[7.5, false],
				[1, true]
			]),
			RATE
		),
		[{ startSeconds: 1, endSeconds: 8.5 }]
	)
})

test('a pause shorter than the minimum is not flagged', () => {
	assert.deepEqual(
		detectSilences(
			signal([
				[1, true],
				[MIN_SILENCE_SECONDS - 0.5, false],
				[1, true]
			]),
			RATE
		),
		[]
	)
})

test('a natural few-second pause in speech is not dead air', () => {
	assert.deepEqual(
		detectSilences(
			signal([
				[2, true],
				[3, false],
				[2, true],
				[4.5, false],
				[2, true]
			]),
			RATE
		),
		[]
	)
})

test('silences at the very start and end are flagged too', () => {
	assert.deepEqual(
		detectSilences(
			signal([
				[8, false],
				[1, true],
				[7.5, false]
			]),
			RATE
		),
		[
			{ startSeconds: 0, endSeconds: 8 },
			{ startSeconds: 9, endSeconds: 16.5 }
		]
	)
})

test('low-level room tone counts as silence, speech-level audio does not', () => {
	const roomTone = Float32Array.from({ length: 8 * RATE }, (_, i) => Math.sin(i) * 0.002) // ~-57 dBFS
	assert.equal(detectSilences(roomTone, RATE).length, 1)
	const speech = Float32Array.from({ length: 8 * RATE }, (_, i) => Math.sin(i) * 0.1) // ~-23 dBFS
	assert.equal(detectSilences(speech, RATE).length, 0)
})

test('encodeWav writes a valid mono 16-bit PCM header and clamps samples', () => {
	const view = new DataView(encodeWav(Float32Array.from([0, 1, -1, 2]), 16_000))
	const text = (offset: number, length: number) =>
		String.fromCharCode(...new Uint8Array(view.buffer, offset, length))
	assert.equal(text(0, 4), 'RIFF')
	assert.equal(text(8, 4), 'WAVE')
	assert.equal(view.getUint16(22, true), 1) // mono
	assert.equal(view.getUint32(24, true), 16_000)
	assert.equal(view.getUint16(34, true), 16) // bits per sample
	assert.equal(view.getUint32(40, true), 8) // 4 samples x 2 bytes
	assert.equal(view.byteLength, 44 + 8)
	assert.equal(view.getInt16(46, true), 0x7fff)
	assert.equal(view.getInt16(50, true), 0x7fff) // 2 clamped to 1
})
