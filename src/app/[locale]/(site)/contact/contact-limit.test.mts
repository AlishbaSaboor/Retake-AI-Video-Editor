import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientIp, limitFor, SENDER_LIMIT, senderHash, SHARED_LIMIT } from './contact-limit'

// A placeholder key, not a real one (a real one is random: openssl rand -hex 32).
const KEY = 'test-key-'.repeat(4)

test("the client's IP is the last address in x-forwarded-for: the one the host wrote", () => {
	assert.equal(clientIp('203.0.113.7'), '203.0.113.7')
	// A client can only put addresses before the host's; those are ignored.
	assert.equal(clientIp('1.2.3.4, 203.0.113.7'), '203.0.113.7')
	assert.equal(clientIp(' 2001:db8::1 '), '2001:db8::1')
	for (const none of [null, '', ' ', '1.2.3.4, ']) assert.equal(clientIp(none), null, String(none))
})

test('a sender is kept as a keyed hash of their IP, never the IP; unknown without the IP or the key', () => {
	const hash = senderHash('203.0.113.7', KEY)
	assert.match(hash ?? '', /^[0-9a-f]{64}$/)
	assert.ok(!hash?.includes('203'))
	// The same sender counts as the same; another IP, or another key, doesn't.
	assert.equal(senderHash('203.0.113.7', KEY), hash)
	assert.notEqual(senderHash('203.0.113.8', KEY), hash)
	assert.notEqual(senderHash('203.0.113.7', `${KEY}x`), hash)
	assert.equal(senderHash(null, KEY), null)
	assert.equal(senderHash('203.0.113.7', undefined), null)
	assert.equal(senderHash('203.0.113.7', ''), null)
})

test('a known sender gets the sender limit; everyone unknown shares the larger, shared one', () => {
	assert.equal(limitFor('abc'), SENDER_LIMIT)
	assert.equal(limitFor(null), SHARED_LIMIT)
	assert.equal(SENDER_LIMIT, 5)
	assert.equal(SHARED_LIMIT, 30)
})
