import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editedCaptions } from '../overlays/captions'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import type { Edit } from './cleanup'
import { isOriginalEdit, ORIGINAL_EDIT } from './edit-snapshot'
import { commandToPlan, type CommandContext, type EditCommand } from '../assistant/edit-command'
import { totalSeconds } from '../export/export-video'
import { editedSecondsAt } from '../overlays/overlays'
import { reRecordBlocker } from '../audio/re-record'
import {
	clampSpeed,
	clipHasTake,
	mergeClips,
	playableSegments,
	segmentSeconds,
	splitClipAt,
	wholeTake,
	withClipSettings,
	type Clip
} from './sequence'
import { NEUTRAL_GRADE } from './color-grade'
import { IDENTITY_TRANSFORM } from './transform'

const near = (actual: number | null | undefined, expected: number) =>
	assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-9, `${actual} ≠ ${expected}`)
const untouched: Edit = { trim: { startSeconds: 0, endSeconds: 10 }, cuts: [] }
/** Two clips, 0–4 s and 4–10 s, the second at `speed`. */
const twoClips = (speed: number): Clip[] => [
	{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 4 }] },
	{ id: 'b', ranges: [{ startSeconds: 4, endSeconds: 10 }], speed }
]

test('a sped clip plays its source in length / speed; the others are unchanged', () => {
	const segments = playableSegments(twoClips(2), untouched)
	assert.deepEqual(
		segments.map((s) => s.rate),
		[undefined, 2]
	)
	near(segmentSeconds(segments[1] ?? { startSeconds: 0, endSeconds: 0 }), 3)
	near(totalSeconds(segments), 7)
	near(totalSeconds(playableSegments(twoClips(0.5), untouched)), 16)
	// At 1× a clip's segments carry nothing, as before.
	assert.equal(playableSegments(twoClips(1), untouched)[1]?.rate, undefined)
})

test('the edited time at a source time divides what plays of a sped clip by its speed', () => {
	const segments = playableSegments(twoClips(2), untouched)
	near(editedSecondsAt(3, segments), 3)
	near(editedSecondsAt(4, segments, 1), 4)
	// 6 s of source into the 2× clip is 1 s of output into it.
	near(editedSecondsAt(6, segments), 5)
	near(editedSecondsAt(10, segments), 7)
})

test('captions in a sped clip run at its speed', () => {
	const words = [
		{ text: 'before', startSeconds: 1, endSeconds: 2 },
		{ text: 'inside', startSeconds: 6, endSeconds: 8 }
	]
	const captions = editedCaptions(words, playableSegments(twoClips(2), untouched))
	assert.deepEqual(
		captions.map((c) => [c.lines, c.startSeconds, c.endSeconds]),
		[
			[['before'], 1, 2],
			// 2 s of source in, at 2×: 1 s into the clip's 3 s, for 1 s.
			[['inside'], 5, 6]
		]
	)
})

test('a take in a sped clip still plays at 1×, as recorded', () => {
	const take = { span: { startSeconds: 5, endSeconds: 6 }, takeSeconds: 1 }
	const segments = playableSegments(twoClips(2), untouched, [take])
	const voiced = segments.find((s) => s.voiceOver)
	assert.equal(voiced?.rate, undefined)
	near(voiced && segmentSeconds(voiced), 1)
	// The rest of the clip, 5 s of source, at 2×.
	near(totalSeconds(segments), 4 + 1 + 2.5)
})

test("fades in a sped clip run over its played time, not the source's", () => {
	const [, second] = playableSegments(
		[
			twoClips(2)[0] ?? { id: '', ranges: [] },
			{
				...(twoClips(2)[1] ?? { id: '', ranges: [] }),
				audio: { ...DEFAULT_CLIP_AUDIO, fadeOutSeconds: 1 }
			}
		],
		untouched
	)
	near(second?.audio?.clipSeconds, 3)
})

test('a split keeps the speed on both halves; a merge plays at the first clip’s', () => {
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	const split = splitClipAt([{ ...take, speed: 1.5 }], 4, () => crypto.randomUUID()) ?? []
	assert.deepEqual(
		split.map((c) => c.speed),
		[1.5, 1.5]
	)
	const merged = mergeClips(twoClips(2), 0, 1)
	assert.equal(merged[0]?.speed, undefined)
	const mergedSped = mergeClips([...twoClips(2)].reverse(), 0, 1)
	assert.equal(mergedSped[0]?.speed, 2)
})

