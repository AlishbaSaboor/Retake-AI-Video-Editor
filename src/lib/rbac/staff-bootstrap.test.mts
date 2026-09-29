import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatRoleForEmail } from './staff-bootstrap'
import { LOWEST_ROLE } from './roles'

test('8x.social emails get the lowest admin seat', () => {
	assert.equal(seatRoleForEmail('lumin@8x.social'), LOWEST_ROLE)
})

test('the domain match is case-insensitive', () => {
	assert.equal(seatRoleForEmail('Someone@8X.Social'), LOWEST_ROLE)
})

test('non-8x.social emails get no seat', () => {
	assert.equal(seatRoleForEmail('user@gmail.com'), null)
	assert.equal(seatRoleForEmail('a@brand.com'), null)
})

test('malformed emails get no seat and never throw', () => {
	assert.equal(seatRoleForEmail('nodomain'), null)
	assert.equal(seatRoleForEmail(''), null)
})
