import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	commandToPlan,
	commandToTrim,
	editCommandSchema,
	type CommandContext,
	type EditCommand
} from './edit-command'

const NONE = {
	startSeconds: null,
	endSeconds: null,
	text: null,
	corner: null,
	fromClip: null,
	toClip: null,
	rate: null,
	region: null
}
const SENTENCE = { startSeconds: 25.2, endSeconds: 27, text: 'Let me add a video here.' }
/** A three-clip edit with something to clean up and to undo, but nothing to redo. */
const CONTEXT: CommandContext = {
	durationSeconds: 60,
	editedSeconds: 50,
	clipCount: 3,
	canSplitAt: (seconds) => seconds > 1 && seconds < 59,
	cleanupSeconds: 4.2,
	canUndo: true,
	canRedo: false,
	canReset: true,
	sentenceAt: (seconds) =>
		seconds >= 25 && seconds < 27
			? { sentence: SENTENCE, blocker: null }
			: seconds >= 40 && seconds < 42
				? { sentence: { ...SENTENCE, startSeconds: 40 }, blocker: 'no_gap_after' }
				: null
}
const trim = (startSeconds: number | null, endSeconds: number | null): EditCommand => ({
	...NONE,
	action: 'trim',
	startSeconds,
	endSeconds
})

test('a trim command sets the clip to exactly that range', () => {
	assert.deepEqual(commandToTrim(trim(2, 5), 10), {
		ok: true,
		range: { startSeconds: 2, endSeconds: 5 }
	})
})

test('a missing edge means the clip boundary', () => {
	assert.deepEqual(commandToTrim(trim(3, null), 10), {
		ok: true,
		range: { startSeconds: 3, endSeconds: 10 }
	})
	assert.deepEqual(commandToTrim(trim(null, 4), 10), {
		ok: true,
		range: { startSeconds: 0, endSeconds: 4 }
	})
})

test('an end past the clip is clamped to it, like a handle would be', () => {
	assert.deepEqual(commandToTrim(trim(2, 99), 10), {
		ok: true,
		range: { startSeconds: 2, endSeconds: 10 }
	})
})

test('a range that is backwards or outside the clip is refused, not guessed at', () => {
	assert.deepEqual(commandToTrim(trim(5, 2), 10), { ok: false, reason: 'out_of_range' })
	assert.deepEqual(commandToTrim(trim(12, 15), 10), { ok: false, reason: 'out_of_range' })
	assert.deepEqual(commandToTrim(trim(-1, 4), 10), { ok: false, reason: 'out_of_range' })
})

test('an unsupported command changes nothing', () => {
	assert.deepEqual(commandToTrim({ ...NONE, action: 'unsupported' }, 10), {
		ok: false,
		reason: 'unsupported'
	})
})

test('a malformed model reply fails validation instead of reaching the trim', () => {
	assert.equal(editCommandSchema.safeParse({ action: 'delete_everything' }).success, false)
	assert.equal(editCommandSchema.safeParse({ action: 'trim', startSeconds: '2' }).success, false)
})

test('a title command plans that text over that stretch of the edited video', () => {
	const title = (text: string | null, start: number | null, end: number | null) =>
		commandToPlan(
			{ ...NONE, action: 'title', text, startSeconds: start, endSeconds: end },
			{ ...CONTEXT, durationSeconds: 10, editedSeconds: 8 }
		)
	assert.deepEqual(title(' Welcome ', 0, 3), {
		ok: true,
		plan: { kind: 'title', title: { text: 'Welcome', startSeconds: 0, durationSeconds: 3 } }
	})
	// No end: to the end of the edited video (8 s), not the source (10 s); past it, clamped.
	assert.deepEqual(title('Hi', 2, null), {
		ok: true,
		plan: { kind: 'title', title: { text: 'Hi', startSeconds: 2, durationSeconds: 6 } }
	})
	assert.deepEqual(title('Hi', 2, 99), title('Hi', 2, null))
	// Nothing to show, or no time to show it in, is refused.
	assert.deepEqual(title('  ', 0, 3), { ok: false, reason: 'unsupported' })
	assert.deepEqual(title('Hi', 9, null), { ok: false, reason: 'out_of_range' })
	assert.deepEqual(title('Hi', 3, 1), { ok: false, reason: 'out_of_range' })
})

