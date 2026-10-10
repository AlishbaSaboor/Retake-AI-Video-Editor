import { test } from 'node:test'
import assert from 'node:assert/strict'

// env.ts checks process.env as it loads: each load below is a fresh copy of
// the module (its own query string), under the variables set just before.
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
const SUPABASE = {
	NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
}
// A placeholder key, not a real one.
const KEY = 'test-key-'.repeat(4)

let copy = 0
/** Loads env.ts as a server starting with `vars` would. */
async function load(vars: Record<string, string | undefined>) {
	const saved = { ...process.env }
	Object.assign(process.env, vars)
	for (const [name, value] of Object.entries(vars))
		if (value === undefined) delete process.env[name]
	try {
		return await import(`./env.ts?copy=${++copy}`)
	} finally {
		for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name]
		Object.assign(process.env, saved)
	}
}

test('production without the Supabase settings stops at load, saying what to set', async () => {
	await assert.rejects(
		load({
			NODE_ENV: 'production',
			NEXT_PUBLIC_SUPABASE_URL: undefined,
			NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
			CONTACT_IP_SECRET: KEY
		}),
		{
			message:
				"Accounts aren't set up: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in production, or every paid AI action refuses. Set them, then start again."
		}
	)
	// With them, it loads; and the build loads without them.
	await load({ NODE_ENV: 'production', ...SUPABASE, CONTACT_IP_SECRET: KEY })
	await load({
		NODE_ENV: 'production',
		NEXT_PHASE: 'phase-production-build',
		NEXT_PUBLIC_SUPABASE_URL: undefined,
		NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined
	})
})

test("the contact form's key: required for a production server, and never a short, typed one", async () => {
	await assert.rejects(
		load({ NODE_ENV: 'production', ...SUPABASE, CONTACT_IP_SECRET: undefined }),
		{
			message:
				"The contact form's limit isn't set up: CONTACT_IP_SECRET must be set in production, or one sender can't be told from another. Set them, then start again."
		}
	)
	// Under 32 characters: refused wherever it's set.
	await assert.rejects(load({ CONTACT_IP_SECRET: 'too-short' }), {
		message: 'Invalid environment variables — see console output above'
	})
	// Optional outside production.
	await load({ NODE_ENV: 'development', CONTACT_IP_SECRET: undefined })
})