test('speed is kept from 0.25× to 4×, and 1× leaves no trace on the clip', () => {
	assert.equal(clampSpeed(8), 4)
	assert.equal(clampSpeed(0.1), 0.25)
	assert.equal(clampSpeed(1.5), 1.5)
	const clip = { id: 'a', ranges: [{ startSeconds: 0, endSeconds: 4 }] }
	assert.deepEqual(withClipSettings(clip, DEFAULT_CLIP_AUDIO, 1), clip)
	assert.deepEqual(withClipSettings(clip, undefined, 2), { ...clip, speed: 2 })
	// Setting the sound back to default keeps the speed.
	assert.deepEqual(withClipSettings({ ...clip, speed: 2 }, DEFAULT_CLIP_AUDIO, 2), {
		...clip,
		speed: 2
	})
})

test('a clip with a take keeps 1×, and a sentence in a sped clip cannot be re-recorded', () => {
	const take = { span: { startSeconds: 5, endSeconds: 6 }, takeSeconds: 1 }
	const [first, second] = twoClips(2)
	if (!first || !second) throw new Error('no clips')
	assert.equal(clipHasTake(first, [take]), false)
	assert.equal(clipHasTake(second, [take]), true)
	const plan = {
		kind: 'splice' as const,
		startSeconds: 5,
		endSeconds: 6,
		speech: { startSeconds: 5.1, endSeconds: 5.9 }
	}
	assert.equal(reRecordBlocker(plan, untouched, twoClips(2), []), 'sped')
	assert.equal(reRecordBlocker(plan, untouched, twoClips(1), []), null)
})

test('any clip speed is something to reset', () => {
	const [take] = wholeTake(10)
	if (!take) throw new Error('no clip')
	assert.equal(isOriginalEdit({ ...ORIGINAL_EDIT, clips: [{ ...take, speed: 2 }] }, 10), false)
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
	durationSeconds: 60,
	editedSeconds: 60,
	clipCount: 3,
	canSplitAt: () => true,
	cleanupSeconds: 0,
	canUndo: false,
	canRedo: false,
	canReset: false,
	sentenceAt: () => null,
	transform: IDENTITY_TRANSFORM,
	picture: { width: 320, height: 180 },
	clipAudio: [DEFAULT_CLIP_AUDIO, DEFAULT_CLIP_AUDIO, DEFAULT_CLIP_AUDIO],
	clipTakes: [false, false, false],
	joinLimits: [0, 1, 1],
	colors: { video: NEUTRAL_GRADE, clips: [undefined, undefined, undefined] },
	hasTitle: false,
	textCount: 0,
	audioCount: 0,
	extractBlockers: [],
	playheadSeconds: 0,
	canMerge: () => true,
	projectName: 'Take',
	unsaved: false,
	projects: []
}
const clipSpeed = (rate: number | null, fromClip: number | null, context = CONTEXT) =>
	commandToPlan({ ...NONE, action: 'clip_speed', rate, fromClip }, context)

test('a clip speed command sets one clip, or every clip, from 0.25× to 4×', () => {
	assert.deepEqual(clipSpeed(2, 2), {
		ok: true,
		plan: { kind: 'clipSpeed', clip: 2, speed: 2, skipsTakes: false }
	})
	assert.deepEqual(clipSpeed(0.5, null), {
		ok: true,
		plan: { kind: 'clipSpeed', clip: null, speed: 0.5, skipsTakes: false }
	})
	// Out of range is refused, not quietly clamped.
	assert.deepEqual(clipSpeed(8, 1), { ok: false, reason: 'unsupported_clip_speed' })
	assert.deepEqual(clipSpeed(0.1, 1), { ok: false, reason: 'unsupported_clip_speed' })
	assert.deepEqual(clipSpeed(null, 1), { ok: false, reason: 'unsupported_clip_speed' })
	assert.deepEqual(clipSpeed(2, 4), { ok: false, reason: 'no_such_clip' })
})

test('a clip with a take refuses a speed; every clip skips it, or refuses if all have one', () => {
	const withTake = { ...CONTEXT, clipTakes: [false, true, false] }
	assert.deepEqual(clipSpeed(2, 2, withTake), { ok: false, reason: 'speed_with_take' })
	assert.deepEqual(clipSpeed(2, null, withTake), {
		ok: true,
		plan: { kind: 'clipSpeed', clip: null, speed: 2, skipsTakes: true }
	})
	assert.deepEqual(clipSpeed(2, null, { ...CONTEXT, clipTakes: [true, true, true] }), {
		ok: false,
		reason: 'speed_with_take'
	})
	// The preview speed is still its own command.
	assert.deepEqual(commandToPlan({ ...NONE, action: 'speed', rate: 2 }, CONTEXT), {
		ok: true,
		plan: { kind: 'speed', rate: 2 }
	})
})
