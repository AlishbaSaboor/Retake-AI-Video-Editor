import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRlsState } from './check-rls.mjs'

const locked = (name) => ({ name, isEnabled: true, isForced: false, policyCount: 0 })

test('passes when every table has RLS enabled, no policies and no FORCE', () => {
	const result = evaluateRlsState([locked('users'), locked('admin_members')])
	assert.deepEqual(result, { ok: true, problems: [] })
})

test('names a table without RLS and says how to fix it', () => {
	const result = evaluateRlsState([locked('users'), { ...locked('ai_usage'), isEnabled: false }])
	assert.equal(result.ok, false)
	assert.equal(result.problems.length, 1)
	assert.match(result.problems[0], /^ai_usage: RLS is not enabled/)
	assert.match(result.problems[0], /ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY/)
})

test('fails on FORCE, which would lock Prisma out', () => {
	const result = evaluateRlsState([{ ...locked('users'), isForced: true }])
	assert.equal(result.ok, false)
	assert.match(result.problems[0], /users: FORCE ROW LEVEL SECURITY is on/)
})

test('fails on a policy even when RLS is enabled', () => {
	const result = evaluateRlsState([{ ...locked('users'), policyCount: 2 }])
	assert.equal(result.ok, false)
	assert.match(result.problems[0], /users: has 2 RLS policies/)
})

test("ignores Prisma's own bookkeeping table", () => {
	const result = evaluateRlsState([
		locked('users'),
		{ ...locked('_prisma_migrations'), isEnabled: false }
	])
	assert.equal(result.ok, true)
})

test('an exempt table may lack RLS but still may not be forced or carry policies', () => {
	const exemptTables = ['public_config']
	const unlocked = evaluateRlsState([{ ...locked('public_config'), isEnabled: false }], {
		exemptTables
	})
	assert.equal(unlocked.ok, true)

	const forced = evaluateRlsState(
		[{ ...locked('public_config'), isEnabled: false, isForced: true }],
		{
			exemptTables
		}
	)
	assert.equal(forced.ok, false)

	const withPolicy = evaluateRlsState([{ ...locked('public_config'), policyCount: 1 }], {
		exemptTables
	})
	assert.equal(withPolicy.ok, false)
})

test('refuses to pass an empty database — a check that finds nothing has not checked anything', () => {
	const result = evaluateRlsState([])
	assert.equal(result.ok, false)
	assert.match(result.problems[0], /no tables/)
})
