import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePayload } from './payload-schemas'

test('validatePayload returns the parsed value for a payload matching the schema', () => {
	const result = validatePayload('payments_module', {
		provider: 'stripe',
		retries: 3,
		surcharge_bps: 250
	})
	assert.deepEqual(result, { provider: 'stripe', retries: 3, surcharge_bps: 250 })
})

test('validatePayload rejects a payload that violates the schema (returns undefined)', () => {
	// provider not in the enum
	assert.equal(
		validatePayload('payments_module', { provider: 'square', retries: 3, surcharge_bps: 0 }),
		undefined
	)
	// retries out of range
	assert.equal(
		validatePayload('payments_module', { provider: 'stripe', retries: 99, surcharge_bps: 0 }),
		undefined
	)
	// missing field
	assert.equal(validatePayload('payments_module', { provider: 'stripe' }), undefined)
	// wrong shape entirely
	assert.equal(validatePayload('payments_module', 'nope'), undefined)
})

test('validatePayload passes a payload through untyped for a flag with no declared schema', () => {
	const raw = { anything: [1, 2, 3], nested: { ok: true } }
	assert.deepEqual(validatePayload('new_dashboard', raw), raw)
	assert.equal(validatePayload('new_dashboard', 'a-string'), 'a-string')
})
