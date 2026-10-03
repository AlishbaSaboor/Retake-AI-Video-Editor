import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	detectAudioIssues,
	detectClipping,
	detectNoise,
	detectQuietSpeech,
	type AudioIssue
} from './audio-quality'
import { measureLoudness } from './take-audio'

// Speech-like test audio: 200 Hz tone bursts, 0.3 s on and 0.2 s off (a
// syllable rhythm with real pauses), at amplitude 0.5 unless a section says
// otherwise. Pauses are digital silence unless noise is added.
const RATE = 16_000
const FULL_RATE = 48_000
type Section = { from: number; to: number; gain?: number; noise?: number }

let seed = 7
/** Deterministic Gaussian noise (Box–Muller on a linear congruential generator). */
function gaussian(): number {
	const next = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) + 0.5) / 2 ** 31
	return Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next())
}

function speech(seconds: number, rate: number, sections: Section[] = []): Float32Array {
	const samples = new Float32Array(Math.round(seconds * rate))
	for (let i = 0; i < samples.length; i++) {
		const t = i / rate
		const section = sections.find((s) => t >= s.from && t < s.to)
		const on = t % 0.5 < 0.3
		const tone = on ? 0.5 * (section?.gain ?? 1) * Math.sin(2 * Math.PI * 200 * t) : 0
		const noise = section?.noise ? section.noise * gaussian() : 0
		samples[i] = Math.max(-1, Math.min(1, tone + noise))
	}
	return samples
}

const db = (value: number) => 10 ** (value / 20)
const spans = (found: Array<{ startSeconds: number; endSeconds: number }>) =>
	found.map((s) => [Number(s.startSeconds.toFixed(2)), Number(s.endSeconds.toFixed(2))])
const inside = (
	found: Array<{ startSeconds: number; endSeconds: number }>,
	from: number,
	to: number
) => found.every((s) => s.startSeconds >= from && s.endSeconds <= to)

test('clean speech-like audio raises no flags', () => {
	const mono = speech(40, RATE)
	const issues = detectAudioIssues([speech(40, FULL_RATE)], FULL_RATE, measureLoudness(mono, RATE))
	assert.deepEqual(issues, [])
})

test('clipping is flagged where the waveform piles up at full scale, and only there', () => {
	// Driven 15.6 dB past full scale (0.5 × 12 = 6, clamped at 1) from 4 to 7 s.
	const clipped = speech(12, FULL_RATE, [{ from: 4, to: 7, gain: 12 }])
	const found = detectClipping([clipped], FULL_RATE)
	assert.equal(found.length, 1, `one stretch: ${JSON.stringify(spans(found))}`)
	assert.ok(inside(found, 4, 7.05), JSON.stringify(spans(found)))
	assert.ok((found[0]?.endSeconds ?? 0) - (found[0]?.startSeconds ?? 0) > 2.5)
})

test('clipping in either channel of a stereo take counts', () => {
	const left = speech(6, FULL_RATE)
	const right = speech(6, FULL_RATE, [{ from: 2, to: 3, gain: 12 }])
	assert.equal(detectClipping([left, right], FULL_RATE).length, 1)
})

test('a few peaks touching full scale, as loud clean speech has, are not clipping', () => {
	const samples = speech(10, FULL_RATE)
	// One full-scale sample every 10 ms: real recordings' worst window had
	// 1% of its samples near full scale.
	for (let i = 0; i < samples.length; i += FULL_RATE / 100) samples[i] = 1
	assert.deepEqual(detectClipping([samples], FULL_RATE), [])
})

test('speech 20 dB quieter than the rest for 6 s is flagged there, and only there', () => {
	const mono = speech(40, RATE, [{ from: 20, to: 26, gain: db(-20) }])
	const found = detectQuietSpeech(measureLoudness(mono, RATE))
	assert.equal(found.length, 1, JSON.stringify(spans(found)))
	assert.ok(inside(found, 20, 26), JSON.stringify(spans(found)))
	assert.ok((found[0]?.endSeconds ?? 0) - (found[0]?.startSeconds ?? 0) >= 4)
})

test('a 10 dB dip, a short quiet moment, or too little speech to compare is not flagged', () => {
	const dip = speech(40, RATE, [{ from: 20, to: 26, gain: db(-10) }])
	assert.deepEqual(detectQuietSpeech(measureLoudness(dip, RATE)), [])
	const moment = speech(40, RATE, [{ from: 20, to: 21.5, gain: db(-20) }])
	assert.deepEqual(detectQuietSpeech(measureLoudness(moment, RATE)), [])
	const short = speech(3, RATE, [{ from: 1, to: 3, gain: db(-20) }])
	assert.deepEqual(detectQuietSpeech(measureLoudness(short, RATE)), [])
})

test('a background 10 dB under the speech for 14 s is flagged there; a faint one is not', () => {
	// The tone's RMS is 0.5/√2; noise at that minus 10 dB.
	const noisy = speech(40, RATE, [{ from: 13, to: 27, noise: (0.5 / Math.SQRT2) * db(-10) }])
	const found = detectNoise(measureLoudness(noisy, RATE))
	assert.equal(found.length, 1, JSON.stringify(spans(found)))
	// Judged over 10 s windows, then each edge walked in past clean seconds.
	assert.deepEqual(spans(found), [[13, 27]])
	const faint = speech(40, RATE, [{ from: 13, to: 27, noise: (0.5 / Math.SQRT2) * db(-30) }])
	assert.deepEqual(detectNoise(measureLoudness(faint, RATE)), [])
})

test('all three in one take come back tagged, in time order, each in its own place', () => {
	const sections: Section[] = [
		{ from: 4, to: 7, gain: 12 },
		{ from: 12, to: 18, gain: db(-20) },
		{ from: 24, to: 38, noise: (0.5 / Math.SQRT2) * db(-10) }
	]
	const issues: AudioIssue[] = detectAudioIssues(
		[speech(44, FULL_RATE, sections)],
		FULL_RATE,
		measureLoudness(speech(44, RATE, sections), RATE)
	)
	assert.deepEqual(
		issues.map((i) => i.kind),
		['clipping', 'quiet', 'noise']
	)
	const [clipping, quiet, noise] = issues
	assert.ok(clipping && inside([clipping], 4, 7.05))
	assert.ok(quiet && inside([quiet], 12, 18))
	assert.ok(noise && inside([noise], 23.5, 38.5), JSON.stringify(spans([noise])))
})
