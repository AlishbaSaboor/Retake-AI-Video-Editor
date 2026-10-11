import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editedCaptions } from '../overlays/captions'
import type { Edit } from './cleanup'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import { editedSecondsAt } from '../overlays/overlays'
import { reRecordBlocker } from '../audio/re-record'
import {
	canSplitAt,
	clipHasTake,
	clipIndexAt,
	mergeClips,
	playableSegments,
	playbackPosition,
	splitClipAt,
	withClipSettings,
	type Clip
} from './sequence'
import { fitRect, type AddedVideo } from './sources'

const edit: Edit = {
	trim: { startSeconds: 0, endSeconds: 4 },
	cuts: [{ startSeconds: 1, endSeconds: 2 }]
}
/** The main video's 4 s (a cut at 1–2 s), then an added video's 3 s. */
const two = (): Clip[] => [
	{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 4 }] },
	{ id: 'b', ranges: [{ startSeconds: 0, endSeconds: 3 }], source: 'green' }
]
let ids = 0
const newId = () => `n${++ids}`

test("an added video's clip plays its own video, with its own trim and none of the main one's cuts", () => {
	const segments = playableSegments(two(), edit)
	assert.deepEqual(
		segments.map((s) => [s.source, s.startSeconds, s.endSeconds]),
		[
			[undefined, 0, 1],
			[undefined, 2, 4],
			['green', 0, 3]
		]
	)
	const trimmed = playableSegments(two(), edit, [], {
		green: { trim: { startSeconds: 0.5, endSeconds: 2 }, cuts: [] }
	})
	assert.deepEqual(trimmed.map((s) => [s.source, s.startSeconds, s.endSeconds]).at(-1), [
		'green',
		0.5,
		2
	])
})

test('a time is looked for in one video: seeking, the clip under it, the edited time', () => {
	const segments = playableSegments(two(), edit)
	assert.deepEqual(playbackPosition(0.5, segments), { index: 0, seconds: 0.5 })
	assert.deepEqual(playbackPosition(0.5, segments, 'green'), { index: 2, seconds: 0.5 })
	assert.equal(clipIndexAt(two(), 0.5), 0)
	assert.equal(clipIndexAt(two(), 0.5, 'green'), 1)
	// 0.5 s into the green video is 3.5 s into the edit (1 s + 2 s of the main one before it).
	assert.equal(editedSecondsAt(0.5, segments, null, 'green'), 3.5)
	assert.equal(editedSecondsAt(0.5, segments, null), 0.5)
})

test('a split divides the playing clip in its own video; a merge needs one video', () => {
	const split = splitClipAt(two(), 1.5, newId, [], 1) ?? []
	assert.deepEqual(
		split.map((c) => [c.source, c.ranges[0]?.startSeconds, c.ranges[0]?.endSeconds]),
		[
			[undefined, 0, 4],
			['green', 0, 1.5],
			['green', 1.5, 3]
		]
	)
	assert.equal(canSplitAt(two(), 1.5, [], 1), true)
	const clips = two()
	assert.equal(mergeClips(clips, 0, 1), clips)
	const merged = mergeClips(split, 1, 2)
	assert.equal(merged.length, 2)
	assert.equal(merged[1]?.source, 'green')
	assert.equal(withClipSettings(two()[1] ?? { id: '', ranges: [] }, undefined, 2).source, 'green')
})

test("captions, takes and re-recording are the main video's own", () => {
	const segments = playableSegments(two(), { ...edit, cuts: [] })
	const words = [{ text: 'hi.', startSeconds: 0.5, endSeconds: 0.8 }]
	// Only the main video's 0.5 s: not the green video's 0.5 s too.
	assert.equal(editedCaptions(words, segments).length, 1)
	const take = { span: { startSeconds: 0.5, endSeconds: 1 }, takeSeconds: 0.5 }
	assert.equal(clipHasTake(two()[1] ?? { id: '', ranges: [] }, [take]), false)
	const plan = {
		kind: 'splice' as const,
		startSeconds: 0.2,
		endSeconds: 0.9,
		speech: { startSeconds: 0.3, endSeconds: 0.8 }
	}
	// With the main video's clip deleted, its sentence is gone, whatever the green one has.
	assert.equal(
		reRecordBlocker(plan, { ...edit, cuts: [] }, [two()[1] ?? { id: '', ranges: [] }], []),
		'deleted'
	)
})

test('a video of another shape is fitted whole into the frame, centred', () => {
	assert.deepEqual(fitRect({ width: 240, height: 240 }, { width: 320, height: 180 }), {
		x: 70,
		y: 0,
		width: 180,
		height: 180
	})
	assert.deepEqual(fitRect({ width: 640, height: 360 }, { width: 320, height: 180 }), {
		x: 0,
		y: 0,
		width: 320,
		height: 180
	})
})

test('an added video counts for reset', () => {
	const added: AddedVideo = {
		id: 'green',
		name: 'green.webm',
		file: new File([], 'green.webm'),
		url: 'blob:green',
		durationSeconds: 3,
		width: 240,
		height: 240
	}
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, addedVideos: [added] }, 4), false)
	assert.equal(isOriginalEdit(ORIGINAL_EDIT, 4), true)
})
