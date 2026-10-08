import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiFailureOf, isPlainAiStatus } from './ai-failure'
import { TimeoutError } from './with-timeout'

/** An SDK error as Gemini's ApiError and our DeepgramError carry it. */
const failed = (status: number, message = '') => Object.assign(new Error(message), { status })

test('a failed AI call is named for what the person can do about it', () => {
	assert.equal(aiFailureOf(new TimeoutError(60_000)), 'timeout')
	assert.equal(aiFailureOf(failed(400, 'API key not valid. Please pass a valid API key.')), 'key')
	assert.equal(aiFailureOf(failed(401)), 'key')
	assert.equal(aiFailureOf(failed(403, 'Permission denied')), 'key')
	assert.equal(aiFailureOf(failed(429, 'Resource has been exhausted (e.g. check quota).')), 'quota')
	assert.equal(aiFailureOf(failed(503, 'The model is overloaded.')), 'busy')
	// Anything else is a bug, reported as one.
	assert.equal(aiFailureOf(failed(400, 'Invalid JSON payload')), null)
	assert.equal(aiFailureOf(failed(500)), null)
	assert.equal(aiFailureOf(new Error('fetch failed')), null)
	assert.equal(aiFailureOf('nonsense'), null)
})

test("the page shows the server's own words for a refused key, a usage limit or a busy AI only", () => {
	assert.equal(isPlainAiStatus(401), true)
	assert.equal(isPlainAiStatus(429), true)
	assert.equal(isPlainAiStatus(503), true)
	assert.equal(isPlainAiStatus(504), false)
	assert.equal(isPlainAiStatus(400), false)
	assert.equal(isPlainAiStatus(500), false)
})
