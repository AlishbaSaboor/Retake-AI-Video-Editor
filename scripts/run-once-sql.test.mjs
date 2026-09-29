import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	buildScript,
	fingerprint,
	parseArgs,
	redactDatabaseUrl,
	resolveDatabaseUrl
} from './run-once-sql.mjs'

const ONE_OFF = `UPDATE "plans" SET "seat_limit" = 6 WHERE "id" = 'team';\nINSERT INTO "plans" ("id", "name") VALUES ('starter', 'Starter');\n`

test('an empty or comment-only file has no version', () => {
	assert.equal(fingerprint(''), null)
	assert.equal(fingerprint('-- Run-once SQL\n-- nothing yet\n'), null)
	assert.equal(fingerprint('/* nothing\n   here -- yet */\n'), null)
})

test('a version is stable across comment and whitespace edits', () => {
	const original = fingerprint(`-- header\n${ONE_OFF}`)
	assert.equal(fingerprint(`-- a different header\n\n${ONE_OFF}`), original)
	assert.equal(fingerprint(ONE_OFF.replace(/\n/g, '\n\n').replace(/ = /g, '  =  ')), original)
	assert.equal(fingerprint(`/* block */ ${ONE_OFF} -- trailing`), original)
})

test('changing a statement is a new version', () => {
	assert.notEqual(fingerprint(ONE_OFF), fingerprint(ONE_OFF.replace('= 6', '= 7')))
	assert.notEqual(fingerprint(ONE_OFF), fingerprint(`${ONE_OFF}SELECT 1;`))
})

test('the script records the version before running the SQL, with quotes escaped', () => {
	const hash = fingerprint(ONE_OFF)
	const script = buildScript({ hash, sqlText: ONE_OFF })
	const insertPosition = script.indexOf('INSERT INTO "_run_once_sql"')
	assert.equal(insertPosition, 0)
	assert.ok(script.includes(`VALUES ('${hash}', '`))
	assert.ok(script.includes(`WHERE "id" = ''team'';`))
	assert.ok(script.endsWith(`${ONE_OFF}\n`))
})

test('an explicit --db-url wins, then DIRECT_URL, then DATABASE_URL', () => {
	const env = {
		DIRECT_URL: 'postgresql://direct@host/db',
		DATABASE_URL: 'postgresql://app@host/db'
	}
	assert.equal(
		resolveDatabaseUrl({ dbUrl: 'postgresql://flag@host/db', env }),
		'postgresql://flag@host/db'
	)
	assert.equal(resolveDatabaseUrl({ dbUrl: undefined, env }), 'postgresql://direct@host/db')
	assert.equal(
		resolveDatabaseUrl({
			dbUrl: undefined,
			env: { DIRECT_URL: '', DATABASE_URL: env.DATABASE_URL }
		}),
		'postgresql://app@host/db'
	)
	assert.equal(resolveDatabaseUrl({ dbUrl: undefined, env: {} }), undefined)
})

test('redaction drops credentials and the query string, keeps host and database', () => {
	assert.equal(
		redactDatabaseUrl(
			'postgresql://user:s3cret@db.example.com:5432/postgres?password=x&sslmode=require'
		),
		'postgresql://db.example.com:5432/postgres'
	)
	assert.equal(redactDatabaseUrl('not a url'), '<unparseable database url>')
})

test('arguments default to prisma/run-once.sql and no explicit URL', () => {
	assert.deepEqual(parseArgs([]), { dbUrl: undefined, file: 'prisma/run-once.sql' })
	assert.deepEqual(parseArgs(['--file', 'other.sql', '--db-url', 'postgresql://x@h/d']), {
		dbUrl: 'postgresql://x@h/d',
		file: 'other.sql'
	})
})
