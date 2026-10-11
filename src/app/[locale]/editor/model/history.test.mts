import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyHistory, HISTORY_LIMIT, record, redo, reset, undo, type History } from './history'

/** Applies a run of edits, each recording the step before it; returns the final state. */
function edits(states: string[]): { history: History<string>; present: string } {
	let history = emptyHistory<string>()
	let present = 'start'
	for (const next of states) {
		history = record(history, present)
		present = next
	}
	return { history, present }
}

test('undo walks back through every step, and redo walks forward again', () => {
	let { history, present } = edits(['a', 'b', 'c'])
	const seen = []
	for (let step = undo(history, present); step; step = undo(history, present)) {
		;({ history, restore: present } = step)
		seen.push(present)
	}
	assert.deepEqual(seen, ['b', 'a', 'start'])
	for (let step = redo(history, present); step; step = redo(history, present)) {
		;({ history, restore: present } = step)
		seen.push(present)
	}
	assert.deepEqual(seen, ['b', 'a', 'start', 'a', 'b', 'c'])
})

test('with nothing to undo or redo, both return null', () => {
	assert.equal(undo(emptyHistory(), 'start'), null)
	assert.equal(redo(emptyHistory(), 'start'), null)
	const { history, present } = edits(['a'])
	assert.equal(redo(history, present), null)
})

test('a new edit after an undo clears the redo branch', () => {
	const { history, present } = edits(['a', 'b', 'c'])
	const undone = undo(history, present)
	assert.ok(undone)
	assert.equal(undone.history.future.length, 1)
	const branched = record(undone.history, undone.restore)
	assert.equal(redo(branched, 'd'), null)
	assert.deepEqual(branched.past, ['start', 'a', 'b'])
})

test(`history keeps the last ${HISTORY_LIMIT} steps and drops the oldest`, () => {
	const states = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => `edit ${i + 1}`)
	let { history, present } = edits(states)
	assert.equal(history.past.length, HISTORY_LIMIT)
	let undos = 0
	for (let step = undo(history, present); step; step = undo(history, present)) {
		;({ history, restore: present } = step)
		undos++
	}
	assert.equal(undos, HISTORY_LIMIT)
	// The oldest kept step is the one 10 edits in; 'start' to 'edit 9' are gone.
	assert.equal(present, 'edit 10')
	// Undoing and redoing never grows it past the limit.
	assert.equal(history.past.length + history.future.length, HISTORY_LIMIT)
})

test('a re-recorded take undone and redone is the same recording, not a copy', () => {
	const take = { id: 'take-1', audio: new Float32Array(48_000) }
	type Snapshot = { replacements: (typeof take)[] }
	const before: Snapshot = { replacements: [] }
	const after: Snapshot = { replacements: [take] }
	const undone = undo(record(emptyHistory<Snapshot>(), before), after)
	assert.ok(undone)
	assert.deepEqual(undone.restore.replacements, [])
	// Undone, the take lives on only in the redo branch...
	assert.equal(undone.history.future.at(-1)?.replacements[0], take)
	const redone = redo(undone.history, undone.restore)
	assert.ok(redone)
	// ...and redo brings back that exact object, audio and all.
	assert.equal(redone.restore.replacements[0], take)
	assert.equal(redone.restore.replacements[0]?.audio, take.audio)
})

test('reset goes back to the original in one step: one Undo restores every edit, Redo resets again', () => {
	const { history, present } = edits(['a', 'b', 'c'])
	const resetStep = reset(history, present, 'start')
	assert.equal(resetStep.restore, 'start')
	assert.deepEqual(resetStep.history.past, ['start', 'a', 'b', 'c'])
	const undone = undo(resetStep.history, resetStep.restore)
	assert.equal(undone?.restore, 'c')
	assert.ok(undone)
	const redone = redo(undone.history, undone.restore)
	assert.equal(redone?.restore, 'start')
	// Everything before the reset is still there to undo through.
	assert.deepEqual(redone?.history.past, ['start', 'a', 'b', 'c'])
})

test('a reset after an undo ends the redo branch, like any edit', () => {
	const { history, present } = edits(['a', 'b'])
	const undone = undo(history, present)
	assert.ok(undone)
	const resetStep = reset(undone.history, undone.restore, 'start')
	assert.equal(redo(resetStep.history, resetStep.restore), null)
})

test('takes removed by a reset are the same recordings when Undo brings them back', () => {
	const take = { id: 'take-1', audio: new Float32Array(48_000) }
	type Snapshot = { replacements: (typeof take)[] }
	const original: Snapshot = { replacements: [] }
	const edited: Snapshot = { replacements: [take] }
	const resetStep = reset(record(emptyHistory<Snapshot>(), original), edited, original)
	assert.deepEqual(resetStep.restore.replacements, [])
	const undone = undo(resetStep.history, resetStep.restore)
	assert.equal(undone?.restore.replacements[0], take)
	assert.ok(undone)
	// And past a redo of the reset and a second undo, still the same object.
	const redone = redo(undone.history, undone.restore)
	assert.ok(redone)
	assert.equal(undo(redone.history, redone.restore)?.restore.replacements[0]?.audio, take.audio)
})
