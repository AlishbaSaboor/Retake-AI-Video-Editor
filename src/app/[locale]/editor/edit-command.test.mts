import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandToPlan, commandToTrim, editCommandSchema, type EditCommand } from './edit-command'

const NONE = { startSeconds: null, endSeconds: null, text: null, corner: null }
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
		commandToPlan({ ...NONE, action: 'title', text, startSeconds: start, endSeconds: end }, 10, 8)
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

test('a watermark command plans a corner, bottom-right when none is named', () => {
	assert.deepEqual(commandToPlan({ ...NONE, action: 'watermark', corner: 'top-left' }, 10, 10), {
		ok: true,
		plan: { kind: 'watermark', corner: 'top-left' }
	})
	assert.deepEqual(commandToPlan({ ...NONE, action: 'watermark' }, 10, 10), {
		ok: true,
		plan: { kind: 'watermark', corner: 'bottom-right' }
	})
	assert.equal(
		editCommandSchema.safeParse({ ...NONE, action: 'watermark', corner: 'middle' }).success,
		false
	)
})

test('a trim still plans exactly as before', () => {
	assert.deepEqual(commandToPlan(trim(2, 5), 10, 10), {
		ok: true,
		plan: { kind: 'trim', range: { startSeconds: 2, endSeconds: 5 } }
	})
})