test('a box or blur command covers a named region over that stretch of the edited video', () => {
	const annotate = (
		action: 'box' | 'blur',
		region: EditCommand['region'],
		start: number | null,
		end: number | null
	) =>
		commandToPlan(
			{ ...NONE, action, region, startSeconds: start, endSeconds: end },
			{ ...CONTEXT, durationSeconds: 10, editedSeconds: 8 }
		)
	const third = 1 / 3
	assert.deepEqual(annotate('blur', 'top-right', 5, 7), {
		ok: true,
		plan: {
			kind: 'annotation',
			region: 'top-right',
			annotation: {
				kind: 'blur',
				rect: { x: 1 - third, y: 0, width: third, height: third },
				startSeconds: 5,
				endSeconds: 7
			}
		}
	})
	// A box is black; with no region named it covers the whole picture; no
	// end runs to the end of the edited video (8 s), not the source (10 s).
	assert.deepEqual(annotate('box', null, 2, null), {
		ok: true,
		plan: {
			kind: 'annotation',
			region: 'full',
			annotation: {
				kind: 'box',
				color: '#000000',
				rect: { x: 0, y: 0, width: 1, height: 1 },
				startSeconds: 2,
				endSeconds: 8
			}
		}
	})
	assert.deepEqual(annotate('blur', 'center', 2, 99), annotate('blur', 'center', 2, null))
	// No time to show it in is refused.
	assert.deepEqual(annotate('blur', 'center', 9, null), { ok: false, reason: 'out_of_range' })
	assert.deepEqual(annotate('box', 'left', 4, 3), { ok: false, reason: 'out_of_range' })
})

test("a region the editor doesn't know is not a command", () => {
	const parsed = editCommandSchema.safeParse({ ...NONE, action: 'blur', region: 'upper-middle' })
	assert.equal(parsed.success, false)
})

test('a watermark command plans a corner, bottom-right when none is named', () => {
	assert.deepEqual(commandToPlan({ ...NONE, action: 'watermark', corner: 'top-left' }, CONTEXT), {
		ok: true,
		plan: { kind: 'watermark', corner: 'top-left' }
	})
	assert.deepEqual(commandToPlan({ ...NONE, action: 'watermark' }, CONTEXT), {
		ok: true,
		plan: { kind: 'watermark', corner: 'bottom-right' }
	})
	assert.equal(
		editCommandSchema.safeParse({ ...NONE, action: 'watermark', corner: 'middle' }).success,
		false
	)
})

test('captions on and off are plans of their own', () => {
	assert.deepEqual(commandToPlan({ ...NONE, action: 'captions_on' }, CONTEXT), {
		ok: true,
		plan: { kind: 'captions', on: true }
	})
	assert.deepEqual(commandToPlan({ ...NONE, action: 'captions_off' }, CONTEXT), {
		ok: true,
		plan: { kind: 'captions', on: false }
	})
})

test('a trim still plans exactly as before', () => {
	assert.deepEqual(commandToPlan(trim(2, 5), CONTEXT), {
		ok: true,
		plan: { kind: 'trim', range: { startSeconds: 2, endSeconds: 5 } }
	})
})

// --- every editor action as a command ---------------------------------------

const run = (command: Partial<EditCommand>, context: CommandContext = CONTEXT) =>
	commandToPlan({ ...NONE, action: 'unsupported', ...command }, context)

test('split at a time plans that split, or says it cannot split there', () => {
	assert.deepEqual(run({ action: 'split', startSeconds: 10 }), {
		ok: true,
		plan: { kind: 'split', seconds: 10 }
	})
	assert.deepEqual(run({ action: 'split', startSeconds: 59.95 }), {
		ok: false,
		reason: 'cannot_split'
	})
	assert.deepEqual(run({ action: 'split' }), { ok: false, reason: 'unsupported' })
})

