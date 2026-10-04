import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editedCaptions } from './captions'
import { DEFAULT_CLIP_AUDIO } from './clip-audio'
import type { Edit } from './cleanup'
import { commandToPlan, type CommandContext, type EditCommand } from './edit-command'
import { editedSecondsAt } from './overlays'
import { reRecordBlocker } from './re-record'
import {
	canSplitAt,
	deleteClips,
	duplicateClips,
	editedLength,
	editedStarts,
	joinLimit,
	joinsOf,
	mergeClips,
	moveClip,
	playableSegments,
	segmentClips,
	setTransition,
	splitClipAt,
	transitionInto,
	type Clip
} from './sequence'
import { NEUTRAL_GRADE } from './color-grade'
import { IDENTITY_TRANSFORM } from './transform'
import {
	crossfadeGains,
	dissolveAt,
	fadeLevelAt,
	scheduleTransitionGain,
	transitionGainAt
} from './transitions'

const near = (actual: number | null | undefined, expected: number, within = 1e-9) =>
	assert.ok(Math.abs((actual ?? NaN) - expected) < within, `${actual} ≠ ${expected}`)
const untouched: Edit = { trim: { startSeconds: 0, endSeconds: 12 }, cuts: [] }
/** Three 4 s clips: 0–4, 4–8, 8–12. */
const three = (): Clip[] => [
	{ id: 'a', ranges: [{ startSeconds: 0, endSeconds: 4 }] },
	{ id: 'b', ranges: [{ startSeconds: 4, endSeconds: 8 }] },
	{ id: 'c', ranges: [{ startSeconds: 8, endSeconds: 12 }] }
]
let ids = 0
const newId = () => `new-${++ids}`

test('a fade keeps the length and dips to black at the join; a dissolve overlaps and shortens', () => {
	const faded = playableSegments(setTransition(three(), 1, { kind: 'fade', seconds: 1 }), untouched)
	assert.deepEqual(faded[1]?.transition, { kind: 'fade', seconds: 1 })
	near(editedLength(faded), 12)
	const joins = joinsOf(faded)
	near(fadeLevelAt(joins, 4), 0)
	near(fadeLevelAt(joins, 3.75), 0.5)
	near(fadeLevelAt(joins, 4.25), 0.5)
	near(fadeLevelAt(joins, 3.4), 1)

	const dissolved = playableSegments(
		setTransition(three(), 1, { kind: 'dissolve', seconds: 1 }),
		untouched
	)
	near(editedLength(dissolved), 11)
	assert.deepEqual(editedStarts(dissolved), [0, 3, 7])
	// Clip b's source 4.5 s is half a second into it, which starts at 3 s.
	near(editedSecondsAt(4.5, dissolved), 3.5)
	const halfway = dissolveAt(joinsOf(dissolved), 3.5)
	near(halfway?.progress, 0.5)
	assert.equal(dissolveAt(joinsOf(dissolved), 4), null)
})

test('captions after a dissolve move up by its overlap', () => {
	const words = [{ text: 'later.', startSeconds: 9, endSeconds: 9.5 }]
	const dissolved = playableSegments(
		setTransition(three(), 1, { kind: 'dissolve', seconds: 1 }),
		untouched
	)
	const [caption] = editedCaptions(words, dissolved)
	near(caption?.startSeconds, 8)
	near(caption?.endSeconds, 8.5)
})

test('a transition is at most half the picture either side, and never against a take', () => {
	const clips = setTransition(three(), 1, { kind: 'dissolve', seconds: 3 })
	near(joinLimit(clips, 1, untouched), 2)
	assert.deepEqual(playableSegments(clips, untouched)[1]?.transition, {
		kind: 'dissolve',
		seconds: 2
	})
	// A cut leaving 0.6 s before the join: 0.3 s at most.
	const cut: Edit = { ...untouched, cuts: [{ startSeconds: 0, endSeconds: 3.4 }] }
	near(joinLimit(clips, 1, cut), 0.3)
	// A take at the start of clip b: none.
	const take = { span: { startSeconds: 4, endSeconds: 5 }, takeSeconds: 1 }
	assert.equal(joinLimit(clips, 1, untouched, [take]), 0)
	assert.equal(playableSegments(clips, untouched, [take])[1]?.transition, undefined)
	assert.equal(joinLimit(clips, 0, untouched), null)
})

