import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AFTER_SIGN_IN, safeNext } from './next-path'

const ORIGIN = 'http://localhost:3000'

test('signing in goes back to a page of this site, as the browser would resolve it', () => {
	assert.equal(safeNext('/projects', ORIGIN), '/projects')
	assert.equal(safeNext('/editor?project=abc#clip-2', ORIGIN), '/editor?project=abc#clip-2')
	assert.equal(safeNext('/make', 'https://retake.example'), '/make')
	assert.equal(safeNext('/a/../projects', ORIGIN), '/projects')
})

test('anywhere else, or nothing, goes to the default page', () => {
	// String.raw: each backslash below is one real backslash, as typed in a link.
	for (const next of [
		'//evil.com',
		String.raw`/\evil.com`,
		String.raw`/\/evil.com`,
		String.raw`\\evil.com`,
		'https://evil.com',
		'http://localhost:3000.evil.com/home',
		'//evil.com/home',
		'/\t/evil.com',
		'javascript:alert(1)',
		'home',
		'',
		null
	]) {
		assert.equal(safeNext(next, ORIGIN), AFTER_SIGN_IN, JSON.stringify(next))
	}
	// The browser does read "/\" as "//": the reason the origin is checked.
	assert.equal(new URL(String.raw`/\evil.com`, ORIGIN).origin, 'http://evil.com')
})
