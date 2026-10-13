import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'

// The Contact us action as the server runs it (validatedAction, the schema,
// the honeypot, the per-sender limit), with only what can't run under `node
// --test` swapped out: Next's request headers (the IP the host passes on), the
// database (kept in memory, answering the same count and create), the logger
// and Sentry. How a real host passes the client's IP isn't covered here.

type Row = {
	name: string | null
	email: string
	message: string
	ipHash: string | null
	createdAt: Date
}
const rows: Row[] = []
/** The x-forwarded-for header of the next request; null for none. */
let forwardedFor: string | null = '203.0.113.7'
const logged: Array<Record<string, unknown>> = []

mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module('next/headers', {
	namedExports: {
		headers: async () =>
			new Headers(forwardedFor === null ? {} : { 'x-forwarded-for': forwardedFor })
	}
})
const contactMessage = {
	count: async ({ where }: { where: { ipHash: string | null; createdAt: { gt: Date } } }) =>
		rows.filter((row) => row.ipHash === where.ipHash && row.createdAt > where.createdAt.gt).length,
	create: async ({ data }: { data: Omit<Row, 'createdAt'> }) => {
		rows.push({ ...data, createdAt: new Date() })
		return data
	}
}
mock.module(import.meta.resolve('@/server/db/client'), {
	namedExports: {
		// As the real module exports it (validatedAction's AI allowance reads it; contact never does).
		Prisma: { PrismaClientKnownRequestError: class extends Error {} },
		db: {
			contactMessage,
			$transaction: (body: (tx: { contactMessage: typeof contactMessage }) => Promise<unknown>) =>
				body({ contactMessage })
		}
	}
})
// A placeholder key, not a real one.
let key: string | undefined = 'test-key-'.repeat(4)
mock.module(import.meta.resolve('@/lib/env'), {
	namedExports: {
		env: {
			get CONTACT_IP_SECRET() {
				return key
			}
		}
	}
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: {
		log: { warn: (_: string, fields: Record<string, unknown>) => logged.push(fields) }
	}
})
mock.module(import.meta.resolve('@/lib/observability/capture-error'), {
	namedExports: { captureError: (error: unknown) => normalizeError(error) }
})
mock.module(import.meta.resolve('@/lib/rbac/context'), {
	namedExports: { enforceAuthorize: async () => ({}) }
})
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: { createServerSupabaseClient: async () => ({}) }
})

const { sendContactMessage } = await import('./actions')

const REFUSED = {
	ok: false,
	error: "Your message couldn't be sent right now. Please try again later.",
	status: 429
}
const message = (fields: Record<string, unknown> = {}) =>
	sendContactMessage({
		name: 'Sam',
		email: 'sam@example.com',
		topic: 'question',
		message: 'Hello',
		...fields
	})

/** A fresh start: no messages, a known sender, the key set, the clock at a fixed time. */
function reset() {
	rows.length = 0
	logged.length = 0
	forwardedFor = '203.0.113.7'
	key = 'test-key-'.repeat(4)
	mock.timers.reset()
	mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-11T10:00:00Z') })
}

test('a normal message is kept, with a keyed hash of the sender, never their IP', async () => {
	reset()
	assert.deepEqual(await message(), { ok: true, data: null })
	assert.equal(rows.length, 1)
	assert.equal(rows[0]?.message, '[question] Hello')
	assert.match(rows[0]?.ipHash ?? '', /^[0-9a-f]{64}$/)
	assert.ok(!JSON.stringify(rows).includes('203.0.113.7'), 'the IP is not stored')
	// The hidden field, left empty as a person leaves it.
	assert.deepEqual(await message({ website: '' }), { ok: true, data: null })
})

test('a filled-in hidden field is refused, plainly, and nothing is kept', async () => {
	reset()
	assert.deepEqual(await message({ website: 'https://spam.example' }), REFUSED)
	assert.equal(rows.length, 0)
	assert.deepEqual(logged, [{ check: 'honeypot' }])
})

test('one sender is refused after 5 in an hour, the same way; others still get through; an hour on, they may again', async () => {
	reset()
	for (let i = 0; i < 5; i++)
		assert.deepEqual(await message(), { ok: true, data: null }, `message ${i + 1}`)
	// The 6th: refused exactly as the hidden field is, so a bot can't tell which.
	assert.deepEqual(await message(), REFUSED)
	assert.equal(rows.length, 5)
	// Another sender isn't held up by this one.
	forwardedFor = '198.51.100.9'
	assert.deepEqual(await message(), { ok: true, data: null })
	// Nor is anyone pretending, in front of the host's own entry, to be someone else.
	forwardedFor = '198.51.100.10, 203.0.113.7'
	assert.deepEqual(await message(), REFUSED)
	// Just inside the hour: still refused. Past it: allowed again.
	forwardedFor = '203.0.113.7'
	mock.timers.tick(60 * 60 * 1000 - 1)
	assert.deepEqual(await message(), REFUSED)
	mock.timers.tick(2)
	assert.deepEqual(await message(), { ok: true, data: null })
})

test("senders who can't be told apart (no IP, or no key) share one limit of 30 an hour", async () => {
	reset()
	forwardedFor = null
	for (let i = 0; i < 20; i++) assert.deepEqual(await message(), { ok: true, data: null })
	// No key: unknown too, the same shared count.
	forwardedFor = '203.0.113.7'
	key = undefined
	for (let i = 0; i < 10; i++) assert.deepEqual(await message(), { ok: true, data: null })
	assert.deepEqual(await message(), REFUSED)
	assert.ok(rows.every((row) => row.ipHash === null))
	assert.deepEqual(logged.at(-1), { check: 'limit', shared: true })
	mock.timers.reset()
})
