import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	DEFAULT_LIMIT,
	formatMessages,
	isLocalDatabase,
	MAX_LIMIT,
	parseLimit,
	readLatest
} from './contact-messages.mjs'

test('reads only from a database on this machine', () => {
	for (const url of [
		'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
		'postgresql://postgres:postgres@localhost:54322/postgres',
		'postgres://u:p@[::1]:5432/db'
	]) {
		assert.equal(isLocalDatabase(url), true, url)
	}
	for (const url of [
		'postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres',
		'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
		'postgresql://u:p@127.0.0.1.example.com:5432/db',
		'postgresql://u:p@10.0.0.5:5432/db',
		'mysql://u:p@localhost:3306/db',
		'not a url',
		''
	]) {
		assert.equal(isLocalDatabase(url), false, url)
	}
})

test('prints the latest 20 by default, never more than 200, and refuses anything else', () => {
	assert.equal(DEFAULT_LIMIT, 20)
	assert.equal(parseLimit([]), 20)
	assert.equal(parseLimit(['--limit', '5']), 5)
	assert.equal(parseLimit(['--limit', String(MAX_LIMIT)]), MAX_LIMIT)
	for (const bad of ['0', '201', '-3', '2.5', 'all', undefined]) {
		assert.equal(parseLimit(bad === undefined ? ['--limit'] : ['--limit', bad]), null, bad)
	}
})

test('runs one select of the latest N, newest first, without the hashed IP, and writes nothing', async () => {
	const calls = []
	const record =
		(name) =>
		async (...args) => {
			calls.push({ name, args })
			return []
		}
	// Every method a Prisma model has: only a read may be called.
	const model = Object.fromEntries(
		[
			'findMany',
			'findFirst',
			'findUnique',
			'count',
			'create',
			'createMany',
			'update',
			'updateMany',
			'upsert',
			'delete',
			'deleteMany'
		].map((name) => [name, record(name)])
	)
	await readLatest({ contactMessage: model, $executeRaw: record('$executeRaw') }, 7)
	assert.deepEqual(calls, [
		{
			name: 'findMany',
			args: [
				{
					select: { createdAt: true, name: true, email: true, message: true },
					orderBy: { createdAt: 'desc' },
					take: 7
				}
			]
		}
	])
	// Nothing in the script itself writes, or reads the hashed IP.
	const source = readFileSync(new URL('./contact-messages.mjs', import.meta.url), 'utf-8')
	assert.doesNotMatch(
		source,
		/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$execute|\$queryRaw/
	)
	assert.doesNotMatch(source, /ipHash: true|ip_hash/)
})

test('formats each message as its date, name, email and text, newest first', () => {
	assert.equal(formatMessages([]), 'No contact messages yet.')
	assert.equal(
		formatMessages([
			{
				createdAt: new Date('2026-10-13T14:02:59Z'),
				name: 'Sam',
				email: 'sam@example.com',
				message: '[feedback] Love it.'
			},
			{
				createdAt: new Date('2026-10-12T09:30:00Z'),
				name: null,
				email: 'x@example.com',
				message: '[bug] Export stalls.\nOn Firefox.'
			}
		]),
		[
			'2 latest contact messages, newest first:',
			'2026-10-13 14:02 UTC · Sam <sam@example.com>\n[feedback] Love it.',
			'2026-10-12 09:30 UTC · (no name) <x@example.com>\n[bug] Export stalls.\nOn Firefox.'
		].join('\n\n')
	)
	assert.match(
		formatMessages([{ createdAt: new Date(0), name: 'A', email: 'a@b.c', message: 'hi' }]),
		/^1 latest contact message, newest first:/
	)
})
