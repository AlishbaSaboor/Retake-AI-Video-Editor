import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_AI_LIMITS } from '@/lib/ai-limits'
import { assertLocalDatabase } from '@/server/db/local-database'

// The daily allowance against real Postgres (`pnpm test:db`; CI's db-tests
// job): many requests at once, as the server receives them. What keeps the
// ceiling is Postgres's own behaviour, which an in-memory fake can only
// imitate: the conditional update applied under the row's lock, and the
// primary key that refuses a second "first call of the day" (P2002). Each
// run uses users of its own and deletes their rows after.

assertLocalDatabase(process.env.DATABASE_URL)
const { db } = await import('@/server/db/client')
const { giveBackAllowance, takeAllowance, utcDay } = await import('./ai-allowance')

const users: string[] = []
const newUser = () => {
	const id = randomUUID()
	users.push(id)
	return id
}
const used = async (userId: string, day: Date, kind: string) =>
	(await db.aiAllowance.findUnique({ where: { userId_day_kind: { userId, day, kind } } }))?.used ??
	0

after(async () => {
	await db.aiAllowance.deleteMany({ where: { userId: { in: users } } })
	await db.$disconnect()
})

const NOW = new Date('2026-10-13T12:00:00Z')

test('many first calls of the day at once: exactly the ceiling is taken, the rest refused', async () => {
	for (const kind of ['make_it', 'transcript', 'highlights'] as const) {
		const userId = newUser()
		const ceiling = DAILY_AI_LIMITS[kind].perDay
		const results = await Promise.all(
			Array.from({ length: ceiling + 25 }, () => takeAllowance(userId, kind, NOW))
		)
		const taken = results.filter((day) => day !== null)
		assert.equal(taken.length, ceiling, kind)
		assert.equal(results.length - taken.length, 25, kind)
		assert.ok(
			taken.every((day) => day?.getTime() === utcDay(NOW).getTime()),
			kind
		)
		assert.equal(await used(userId, utcDay(NOW), kind), ceiling, kind)
	}
})

test('with some used already, requests at once take only what is left', async () => {
	const userId = newUser()
	const ceiling = DAILY_AI_LIMITS.highlights.perDay
	for (let i = 0; i < ceiling - 3; i++) assert.ok(await takeAllowance(userId, 'highlights', NOW))
	const results = await Promise.all(
		Array.from({ length: 20 }, () => takeAllowance(userId, 'highlights', NOW))
	)
	assert.equal(results.filter((day) => day !== null).length, 3)
	assert.equal(await used(userId, utcDay(NOW), 'highlights'), ceiling)
})

test('given back at once, each one frees exactly one, and never below zero', async () => {
	const userId = newUser()
	const day = utcDay(NOW)
	const ceiling = DAILY_AI_LIMITS.transcript.perDay
	await Promise.all(Array.from({ length: ceiling }, () => takeAllowance(userId, 'transcript', NOW)))
	assert.equal(await takeAllowance(userId, 'transcript', NOW), null)
	await Promise.all(Array.from({ length: 5 }, () => giveBackAllowance(userId, 'transcript', day)))
	assert.equal(await used(userId, day, 'transcript'), ceiling - 5)
	const again = await Promise.all(
		Array.from({ length: 12 }, () => takeAllowance(userId, 'transcript', NOW))
	)
	assert.equal(again.filter((taken) => taken !== null).length, 5)
	// More given back than was taken stops at zero.
	await Promise.all(
		Array.from({ length: ceiling + 10 }, () => giveBackAllowance(userId, 'transcript', day))
	)
	assert.equal(await used(userId, day, 'transcript'), 0)
})

test('each user, kind and UTC day has its own count', async () => {
	const [a, b] = [newUser(), newUser()]
	const ceiling = DAILY_AI_LIMITS.highlights.perDay
	await Promise.all([
		...Array.from({ length: ceiling }, () => takeAllowance(a, 'highlights', NOW)),
		...Array.from({ length: 4 }, () => takeAllowance(b, 'highlights', NOW)),
		...Array.from({ length: 2 }, () => takeAllowance(a, 'transcript', NOW))
	])
	assert.equal(await takeAllowance(a, 'highlights', NOW), null)
	assert.equal(await used(b, utcDay(NOW), 'highlights'), 4)
	assert.equal(await used(a, utcDay(NOW), 'transcript'), 2)
	// Midnight UTC: a new day, a new count.
	const tomorrow = new Date('2026-10-14T00:00:00Z')
	assert.ok(await takeAllowance(a, 'highlights', tomorrow))
	assert.equal(await used(a, utcDay(tomorrow), 'highlights'), 1)
})
