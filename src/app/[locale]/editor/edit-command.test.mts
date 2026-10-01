import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandToTrim, editCommandSchema } from './edit-command'

const trim = (startSeconds: number | null, endSeconds: number | null) => ({
	action: 'trim' as const,
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
	assert.deepEqual(
		commandToTrim({ action: 'unsupported', startSeconds: null, endSeconds: null }, 10),
		{ ok: false, reason: 'unsupported' }
	)
})

test('a malformed model reply fails validation instead of reaching the trim', () => {
	assert.equal(editCommandSchema.safeParse({ action: 'delete_everything' }).success, false)
	assert.equal(editCommandSchema.safeParse({ action: 'trim', startSeconds: '2' }).success, false)
})
