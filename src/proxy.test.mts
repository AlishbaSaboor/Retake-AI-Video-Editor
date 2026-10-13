import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

// The proxy as Next runs it before each page, with Supabase's client swapped
// for one that counts its calls (signed out, or signed in), and next-intl's
// locale routing for a pass-through.

let getUserCalls = 0
let signedIn = false
mock.module('@supabase/ssr', {
	namedExports: {
		createServerClient: () => ({
			auth: {
				getUser: async () => {
					getUserCalls++
					return {
						data: { user: signedIn ? { id: 'u1' } : null },
						error: null
					}
				}
			}
		})
	}
})
const { NextRequest, NextResponse } = await import('next/server')
mock.module('next-intl/middleware', {
	defaultExport: () => () => NextResponse.next()
})

// Accounts on.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable'

const { default: proxy } = await import('./proxy')
const visit = async (path: string) => {
	getUserCalls = 0
	const response = await proxy(new NextRequest(new URL(path, 'http://localhost:3000')))
	return { calls: getUserCalls, location: response.headers.get('location') }
}

const PUBLIC = [
	'/',
	'/features',
	'/privacy',
	'/en/features',
	'/no-such-page',
	'/homepage',
	'/editorial'
]
const SESSION = [
	'/home',
	'/make',
	'/projects',
	'/projects/abc',
	'/editor',
	'/editor?project=1',
	'/login',
	'/admin',
	'/admin/flags',
	'/en/editor'
]

test('a public page makes no call to Supabase', async () => {
	for (const path of PUBLIC) {
		assert.deepEqual(await visit(path), { calls: 0, location: null }, path)
	}
})

test('every page that reads the session refreshes it: one call to Supabase', async () => {
	for (const path of SESSION) {
		assert.equal((await visit(path)).calls, 1, path)
	}
})

test('the sign-in guard is unchanged: signed out to sign in, signed in past it', async () => {
	signedIn = false
	assert.equal(
		(await visit('/editor?project=1')).location,
		'http://localhost:3000/login?next=%2Feditor%3Fproject%3D1'
	)
	assert.equal((await visit('/login')).location, null)
	signedIn = true
	assert.equal((await visit('/login')).location, 'http://localhost:3000/home')
	assert.equal((await visit('/editor')).location, null)
	signedIn = false
})
