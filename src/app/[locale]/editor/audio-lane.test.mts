import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	extractBlocker,
	extractedItem,
	moveItem,
	playingBetween,
	stretchFrom,
	trimItem,
	withVolume,
	type AudioItem
} from './audio-lane'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import type { Edit } from './cleanup'
import { NEUTRAL_GRADE } from './color-grade'
import { commandToPlan, type CommandContext, type EditCommand } from './edit-command'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import { reRecordBlocker } from './re-record'
import { playableSegments, setTransition, type Clip } from './sequence'
import { IDENTITY_TRANSFORM } from './transform'

/** A 10 s file, untrimmed, starting 2 s into the edit. */
const music = (): AudioItem<string> => ({
	id: 'm',
	name: 'music.mp3',
	buffer: 'music',
	origin: { kind: 'file', file: new Blob() },
	pieces: [{ startSeconds: 0, endSeconds: 10 }],
	skipSeconds: 0,
	seconds: 10,
	atSeconds: 2,
	volume: 1,
	muted: false
})

test('an item plays its sound from where it starts in the edit, only in the asked stretch', () => {
	assert.deepEqual(playingBetween(music(), 0, 5), [{ atSeconds: 2, offsetSeconds: 0, seconds: 3 }])
	// Asked from 4 s: 2 s into the file.
	assert.deepEqual(playingBetween(music(), 4, 6), [{ atSeconds: 4, offsetSeconds: 2, seconds: 2 }])
	assert.deepEqual(playingBetween(music(), 13, 20), [])
})

test('moving keeps what plays; trimming the start skips more of the sound, the end plays less', () => {
	assert.equal(moveItem(music(), 5).atSeconds, 5)
	assert.equal(moveItem(music(), -3).atSeconds, 0)
	const trimmed = trimItem(music(), 'start', 3.5)
	assert.equal(trimmed.atSeconds, 3.5)
	assert.equal(trimmed.skipSeconds, 1.5)
	assert.equal(trimmed.seconds, 8.5)
	// It starts where it was put, 1.5 s into the file.
	assert.deepEqual(playingBetween(trimmed, 0, 4), [
		{ atSeconds: 3.5, offsetSeconds: 1.5, seconds: 0.5 }
	])
	// Never back past the file's start, nor past its end.
	assert.equal(trimItem(trimmed, 'start', 0).atSeconds, 2)
	assert.equal(trimItem(music(), 'end', 30).seconds, 10)
	assert.equal(trimItem(music(), 'end', 2).seconds, 0.1)
	assert.equal(withVolume(music(), 5).volume, 2)
})

const edit: Edit = { trim: { startSeconds: 0, endSeconds: 10 }, cuts: [] }
const two = (): Clip[] => [
	{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 4 }] },
	{ id: 'b', ranges: [{ startSeconds: 4, endSeconds: 10 }] }
]

test("a clip's sound taken out keeps its kept pieces, cuts skipped, where the clip starts", () => {
	const cut: Edit = { ...edit, cuts: [{ startSeconds: 6, endSeconds: 7 }] }
	const segments = playableSegments(two(), cut)
	const item = extractedItem(segments, 1, 2, 'take', 'Clip 2 sound', 'x')
	assert.deepEqual(item.pieces, [
		{ startSeconds: 4, endSeconds: 6 },
		{ startSeconds: 7, endSeconds: 10 }
	])
	assert.equal(item.atSeconds, 4)
	assert.equal(item.seconds, 5)
	// Across the cut: 1 s before it, then 1 s from just after it.
	assert.deepEqual(playingBetween(item, 5, 7), [
		{ atSeconds: 5, offsetSeconds: 5, seconds: 1 },
		{ atSeconds: 6, offsetSeconds: 7, seconds: 1 }
	])
	// Moved to the start of the edit, it plays the same sound earlier.
	assert.deepEqual(playingBetween(moveItem(item, 0), 0, 1), [
		{ atSeconds: 0, offsetSeconds: 4, seconds: 1 }
	])
})

test('a clip in the lane is silent itself, blocks re-recording and counts for reset', () => {
	const clips = two().map((c) => (c.id === 'b' ? { ...c, soundInLane: true as const } : c))
	const [first, second] = playableSegments(clips, edit)
	assert.equal(first?.audio, undefined)
	assert.equal(second?.audio?.muted, true)
	const plan = {
		kind: 'splice' as const,
		startSeconds: 5,
		endSeconds: 6,
		speech: { startSeconds: 5.1, endSeconds: 5.9 }
	}
	assert.equal(reRecordBlocker(plan, edit, clips, []), 'in_lane')
	const whole: Clip = { id: 'w', ranges: [{ startSeconds: 0, endSeconds: 4 }], soundInLane: true }
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, clips: [whole] }, 4), false)
	assert.equal(
		isOriginalEdit({ ...ORIGINAL_EDIT, clips: [{ ...whole, soundInLane: undefined }] }, 4),
		true
	)
})

