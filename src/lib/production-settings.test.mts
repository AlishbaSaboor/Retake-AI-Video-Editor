import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingProductionSettings, stopWithoutProductionSettings } from './production-settings'

const SUPABASE = {
	NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
}
// A placeholder key, not a real one.
const KEY = 'test-key-'.repeat(4)
/** Everything a production server needs. */
const ALL = { ...SUPABASE, CONTACT_IP_SECRET: KEY }

test('a production server needs both Supabase settings; development, tests and the build do not', () => {
	assert.deepEqual(missingProductionSettings({ NODE_ENV: 'production' }), [
		'NEXT_PUBLIC_SUPABASE_URL',
		'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
		'CONTACT_IP_SECRET'
	])
	assert.deepEqual(
		missingProductionSettings({
			NODE_ENV: 'production',
			NEXT_PUBLIC_SUPABASE_URL: 'x',
			CONTACT_IP_SECRET: KEY
		}),
		['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
	)
	// The contact form's key, on its own.
	assert.deepEqual(missingProductionSettings({ NODE_ENV: 'production', ...SUPABASE }), [
		'CONTACT_IP_SECRET'
	])
	// Set but empty is missing too.
	assert.deepEqual(
		missingProductionSettings({
			NODE_ENV: 'production',
			...ALL,
			NEXT_PUBLIC_SUPABASE_URL: ''
		}),
		['NEXT_PUBLIC_SUPABASE_URL']
	)
	assert.deepEqual(missingProductionSettings({ NODE_ENV: 'production', ...ALL }), [])
	for (const NODE_ENV of ['development', 'test', undefined]) {
		assert.deepEqual(missingProductionSettings({ NODE_ENV }), [], String(NODE_ENV))
	}
	assert.deepEqual(
		missingProductionSettings({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
		[]
	)
})

test('at boot, production without them logs which to set and exits with a non-zero code', () => {
	const said: Array<{ message: string; missing: string[] }> = []
	const exits: number[] = []
	const stop = {
		error: (message: string, fields: { missing: string[] }) =>
			void said.push({ message, ...fields }),
		exit: (code: number) => void exits.push(code)
	}
	assert.equal(
		stopWithoutProductionSettings(
			{ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'x', CONTACT_IP_SECRET: KEY },
			stop
		),
		true
	)
	assert.deepEqual(said, [
		{
			message:
				"Accounts aren't set up: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in production, or every paid AI action refuses. Set them, then start again.",
			missing: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
		}
	])
	assert.deepEqual(exits, [1])

	// The contact form's key missing too: a sentence for each, then what to do.
	said.length = 0
	stopWithoutProductionSettings({ NODE_ENV: 'production' }, stop)
	assert.deepEqual(said, [
		{
			message:
				"Accounts aren't set up: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in production, or every paid AI action refuses. The contact form's limit isn't set up: CONTACT_IP_SECRET must be set in production, or one sender can't be told from another. Set them, then start again.",
			missing: [
				'NEXT_PUBLIC_SUPABASE_URL',
				'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
				'CONTACT_IP_SECRET'
			]
		}
	])
	assert.deepEqual(exits, [1, 1])

	// Never in the build, in development or in tests, nor with everything set.
	said.length = 0
	exits.length = 0
	for (const vars of [
		{ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' },
		{ NODE_ENV: 'development' },
		{ NODE_ENV: 'test' },
		{ NODE_ENV: 'production', ...ALL }
	]) {
		assert.equal(stopWithoutProductionSettings(vars, stop), false, JSON.stringify(vars))
	}
	assert.deepEqual(said, [])
	assert.deepEqual(exits, [])
})
