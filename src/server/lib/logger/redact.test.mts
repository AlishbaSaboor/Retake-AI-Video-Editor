import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redact } from './redact'

test('redacts by key name whatever the casing convention', () => {
	const result = redact({
		AIRSCALE_API_KEY: 'live-key',
		apiKey: 'live-key',
		'x-api-key': 'live-key',
		Authorization: 'Bearer abc',
		cookie: 'session=1',
		password: 'hunter2',
		service: 'apple'
	})
	assert.deepEqual(result, {
		AIRSCALE_API_KEY: '[redacted]',
		apiKey: '[redacted]',
		'x-api-key': '[redacted]',
		Authorization: '[redacted]',
		cookie: '[redacted]',
		password: '[redacted]',
		service: 'apple'
	})
})

test('leaves a key that merely contains a sensitive substring alone', () => {
	assert.deepEqual(redact({ monkey: 'fine', keyword: 'fine', tokenizer: 'fine' }), {
		monkey: 'fine',
		keyword: 'fine',
		tokenizer: 'fine'
	})
})

test('redacts through nesting and inside arrays', () => {
	const result = redact({
		run: { source: 'play', vendors: [{ name: 'store-apps', apiKey: 'abc' }] },
		credentials: { anything: 'inside is gone' }
	})
	assert.deepEqual(result, {
		run: { source: 'play', vendors: [{ name: 'store-apps', apiKey: '[redacted]' }] },
		credentials: '[redacted]'
	})
})

test('survives a cycle', () => {
	const node: Record<string, unknown> = { name: 'root' }
	node.self = node
	assert.deepEqual(redact(node), { name: 'root', self: '[circular]' })
})

test('reports the same object twice without calling the second one a cycle', () => {
	const shared = { source: 'apple' }
	assert.deepEqual(redact({ first: shared, second: shared }), {
		first: { source: 'apple' },
		second: { source: 'apple' }
	})
})

test('scrubs the password out of a connection string', () => {
	assert.equal(
		redact('postgresql://postgres:s3cr3t@db.example.com:6543/postgres?pgbouncer=true'),
		'postgresql://postgres:[redacted]@db.example.com:6543/postgres?pgbouncer=true'
	)
})

test('scrubs a credential carried in a query string', () => {
	assert.equal(
		redact('https://store-apps.test/top-free-apps?region=us&api_key=live-key&limit=100'),
		'https://store-apps.test/top-free-apps?region=us&api_key=[redacted]&limit=100'
	)
})

test('scrubs an authorization scheme wherever it appears in a string', () => {
	assert.deepEqual(redact({ detail: 'rejected header Bearer eyJhbGciOi.J9' }), {
		detail: 'rejected header Bearer [redacted]'
	})
})

test('masks an address buried in a sentence, keeping the domain', () => {
	assert.equal(
		redact('Airscale rejected the contact jane.doe+work@example.co.uk (invalid mailbox).'),
		'Airscale rejected the contact j***@example.co.uk (invalid mailbox).'
	)
})

test('masks addresses nested in objects and arrays', () => {
	assert.deepEqual(
		redact({
			err: { message: 'bounce for owner@acme.io' },
			recipients: ['first@acme.io', { note: 'cc second@acme.io' }]
		}),
		{
			err: { message: 'bounce for o***@acme.io' },
			recipients: ['f***@acme.io', { note: 'cc s***@acme.io' }]
		}
	)
})

test('leaves a string with no address alone', () => {
	assert.equal(redact('gather completed for play in 4213ms'), 'gather completed for play in 4213ms')
})

test('leaves version strings, file paths and plain URLs unmangled', () => {
	assert.deepEqual(
		redact({
			pinned: 'next@16.3.0',
			scoped: '@8x/email-marketing@1.2.3',
			windows: 'C:\\Users\\dev\\app@2.0\\bin',
			posix: '/var/log/app@2/out.log',
			url: 'https://store-apps.test/top-free-apps?region=us&limit=100'
		}),
		{
			pinned: 'next@16.3.0',
			scoped: '@8x/email-marketing@1.2.3',
			windows: 'C:\\Users\\dev\\app@2.0\\bin',
			posix: '/var/log/app@2/out.log',
			url: 'https://store-apps.test/top-free-apps?region=us&limit=100'
		}
	)
})

test('masks an address without weakening the connection-string rule', () => {
	assert.equal(
		redact('postgresql://postgres:s3cr3t@db.example.com:6543/postgres?pgbouncer=true'),
		'postgresql://postgres:[redacted]@db.example.com:6543/postgres?pgbouncer=true'
	)
})

test('leaves a value that is not a plain object or array untouched', () => {
	const at = new Date('2026-08-18T00:00:00.000Z')
	assert.equal(redact(at), at)
	assert.equal(redact(42), 42)
	assert.equal(redact(null), null)
})