test('only a clip at 1× with no take and not already out can be extracted', () => {
	const [clip] = two()
	if (!clip) throw new Error('no clip')
	assert.equal(extractBlocker(clip, []), null)
	assert.equal(extractBlocker({ ...clip, speed: 2 }, []), 'sped')
	assert.equal(extractBlocker({ ...clip, soundInLane: true }, []), 'already')
	const take = { span: { startSeconds: 1, endSeconds: 2 }, takeSeconds: 1 }
	assert.equal(extractBlocker(clip, [take]), 'take')
})

test('a stretch runs through dissolves to the next seek', () => {
	const three: Clip[] = [...two(), { id: 'c', ranges: [{ startSeconds: 10, endSeconds: 10 }] }]
	const dissolved = playableSegments(
		setTransition(two(), 1, { kind: 'dissolve', seconds: 1 }),
		edit
	)
	assert.deepEqual(stretchFrom(dissolved, 0), { from: 0, to: 9 })
	const cutOnly = playableSegments(three.slice(0, 2), edit)
	assert.deepEqual(stretchFrom(cutOnly, 0), { from: 0, to: 4 })
	assert.deepEqual(stretchFrom(cutOnly, 1), { from: 4, to: 10 })
})

const NONE: Omit<EditCommand, 'action'> = {
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null,
	degrees: null,
	axis: null,
	aspect: null,
	percent: null,
	seconds: null,
	property: null,
	target: null,
	color: null,
	background: null,
	font: null,
	effect: null
}
const CONTEXT: CommandContext = {
	durationSeconds: 10,
	editedSeconds: 10,
	clipCount: 2,
	canSplitAt: () => true,
	cleanupSeconds: 0,
	canUndo: false,
	canRedo: false,
	canReset: false,
	sentenceAt: () => null,
	transform: IDENTITY_TRANSFORM,
	picture: { width: 320, height: 180 },
	clipAudio: [DEFAULT_CLIP_AUDIO, DEFAULT_CLIP_AUDIO],
	clipTakes: [false, false],
	joinLimits: [0, 2],
	colors: { video: NEUTRAL_GRADE, clips: [undefined, undefined] },
	hasTitle: false,
	textCount: 0,
	audioCount: 2,
	extractBlockers: [null, 'sped'],
	playheadSeconds: 3,
	canMerge: () => true,
	projectName: 'Take',
	unsaved: false,
	projects: []
}
const run = (fields: Partial<EditCommand> & Pick<EditCommand, 'action'>, context = CONTEXT) =>
	commandToPlan({ ...NONE, ...fields }, context)

test('audio commands: add at a time or the playhead, extract a clip, delete a track', () => {
	assert.deepEqual(run({ action: 'add_audio', startSeconds: 5 }), {
		ok: true,
		plan: { kind: 'addAudio', seconds: 5 }
	})
	assert.deepEqual(run({ action: 'add_audio' }), {
		ok: true,
		plan: { kind: 'addAudio', seconds: 3 }
	})
	assert.deepEqual(run({ action: 'add_audio', startSeconds: 12 }), {
		ok: false,
		reason: 'audio_after_end'
	})
	assert.deepEqual(run({ action: 'extract_audio', fromClip: 1 }), {
		ok: true,
		plan: { kind: 'extractAudio', clip: 1 }
	})
	assert.deepEqual(run({ action: 'extract_audio', fromClip: 2 }), {
		ok: false,
		reason: 'extract_sped'
	})
	assert.deepEqual(run({ action: 'extract_audio', fromClip: 3 }), {
		ok: false,
		reason: 'no_such_clip'
	})
	// "Delete the music": the last one added, unless one is named.
	assert.deepEqual(run({ action: 'delete_audio' }), {
		ok: true,
		plan: { kind: 'deleteAudio', item: 2 }
	})
	assert.deepEqual(run({ action: 'delete_audio', fromClip: 3 }), {
		ok: false,
		reason: 'no_such_audio'
	})
	assert.deepEqual(run({ action: 'delete_audio' }, { ...CONTEXT, audioCount: 0 }), {
		ok: false,
		reason: 'no_audio'
	})
})
