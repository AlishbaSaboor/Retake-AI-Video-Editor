import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertLocalDatabase } from './local-database'

test('the database tests run only against a database on this machine', () => {
	for (const url of [
		'postgresql://postgres:postgres@localhost:5432/postgres',
		'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
		'postgres://u:p@[::1]:5432/db'
	]) {
		assert.doesNotThrow(() => assertLocalDatabase(url), url)
	}
	for (const url of [
		'postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres',
		'postgresql://u:p@127.0.0.1.example.com:5432/db',
		'postgresql://u:p@10.0.0.5:5432/db'
	]) {
		assert.throws(() => assertLocalDatabase(url), /Refused/, url)
	}
})

test('no database, or a malformed one, fails rather than letting the tests pass unrun', () => {
	assert.throws(() => assertLocalDatabase(undefined), /DATABASE_URL is not set/)
	assert.throws(() => assertLocalDatabase(''), /DATABASE_URL is not set/)
	assert.throws(() => assertLocalDatabase('not a url'), /not a valid URL/)
})
