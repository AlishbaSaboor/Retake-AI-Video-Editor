import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatRoleForEmail } from './staff-bootstrap'

test('8x.social emails get no admin seat: every seat is granted by hand', () => {
	assert.equal(seatRoleForEmail('lumin@8x.social'), null)
})

test('an 8x.social email in any case gets no seat', () => {
	assert.equal(seatRoleForEmail('Someone@8X.Social'), null)
})

test('non-8x.social emails get no seat', () => {
	assert.equal(seatRoleForEmail('user@gmail.com'), null)
	assert.equal(seatRoleForEmail('a@brand.com'), null)
})

test('malformed emails get no seat and never throw', () => {
	assert.equal(seatRoleForEmail('nodomain'), null)
	assert.equal(seatRoleForEmail(''), null)
})
