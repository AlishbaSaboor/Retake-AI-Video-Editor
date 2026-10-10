import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TimeoutError, withTimeout } from './with-timeout'

test('an AI that never answers is given up at the time limit, and told to stop', async () => {
	let signal: AbortSignal | undefined
	const started = Date.now()
	await assert.rejects(
		withTimeout(50, (abort) => {
			signal = abort
			// A fake AI that never answers, and ignores being told to stop.
			return new Promise<string>(() => {})
		}),
		(error) => error instanceof TimeoutError && error.ms === 50
	)
	assert.ok(Date.now() - started < 1000, 'given up at the limit, not left waiting')
	assert.equal(signal?.aborted, true)
})

test('an answer in time comes through, and its own failure is its own', async () => {
	assert.equal(await withTimeout(1000, async () => 'plan'), 'plan')
	await assert.rejects(
		withTimeout(1000, async () => {
			throw new Error('refused')
		}),
		/refused/
	)
})

test('a call that fails at once on being told to stop is still reported as timed out', async () => {
	await assert.rejects(
		withTimeout(
			50,
			(abort) =>
				// As an SDK does: aborting its request rejects it straight away.
				new Promise<string>((_, reject) =>
					abort.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
				)
		),
		(error) => error instanceof TimeoutError && error.ms === 50
	)
})
