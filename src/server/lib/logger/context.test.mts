import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logContext, withLogContext } from './context'

test('is empty outside any scope', () => {
	assert.deepEqual(logContext(), {})
})

test('merges a nested scope onto the enclosing one', async () => {
	await withLogContext({ runId: 'run-1' }, async () => {
		assert.deepEqual(logContext(), { runId: 'run-1' })
		await withLogContext({ source: 'apple' }, async () => {
			assert.deepEqual(logContext(), { runId: 'run-1', source: 'apple' })
		})
	})
})

test('restores the outer scope on the way out', async () => {
	await withLogContext({ runId: 'run-1' }, async () => {
		await withLogContext({ runId: 'run-2', source: 'play' }, async () => {
			assert.deepEqual(logContext(), { runId: 'run-2', source: 'play' })
		})
		assert.deepEqual(logContext(), { runId: 'run-1' })
	})
	assert.deepEqual(logContext(), {})
})

test('survives an await between the scope and the read', async () => {
	await withLogContext({ runId: 'run-1' }, async () => {
		await new Promise((resolve) => setTimeout(resolve, 1))
		assert.deepEqual(logContext(), { runId: 'run-1' })
	})
})

test('holds each concurrent scope apart', async () => {
	const seen = await Promise.all(
		['a', 'b', 'c'].map((runId) =>
			withLogContext({ runId }, async () => {
				await new Promise((resolve) => setTimeout(resolve, 1))
				return logContext().runId
			})
		)
	)
	assert.deepEqual(seen, ['a', 'b', 'c'])
})

test('returns the value the scoped function resolves to', async () => {
	assert.equal(await withLogContext({ runId: 'run-1' }, async () => 7), 7)
})

test('lets a rejection through and still restores the scope', async () => {
	await assert.rejects(
		withLogContext({ runId: 'run-1' }, async () => {
			throw new Error('boom')
		}),
		/boom/
	)
	assert.deepEqual(logContext(), {})
})
