import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'
import { SENDER_LIMIT } from './contact-limit'

// The Contact us limit when sends arrive at once. The database is kept in
// memory and behaves as Postgres does under Serializable isolation for this
// pattern: of two transactions that each counted a sender's messages and
// then wrote one, the second to commit is aborted (P2034), since its count is
// out of date. Every call pauses as a round trip does, so simultaneous sends
// interleave. Real Postgres is not covered here.

type Row = { ipHash: string | null; createdAt: Date }
const rows: Row[] = []
/** Each committed write: the sender, and when (a commit counter). */
const commits: Array<{ ipHash: string | null; at: number }> = []
let clock = 0
/** The options each transaction was opened with. */
const opened: Array<unknown> = []
/** Make every write fail as overlapped, whatever happened. */
let alwaysOverlap = false

const roundTrip = () => new Promise((resolve) => setImmediate(resolve))
class KnownRequestError extends Error {
	code: string
	constructor(code: string) {
		super(code)
		this.code = code
	}
}
const countFor = (where: { ipHash: string | null; createdAt: { gt: Date } }) =>
	rows.filter((row) => row.ipHash === where.ipHash && row.createdAt > where.createdAt.gt).length

mock.module(import.meta.resolve('@/server/db/client'), {
	namedExports: {
		Prisma: { PrismaClientKnownRequestError: KnownRequestError },
		db: {
			// Outside a transaction: no protection at all, as Postgres gives none.
			contactMessage: {
				count: async ({ where }: { where: { ipHash: string | null; createdAt: { gt: Date } } }) => {
					await roundTrip()
					return countFor(where)
				},
				create: async ({ data }: { data: { ipHash: string | null } }) => {
					await roundTrip()
					rows.push({ ipHash: data.ipHash, createdAt: new Date() })
					return data
				}
			},
			$transaction: async <T,>(
				body: (tx: unknown) => Promise<T>,
				options: { isolationLevel?: string }
			): Promise<T> => {
				opened.push(options)
				const started = clock
				const read = new Set<string | null>()
				const written: Row[] = []
				const tx = {
					contactMessage: {
						count: async ({
							where
						}: {
							where: { ipHash: string | null; createdAt: { gt: Date } }
						}) => {
							await roundTrip()
							read.add(where.ipHash)
							return countFor(where)
						},
						create: async ({ data }: { data: { ipHash: string | null } }) => {
							await roundTrip()
							written.push({ ipHash: data.ipHash, createdAt: new Date() })
							return data
						}
					}
				}
				const result = await body(tx)
				await roundTrip()
				const stale = commits.some((commit) => commit.at > started && read.has(commit.ipHash))
				if (
					written.length > 0 &&
					(alwaysOverlap || (options.isolationLevel === 'Serializable' && stale))
				) {
					throw new KnownRequestError('P2034')
				}
				clock++
				for (const row of written) {
					rows.push(row)
					commits.push({ ipHash: row.ipHash, at: clock })
				}
				return result
			}
		}
	}
})
mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module('next/headers', {
	namedExports: { headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }) }
})
mock.module(import.meta.resolve('@/lib/env'), {
	// A placeholder key, not a real one.
	namedExports: { env: { CONTACT_IP_SECRET: 'test-key-'.repeat(4) } }
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: { log: { warn: () => {}, info: () => {}, error: () => {} } }
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

const send = () =>
	sendContactMessage({
		name: 'Sam',
		email: 'sam@example.com',
		topic: 'question',
		message: 'Hello there, a question.',
		website: ''
	})
const REFUSED = {
	ok: false,
	error: "Your message couldn't be sent right now. Please try again later.",
	status: 429
}
const reset = () => {
	rows.length = 0
	commits.length = 0
	opened.length = 0
	alwaysOverlap = false
}

test('the count and the insert run in one Serializable transaction', async () => {
	reset()
	assert.equal((await send()).ok, true)
	assert.deepEqual(opened, [{ isolationLevel: 'Serializable' }])
	assert.equal(rows.length, 1)
})

test('sends from one sender at once never get past the limit together; each is kept or refused', async () => {
	for (const count of [SENDER_LIMIT + 1, SENDER_LIMIT * 2, SENDER_LIMIT * 4]) {
		reset()
		const results = await Promise.all(Array.from({ length: count }, send))
		const kept = results.filter((result) => result.ok).length
		assert.ok(kept >= 1 && kept <= SENDER_LIMIT, `${count} at once: ${kept} kept`)
		assert.equal(rows.length, kept)
		// Never a server error: whatever isn't kept is refused, plainly.
		assert.deepEqual(
			results.filter((result) => !result.ok),
			Array(count - kept).fill(REFUSED)
		)
	}
})

test('one after another, the sender gets exactly the limit', async () => {
	reset()
	for (let i = 0; i < SENDER_LIMIT; i++) assert.equal((await send()).ok, true)
	assert.deepEqual(await send(), REFUSED)
	assert.equal(rows.length, SENDER_LIMIT)
})

test('two sends at once under the limit are both kept, the overlapped one tried again', async () => {
	reset()
	const results = await Promise.all([send(), send()])
	assert.deepEqual(
		results.map((result) => result.ok),
		[true, true]
	)
	assert.equal(rows.length, 2)
	assert.ok(opened.length > 2, 'the overlapped send was tried again')
})

test('a send that still overlaps after three tries is refused plainly, and never kept', async () => {
	reset()
	alwaysOverlap = true
	assert.deepEqual(await send(), REFUSED)
	assert.equal(opened.length, 3)
	assert.equal(rows.length, 0)
})
