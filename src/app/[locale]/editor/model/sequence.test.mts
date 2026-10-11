import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Edit } from './cleanup'
import {
	canSplitAt,
	clipIndexAt,
	mergeClips,
	moveClip,
	clipPlayedSeconds,
	playableSegments,
	playbackPosition,
	splitClipAt,
	wholeTake,
	type Clip
} from './sequence'

const DURATION = 10
const untouched: Edit = { trim: { startSeconds: 0, endSeconds: DURATION }, cuts: [] }
let counter = 0
const newId = () => `clip-${++counter}`
const ranges = (clips: Clip[]) =>
	clips.map((c) => c.ranges.map((r) => [r.startSeconds, r.endSeconds]))

test('splitting the whole take at 4 s gives two clips, 0-4 and 4-10', () => {
	const split = splitClipAt(wholeTake(DURATION), 4, newId)
	assert.deepEqual(ranges(split ?? []), [[[0, 4]], [[4, 10]]])
	assert.notEqual(split?.[0]?.id, split?.[1]?.id)
})

test('splitting only touches the clip under the playhead', () => {
	const two = splitClipAt(wholeTake(DURATION), 4, newId) ?? []
	const three = splitClipAt(two, 7, newId) ?? []
	assert.deepEqual(ranges(three), [[[0, 4]], [[4, 7]], [[7, 10]]])
	assert.equal(three[0]?.id, two[0]?.id)
})

test('a split too close to a clip edge, or outside every clip, is refused', () => {
	assert.equal(splitClipAt(wholeTake(DURATION), 0.05, newId), null)
	assert.equal(splitClipAt(wholeTake(DURATION), 9.99, newId), null)
	assert.equal(splitClipAt(wholeTake(DURATION), 12, newId), null)
	assert.equal(canSplitAt(wholeTake(DURATION), 0.05), false)
	assert.equal(canSplitAt(wholeTake(DURATION), 5), true)
})

test('a clip with several ranges splits inside the right one', () => {
	const clip: Clip = {
		id: 'joined',
		ranges: [
			{ startSeconds: 6, endSeconds: 8 },
			{ startSeconds: 2, endSeconds: 4 }
		]
	}
	assert.deepEqual(ranges(splitClipAt([clip], 3, newId) ?? []), [
		[
			[6, 8],
			[2, 3]
		],
		[[3, 4]]
	])
})

test('moving a clip shifts the ones between, and an impossible move changes nothing', () => {
	const [a, b, c] = ['a', 'b', 'c'].map((id, i) => ({
		id,
		ranges: [{ startSeconds: i, endSeconds: i + 1 }]
	}))
	const clips = [a, b, c]
	assert.deepEqual(moveClip(clips, 2, 0), [c, a, b])
	assert.deepEqual(moveClip(clips, 0, 2), [b, c, a])
	assert.deepEqual(moveClip(clips, 0, 1), [b, a, c])
	assert.equal(moveClip(clips, 1, 1), clips)
	assert.equal(moveClip(clips, 0, 3), clips)
	assert.equal(moveClip(clips, -1, 0), clips)
})

test('merging what a split divided restores the original clip exactly', () => {
	const split = splitClipAt(splitClipAt(wholeTake(DURATION), 3, newId) ?? [], 6, newId) ?? []
	assert.equal(split.length, 3)
	const merged = mergeClips(split, 0, 2)
	assert.equal(merged.length, 1)
	assert.deepEqual(merged[0]?.ranges, [{ startSeconds: 0, endSeconds: DURATION }])
	assert.equal(merged[0]?.id, split[0]?.id)
	// Merging part of the sequence leaves the rest alone.
	const partly = mergeClips(split, 1, 2)
	assert.deepEqual(partly[0], split[0])
	assert.deepEqual(partly[1]?.ranges, [{ startSeconds: 3, endSeconds: DURATION }])
})

test('merging reordered clips keeps their ranges in playback order, and what plays is unchanged', () => {
	const split = splitClipAt(wholeTake(DURATION), 4, newId) ?? []
	const reordered = moveClip(split, 1, 0)
	const merged = mergeClips(reordered, 0, 1)
	assert.deepEqual(merged[0]?.ranges, [
		{ startSeconds: 4, endSeconds: DURATION },
		{ startSeconds: 0, endSeconds: 4 }
	])
	const edit = {
		trim: { startSeconds: 1, endSeconds: 9 },
		cuts: [{ startSeconds: 2, endSeconds: 5 }]
	}
	assert.deepEqual(playableSegments(merged, edit), playableSegments(reordered, edit))
})