test('merge takes clip numbers from 1, all of them when none are named', () => {
	assert.deepEqual(run({ action: 'merge', fromClip: 2, toClip: 3 }), {
		ok: true,
		plan: { kind: 'merge', from: 1, to: 2 }
	})
	assert.deepEqual(run({ action: 'merge' }), { ok: true, plan: { kind: 'merge', from: 0, to: 2 } })
	assert.deepEqual(run({ action: 'merge', fromClip: 2, toClip: 5 }), {
		ok: false,
		reason: 'no_such_clip'
	})
	// One clip has nothing to merge with.
	assert.deepEqual(run({ action: 'merge' }, { ...CONTEXT, clipCount: 1 }), {
		ok: false,
		reason: 'no_such_clip'
	})
})

test('move puts a clip at a position, the end when none is named', () => {
	assert.deepEqual(run({ action: 'move', fromClip: 2, toClip: 1 }), {
		ok: true,
		plan: { kind: 'move', from: 1, to: 0 }
	})
	assert.deepEqual(run({ action: 'move', fromClip: 1 }), {
		ok: true,
		plan: { kind: 'move', from: 0, to: 2 }
	})
	assert.deepEqual(run({ action: 'move', fromClip: 3 }), { ok: false, reason: 'already_there' })
	assert.deepEqual(run({ action: 'move', fromClip: 4, toClip: 1 }), {
		ok: false,
		reason: 'no_such_clip'
	})
	assert.deepEqual(run({ action: 'move', fromClip: 1.5, toClip: 1 }), {
		ok: false,
		reason: 'no_such_clip'
	})
})

test('clean-up, undo, redo and reset plan only when there is something to do', () => {
	assert.deepEqual(run({ action: 'cleanup' }), {
		ok: true,
		plan: { kind: 'cleanup', seconds: 4.2 }
	})
	assert.deepEqual(run({ action: 'cleanup' }, { ...CONTEXT, cleanupSeconds: 0 }), {
		ok: false,
		reason: 'nothing_to_clean'
	})
	assert.deepEqual(run({ action: 'undo' }), { ok: true, plan: { kind: 'undo' } })
	assert.deepEqual(run({ action: 'redo' }), { ok: false, reason: 'nothing_to_redo' })
	assert.deepEqual(run({ action: 'reset' }), { ok: true, plan: { kind: 'reset' } })
	assert.deepEqual(run({ action: 'reset' }, { ...CONTEXT, canReset: false }), {
		ok: false,
		reason: 'nothing_to_reset'
	})
})

test('speed takes only the preview speeds the editor offers', () => {
	assert.deepEqual(run({ action: 'speed', rate: 2 }), {
		ok: true,
		plan: { kind: 'speed', rate: 2 }
	})
	assert.deepEqual(run({ action: 'speed', rate: 0.5 }), {
		ok: true,
		plan: { kind: 'speed', rate: 0.5 }
	})
	assert.deepEqual(run({ action: 'speed', rate: 3 }), { ok: false, reason: 'unsupported_speed' })
	assert.deepEqual(run({ action: 'speed' }), { ok: false, reason: 'unsupported_speed' })
})

test('re-record opens the sentence at that time, or says why it cannot', () => {
	assert.deepEqual(run({ action: 'rerecord', startSeconds: 25 }), {
		ok: true,
		plan: { kind: 'rerecord', sentence: SENTENCE }
	})
	// No clean pause opens the panel too: its join can be set by ear there.
	assert.deepEqual(run({ action: 'rerecord', startSeconds: 40 }), {
		ok: true,
		plan: { kind: 'rerecord', sentence: { ...SENTENCE, startSeconds: 40 } }
	})
	const split: CommandContext = {
		...CONTEXT,
		sentenceAt: () => ({ sentence: SENTENCE, blocker: 'split' })
	}
	assert.deepEqual(run({ action: 'rerecord', startSeconds: 25 }, split), {
		ok: false,
		reason: 'cannot_rerecord',
		blocker: 'split'
	})
	assert.deepEqual(run({ action: 'rerecord', startSeconds: 5 }), {
		ok: false,
		reason: 'no_sentence'
	})
})

test('export plans unless nothing plays', () => {
	assert.deepEqual(run({ action: 'export' }), { ok: true, plan: { kind: 'export' } })
	assert.deepEqual(run({ action: 'export' }, { ...CONTEXT, editedSeconds: 0 }), {
		ok: false,
		reason: 'nothing_to_export'
	})
})
