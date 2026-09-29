import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCronAuthorized } from './cron-auth.ts'

test('cron auth fails closed without a configured secret', () => {
	for (const secret of [undefined, '']) {
		for (const header of [null, 'Bearer undefined', 'Bearer ', 'Bearer test']) {
			assert.equal(isCronAuthorized(header, secret), false)
		}
	}
})

test('cron auth accepts only the exact configured bearer token', () => {
	assert.equal(isCronAuthorized('Bearer expected', 'expected'), true)
	for (const header of [
		null,
		'expected',
		'bearer expected',
		'Bearer differen',
		'Bearer expected '
	]) {
		assert.equal(isCronAuthorized(header, 'expected'), false)
	}
})