test('an impossible merge changes nothing', () => {
	const split = splitClipAt(wholeTake(DURATION), 4, newId) ?? []
	assert.equal(mergeClips(split, 1, 1), split)
	assert.equal(mergeClips(split, 1, 0), split)
	assert.equal(mergeClips(split, 0, 2), split)
})

test('the clip at a time contains it, and the very end belongs to the clip it ends', () => {
	const clips = splitClipAt(wholeTake(DURATION), 4, newId) ?? []
	assert.equal(clipIndexAt(clips, 2), 0)
	assert.equal(clipIndexAt(clips, 4), 1) // a split point starts the next clip
	assert.equal(clipIndexAt(clips, DURATION), 1) // playback stopped at the end
	assert.equal(clipIndexAt(clips, 12), -1)
})

test('playback follows clip order, with trim and cuts applied on top', () => {
	const reordered: Clip[] = [
		{ id: 'b', ranges: [{ startSeconds: 5, endSeconds: 10 }] },
		{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 5 }] }
	]
	const edit: Edit = {
		trim: { startSeconds: 1, endSeconds: 9 },
		cuts: [{ startSeconds: 6, endSeconds: 7 }]
	}
	assert.deepEqual(playableSegments(reordered, edit), [
		{ startSeconds: 5, endSeconds: 6 },
		{ startSeconds: 7, endSeconds: 9 },
		{ startSeconds: 1, endSeconds: 5 }
	])
	assert.equal(clipPlayedSeconds(reordered[0] as Clip, edit), 3)
})

test('one whole-take clip plays exactly what trim and cuts already did', () => {
	const edit: Edit = {
		trim: { startSeconds: 0.5, endSeconds: 9 },
		cuts: [
			{ startSeconds: 2, endSeconds: 3 },
			{ startSeconds: 6, endSeconds: 6.5 }
		]
	}
	assert.deepEqual(playableSegments(wholeTake(DURATION), edit), [
		{ startSeconds: 0.5, endSeconds: 2 },
		{ startSeconds: 3, endSeconds: 6 },
		{ startSeconds: 6.5, endSeconds: 9 }
	])
})

test('splitting never adds or removes anything that plays', () => {
	const edit: Edit = {
		trim: { startSeconds: 1, endSeconds: 9 },
		cuts: [{ startSeconds: 4, endSeconds: 5 }]
	}
	const total = (clips: Clip[]) =>
		playableSegments(clips, edit).reduce((s, x) => s + x.endSeconds - x.startSeconds, 0)
	const split = splitClipAt(splitClipAt(wholeTake(DURATION), 3, newId) ?? [], 6, newId) ?? []
	assert.equal(total(split), total(wholeTake(DURATION)))
})

test('a position inside a segment stays; inside something removed, it moves to what plays next', () => {
	const segments = playableSegments(wholeTake(DURATION), {
		...untouched,
		cuts: [{ startSeconds: 2, endSeconds: 3 }]
	})
	assert.deepEqual(playbackPosition(1, segments), { index: 0, seconds: 1 })
	assert.deepEqual(playbackPosition(2.5, segments), { index: 1, seconds: 3 })
	assert.equal(playbackPosition(10, segments), null)
})

// --- re-recorded takes ------------------------------------------------------

const take = (startSeconds: number, endSeconds: number, takeSeconds: number) => ({
	span: { startSeconds, endSeconds },
	takeSeconds
})

test('a take shorter than its span plays over the start of the span, and the picture cuts at its end', () => {
	const shorter = take(4, 6, 1.5)
	assert.deepEqual(playableSegments(wholeTake(DURATION), untouched, [shorter]), [
		{ startSeconds: 0, endSeconds: 4 },
		{ startSeconds: 4, endSeconds: 5.5, voiceOver: { replacement: shorter, holdSeconds: 0 } },
		{ startSeconds: 6, endSeconds: 10 }
	])
	assert.equal(clipPlayedSeconds(wholeTake(DURATION)[0] as Clip, untouched, [shorter]), 9.5)
})

