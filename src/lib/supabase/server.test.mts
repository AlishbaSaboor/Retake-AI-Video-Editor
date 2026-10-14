import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

// The server-side Supabase client as a server action uses it. When Supabase
// refreshes the session (inside getUser), the client hands the new cookies to
// setAll; in a server action they're written to the response, which is what
// lets proxy.ts skip its own lookup for actions. Supabase's client and Next's
// cookie store are swapped for ones that record what happens.

type Cookie = { name: string; value: string; options?: Record<string, unknown> }
const written: Cookie[] = []
let canWrite = true
mock.module('next/headers', {
	namedExports: {
		cookies: async () => ({
			getAll: () => [{ name: 'sb-access-token', value: 'old' }],
			set: (name: string, value: string, options?: Record<string, unknown>) => {
				if (!canWrite)
					throw new Error('Cookies can only be modified in a Server Action or Route Handler.')
				written.push({ name, value, options })
			}
		})
	}
})
let adapter: { getAll: () => Cookie[]; setAll: (cookies: Cookie[]) => void } | undefined
mock.module('@supabase/ssr', {
	namedExports: {
		createServerClient: (_url: string, _key: string, options: { cookies: typeof adapter }) => {
			adapter = options.cookies
			return { auth: {} }
		}
	}
})
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

const { createServerSupabaseClient } = await import('./server')

const refreshed: Cookie[] = [
	{ name: 'sb-access-token', value: 'new', options: { httpOnly: true, sameSite: 'lax', path: '/' } }
]

test('in a server action, a refreshed session is written to the response, with its options', async () => {
	written.length = 0
	canWrite = true
	await createServerSupabaseClient()
	assert.deepEqual(adapter?.getAll(), [{ name: 'sb-access-token', value: 'old' }])
	adapter?.setAll(refreshed)
	assert.deepEqual(written, refreshed)
})

test('in a Server Component, where cookies are read-only, a refresh is skipped without an error', async () => {
	written.length = 0
	canWrite = false
	await createServerSupabaseClient()
	assert.doesNotThrow(() => adapter?.setAll(refreshed))
	assert.deepEqual(written, [])
})
