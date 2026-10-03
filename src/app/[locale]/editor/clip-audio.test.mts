import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipGainAt, DEFAULT_CLIP_AUDIO, scheduleClipGain, type SegmentAudio } from './clip-audio'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import { mergeClips, playableSegments, splitClipAt, wholeTake } from './sequence'

const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`)
const clip = (fields: Partial<SegmentAudio>): SegmentAudio => ({
	...DEFAULT_CLIP_AUDIO,
	clipSeconds: 10,
	offsetSeconds: 0,
	...fields
})

test("a clip's gain is its volume, or nothing muted", () => {
	near(clipGainAt(clip({ volume: 0.5 }), 3), 0.5)
	near(clipGainAt(clip({ volume: 2 }), 3), 2)
	near(clipGainAt(clip({ volume: 2, muted: true }), 3), 0)
})

test('fades rise from silence at the start and fall to silence at the end, straight', () => {
	const faded = clip({ volume: 0.8, fadeInSeconds: 2, fadeOutSeconds: 4 })
	near(clipGainAt(faded, 0), 0)
	near(clipGainAt(faded, 1), 0.4)
	near(clipGainAt(faded, 2), 0.8)
	near(clipGainAt(faded, 6), 0.8)
	near(clipGainAt(faded, 8), 0.4)
	near(clipGainAt(faded, 10), 0)
	// Fades longer than the clip together meet where their lines cross.
	const overlapping = clip({ fadeInSeconds: 6, fadeOutSeconds: 6 })
	near(clipGainAt(overlapping, 5), 5 / 6)
})

/** A gain parameter that records its schedule as [kind, value, at] points. */
function recorded() {
	const points: Array<[string, number, number]> = []
	return {
		points,
		param: {
			setValueAtTime: (value: number, at: number) =>
				points.push(['set', +value.toFixed(4), +at.toFixed(4)]),
			linearRampToValueAtTime: (value: number, at: number) =>
				points.push(['ramp', +value.toFixed(4), +at.toFixed(4)])
		}
	}
}

test("a segment schedules its part of the clip's envelope on the audio clock", () => {
	const faded = clip({ volume: 0.8, fadeInSeconds: 2, fadeOutSeconds: 4 })
	// The whole clip as one segment, from audio time 100.
	const whole = recorded()
	scheduleClipGain(whole.param, faded, 100, 0, 10, 1)
	assert.deepEqual(whole.points, [
		['set', 0, 100],
		['ramp', 0.8, 102],
		['ramp', 0.8, 106],
		['ramp', 0, 110]
	])
	// The clip's second segment, 3 s long, starting 5 s into it: flat, then into the fade out.
	const later = recorded()
	scheduleClipGain(later.param, { ...faded, offsetSeconds: 5 }, 100, 0, 3, 1)
	assert.deepEqual(later.points, [
		['set', 0.8, 100],
		['ramp', 0.8, 101],
		['ramp', 0.4, 103]
	])
	// Overlapping fades: up to where they cross, then down. (The points where
	// each fade nominally starts are scheduled too, on the same lines.)
	const peak = recorded()
	scheduleClipGain(peak.param, clip({ fadeInSeconds: 6, fadeOutSeconds: 6 }), 0, 0, 10, 1)
	assert.deepEqual(peak.points, [
		['set', 0, 0],
		['ramp', 0.6667, 4],
		['ramp', 0.8333, 5],
		['ramp', 0.6667, 6],
		['ramp', 0, 10]
	])
})

test("segments carry their clip's sound and where in the clip they fall, cuts skipped", () => {
	const audio = { ...DEFAULT_CLIP_AUDIO, volume: 0.5, fadeOutSeconds: 1 }
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	const edit = {
		trim: { startSeconds: 0, endSeconds: 10 },
		cuts: [{ startSeconds: 2, endSeconds: 4 }]
	}
	const segments = playableSegments([{ ...take, audio }], edit)
	assert.equal(segments.length, 2)
	assert.deepEqual(
		segments.map((s) => [s.audio?.offsetSeconds, s.audio?.clipSeconds, s.audio?.volume]),
		[
			[0, 8, 0.5],
			[2, 8, 0.5]
		]
	)
	// A clip as recorded carries nothing.
	assert.equal(playableSegments([take], edit)[0]?.audio, undefined)
})

test('a split shares the sound: both halves keep the volume, the fades stay at the ends', () => {
	const audio = { volume: 0.5, muted: true, fadeInSeconds: 1, fadeOutSeconds: 2 }
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	const split = splitClipAt([{ ...take, audio }], 4, () => crypto.randomUUID())
	assert.deepEqual(
		split?.map((c) => c.audio),
		[
			{ volume: 0.5, muted: true, fadeInSeconds: 1, fadeOutSeconds: 0 },
			{ volume: 0.5, muted: true, fadeInSeconds: 0, fadeOutSeconds: 2 }
		]
	)
	// Merged back: the first half's volume and fade in, the last half's fade out.
	const merged = mergeClips(split ?? [], 0, 1)
	assert.deepEqual(merged[0]?.audio, audio)
})

test('any clip sound is something to reset', () => {
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	const louder = { ...take, audio: { ...DEFAULT_CLIP_AUDIO, volume: 1.5 } }
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, clips: [louder] }, 10), false)
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, clips: [take] }, 10), true)
})