test('moving or deleting a clip drops the transitions at its joins; split and merge keep them', () => {
	const clips = setTransition(three(), 2, { kind: 'fade', seconds: 1 })
	assert.equal(transitionInto(clips, 2)?.kind, 'fade')
	// Clip c moved to the front: b is no longer before it.
	assert.equal(transitionInto(moveClip(clips, 2, 0), 0), null)
	assert.equal(transitionInto(deleteClips(clips, 1), 1), null)
	// Moved back, the same join, the same fade.
	assert.equal(transitionInto(moveClip(moveClip(clips, 2, 0), 0, 2), 2)?.kind, 'fade')
	// Split clip b: the fade follows its second half; split clip c: its first half keeps it.
	const splitB = splitClipAt(clips, 6, newId) ?? []
	assert.equal(transitionInto(splitB, 3)?.kind, 'fade')
	const splitC = splitClipAt(clips, 10, newId) ?? []
	assert.equal(transitionInto(splitC, 2)?.kind, 'fade')
	assert.equal(transitionInto(splitC, 3), null)
	// Merging a and b: the fade now follows the merged clip.
	assert.equal(transitionInto(mergeClips(clips, 0, 1), 1)?.kind, 'fade')
})

test('deleting never removes every clip; what it played no longer plays, and its sentences say why', () => {
	assert.deepEqual(deleteClips(three(), 0, 2), three())
	const left = deleteClips(three(), 1)
	assert.deepEqual(
		left.map((c) => c.id),
		['a', 'c']
	)
	near(editedLength(playableSegments(left, untouched)), 8)
	const plan = {
		kind: 'splice' as const,
		startSeconds: 5,
		endSeconds: 6,
		speech: { startSeconds: 5.1, endSeconds: 5.9 }
	}
	assert.equal(reRecordBlocker(plan, untouched, left, []), 'deleted')
})

test('a duplicate plays right after the original with its sound and speed; its words caption twice', () => {
	const audio = { ...DEFAULT_CLIP_AUDIO, volume: 0.5 }
	const clips = setTransition(
		three().map((c) => (c.id === 'a' ? { ...c, audio, speed: 2 } : c)),
		1,
		{ kind: 'dissolve', seconds: 1 }
	)
	const copied = duplicateClips(clips, 0, 0, newId)
	assert.equal(copied.length, 4)
	const copy = copied[1]
	assert.deepEqual(copy?.ranges, clips[0]?.ranges)
	assert.equal(copy?.speed, 2)
	assert.deepEqual(copy?.audio, audio)
	assert.notEqual(copy?.id, 'a')
	// The copy starts with a plain cut; the dissolve into b now follows the copy.
	assert.equal(transitionInto(copied, 1), null)
	assert.equal(transitionInto(copied, 2)?.kind, 'dissolve')
	const segments = playableSegments(copied, untouched)
	assert.deepEqual(segmentClips(copied, untouched), [0, 1, 2, 3])
	const captions = editedCaptions([{ text: 'hi.', startSeconds: 1, endSeconds: 1.5 }], segments)
	assert.deepEqual(
		captions.map((c) => [c.startSeconds, c.endSeconds]),
		[
			[0.5, 0.75],
			[2.5, 2.75]
		]
	)
	// A split at a shared time divides the clip playing, not the first one with it.
	const split = splitClipAt(copied, 2, newId, [], 1) ?? []
	assert.deepEqual(
		split.map((c) => c.ranges.length && c.ranges[0]?.endSeconds),
		[4, 2, 4, 8, 12]
	)
	assert.equal(split[0]?.id, 'a')
	assert.equal(canSplitAt(copied, 2, [], 1), true)
})

test('sound through a dissolve keeps its power; through a fade it dips to silence', () => {
	for (const p of [0, 0.25, 0.5, 1]) {
		const { out, in: into } = crossfadeGains(p)
		near(out ** 2 + into ** 2, 1)
	}
	const dissolved = playableSegments(
		setTransition(three(), 1, { kind: 'dissolve', seconds: 1 }),
		untouched
	)
	const joins = joinsOf(dissolved)
	near(transitionGainAt(joins, 0, 3.5), Math.SQRT1_2)
	near(transitionGainAt(joins, 1, 3.5), Math.SQRT1_2)
	near(transitionGainAt(joins, 2, 3.5), 1)
})