test('a take longer than its span plays over all of it, holding the last frame for the rest', () => {
	const longer = take(4, 6, 2.5)
	const segments = playableSegments(wholeTake(DURATION), untouched, [longer])
	assert.deepEqual(segments[1], {
		startSeconds: 4,
		endSeconds: 6,
		voiceOver: { replacement: longer, holdSeconds: 0.5 }
	})
	assert.equal(clipPlayedSeconds(wholeTake(DURATION)[0] as Clip, untouched, [longer]), 10.5)
})

test('a take plays where its clip plays, after a reorder', () => {
	const reordered: Clip[] = [
		{ id: 'b', ranges: [{ startSeconds: 5, endSeconds: 10 }] },
		{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 5 }] }
	]
	const early = take(1, 2, 1)
	assert.deepEqual(
		playableSegments(reordered, untouched, [early]).map((s) => [
			s.startSeconds,
			s.endSeconds,
			Boolean(s.voiceOver)
		]),
		[
			[5, 10, false],
			[0, 1, false],
			[1, 2, true],
			[2, 5, false]
		]
	)
})

test('a take wins over a cut inside its span; a cut beside it still applies', () => {
	const replaced = take(4, 6, 2)
	const edit: Edit = {
		...untouched,
		cuts: [
			{ startSeconds: 4.5, endSeconds: 5 },
			{ startSeconds: 3, endSeconds: 4.2 }
		]
	}
	assert.deepEqual(
		playableSegments(wholeTake(DURATION), edit, [replaced]).map((s) => [
			s.startSeconds,
			s.endSeconds,
			Boolean(s.voiceOver)
		]),
		[
			[0, 3, false],
			[4, 6, true],
			[6, 10, false]
		]
	)
})

test('a take whose span is not wholly kept does not play, and the edit plays as if it were not there', () => {
	const replaced = take(4, 6, 2)
	const trimmedInto: Edit = { ...untouched, trim: { startSeconds: 5, endSeconds: DURATION } }
	assert.deepEqual(
		playableSegments(wholeTake(DURATION), trimmedInto, [replaced]),
		playableSegments(wholeTake(DURATION), trimmedInto)
	)
	// Split across two clips (as a reorder could pull the halves apart).
	const splitAcross: Clip[] = [
		{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 5 }] },
		{ id: 'b', ranges: [{ startSeconds: 5, endSeconds: 10 }] }
	]
	assert.deepEqual(
		playableSegments(splitAcross, untouched, [replaced]),
		playableSegments(splitAcross, untouched)
	)
})

test('a split inside a replaced span is refused, but at its edges it is fine', () => {
	const replaced = take(4, 6, 2)
	assert.equal(canSplitAt(wholeTake(DURATION), 5, [replaced]), false)
	assert.equal(splitClipAt(wholeTake(DURATION), 5, newId, [replaced]), null)
	assert.equal(canSplitAt(wholeTake(DURATION), 4, [replaced]), true)
	assert.equal(canSplitAt(wholeTake(DURATION), 6, [replaced]), true)
})

test('a time a hair before a segment starts counts as in it, as a video reports a computed start', () => {
	// Sought to a by-ear join of 29.080000000000002 s, Chrome reports 29.08.
	const segments = [
		{ startSeconds: 0, endSeconds: 29.080000000000002 },
		{ startSeconds: 29.080000000000002, endSeconds: 31.2 }
	]
	// Not "the end of the segment before, so seek to this one's start" again (it looped).
	assert.deepEqual(playbackPosition(29.08, segments.slice(1)), { index: 0, seconds: 29.08 })
	// Nor "before the first, so seek to its start" (the take preview froze there).
	assert.deepEqual(
		playbackPosition(0.015, [{ startSeconds: 0.015000000000000124, endSeconds: 2 }]),
		{
			index: 0,
			seconds: 0.015
		}
	)
	// A real gap is still a gap: 2 ms before is before.
	assert.deepEqual(playbackPosition(29.078, segments.slice(1)), {
		index: 0,
		seconds: 29.080000000000002
	})
})
