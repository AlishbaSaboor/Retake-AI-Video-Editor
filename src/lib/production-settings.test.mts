import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingProductionSettings, stopWithoutProductionSettings } from './production-settings'

const SUPABASE = {
	NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
}

test('a production server needs both Supabase settings; development, tests and the build do not', () => {
	assert.deepEqual(missingProductionSettings({ NODE_ENV: 'production' }), [
		'NEXT_PUBLIC_SUPABASE_URL',
		'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
	])
	assert.deepEqual(
		missingProductionSettings({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'x' }),
		['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
	)
	// Set but empty is missing too.
	assert.deepEqual(
		missingProductionSettings({
			NODE_ENV: 'production',
			...SUPABASE,
			NEXT_PUBLIC_SUPABASE_URL: ''
		}),
		['NEXT_PUBLIC_SUPABASE_URL']
	)
	assert.deepEqual(missingProductionSettings({ NODE_ENV: 'production', ...SUPABASE }), [])
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
		stopWithoutProductionSettings({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'x' }, stop),
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

	// Never in the build, in development or in tests, nor with both set.
	said.length = 0
	exits.length = 0
	for (const vars of [
		{ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' },
		{ NODE_ENV: 'development' },
		{ NODE_ENV: 'test' },
		{ NODE_ENV: 'production', ...SUPABASE }
	]) {
		assert.equal(stopWithoutProductionSettings(vars, stop), false, JSON.stringify(vars))
	}
	assert.deepEqual(said, [])
	assert.deepEqual(exits, [])
})