/** A gain parameter that records its schedule as [kind, value, at] points. */
function recorded() {
	const points: Array<[string, number, number]> = []
	return {
		points,
		param: {
			setValueAtTime: (value: number, at: number) =>
				points.push(['set', +value.toFixed(3), +at.toFixed(3)]),
			linearRampToValueAtTime: (value: number, at: number) =>
				points.push(['ramp', +value.toFixed(3), +at.toFixed(3)])
		}
	}
}

test('a segment schedules its transition levels on the audio clock', () => {
	const faded = playableSegments(setTransition(three(), 1, { kind: 'fade', seconds: 1 }), untouched)
	const out = recorded()
	scheduleTransitionGain(out.param, joinsOf(faded), 0, 100, 0, 4)
	assert.deepEqual(out.points, [
		['set', 1, 100],
		['ramp', 1, 103.5],
		['ramp', 0, 104]
	])
	const into = recorded()
	scheduleTransitionGain(into.param, joinsOf(faded), 1, 50, 4, 8)
	assert.deepEqual(into.points.slice(0, 2), [
		['set', 0, 50],
		['ramp', 1, 50.5]
	])
	// A dissolve's curve, in short steps, rising from silence to full.
	const dissolved = playableSegments(
		setTransition(three(), 1, { kind: 'dissolve', seconds: 1 }),
		untouched
	)
	const rising = recorded()
	scheduleTransitionGain(rising.param, joinsOf(dissolved), 1, 0, 3, 7)
	const values = rising.points.map(([, value]) => value)
	assert.equal(values[0], 0)
	assert.ok(values.every((v, i) => i === 0 || v >= (values[i - 1] ?? 0)))
	near(rising.points.find(([, , at]) => at === 0.5)?.[1], Math.SQRT1_2, 1e-3)
	assert.equal(values.at(-1), 1)
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
	font: null
}
const CONTEXT: CommandContext = {
	durationSeconds: 12,
	editedSeconds: 12,
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
	joinLimits: [0, 2, 0.5],
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
const run = (fields: Partial<EditCommand> & Pick<EditCommand, 'action'>, context = CONTEXT) =>
	commandToPlan({ ...NONE, ...fields }, context)

test('a transition command names two clips side by side, or every pair', () => {
	assert.deepEqual(run({ action: 'fade_transition', fromClip: 1, toClip: 2 }), {
		ok: true,
		plan: {
			kind: 'transition',
			transition: 'fade',
			seconds: 1,
			joins: [1],
			pair: { from: 1, to: 2 },
			shortened: false
		}
	})
	// Every pair: the 0.5 s join plays shorter.
	assert.deepEqual(run({ action: 'dissolve', seconds: 1 }), {
		ok: true,
		plan: {
			kind: 'transition',
			transition: 'dissolve',
			seconds: 1,
			joins: [1, 2],
			pair: null,
			shortened: true
		}
	})
	assert.deepEqual(run({ action: 'fade_transition', fromClip: 1, toClip: 3 }), {
		ok: false,
		reason: 'not_adjacent'
	})
	assert.deepEqual(run({ action: 'fade_transition', fromClip: 3 }), {
		ok: false,
		reason: 'no_such_clip'
	})
	assert.deepEqual(
		run({ action: 'dissolve', fromClip: 1, toClip: 2 }, { ...CONTEXT, joinLimits: [0, 0, 1] }),
		{ ok: false, reason: 'transition_blocked' }
	)
	assert.deepEqual(run({ action: 'dissolve' }, { ...CONTEXT, clipCount: 1, joinLimits: [0] }), {
		ok: false,
		reason: 'no_join'
	})
	const removed = run({ action: 'remove_transition', fromClip: 2, toClip: 3 })
	assert.ok(removed.ok && removed.plan.kind === 'transition' && removed.plan.transition === null)
})

test('delete and duplicate name one clip; the only clip is not deleted', () => {
	assert.deepEqual(run({ action: 'delete_clip', fromClip: 3 }), {
		ok: true,
		plan: { kind: 'deleteClip', clip: 3 }
	})
	assert.deepEqual(run({ action: 'duplicate_clip', fromClip: 1 }), {
		ok: true,
		plan: { kind: 'duplicateClip', clip: 1 }
	})
	assert.deepEqual(run({ action: 'delete_clip', fromClip: 4 }), {
		ok: false,
		reason: 'no_such_clip'
	})
	assert.deepEqual(run({ action: 'delete_clip', fromClip: 1 }, { ...CONTEXT, clipCount: 1 }), {
		ok: false,
		reason: 'only_clip'
	})
})
