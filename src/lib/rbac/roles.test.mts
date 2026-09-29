import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	ALL_PERMISSIONS,
	DANGEROUS_PERMISSIONS,
	NON_SENSITIVE_READS,
	READ_PERMISSIONS
} from './permissions'
import { effectivePermissions, permissionsForRole, ROLE_RANK } from './roles'

test('read_only holds only non-sensitive reads — no writes, no sensitive reads', () => {
	const perms = permissionsForRole('read_only')
	assert.deepEqual([...perms].sort(), [...NON_SENSITIVE_READS].sort())

	const sensitiveReads = READ_PERMISSIONS.filter((p) => !NON_SENSITIVE_READS.includes(p))
	assert.ok(
		sensitiveReads.length > 0,
		'catalog should have at least one sensitive read to test against'
	)
	for (const p of sensitiveReads) {
		assert.ok(!perms.includes(p), `read_only must exclude sensitive read ${p}`)
	}
	for (const p of DANGEROUS_PERMISSIONS) assert.ok(!perms.includes(p))
})

test('admin holds everything except dangerous', () => {
	const perms = permissionsForRole('admin')
	for (const p of DANGEROUS_PERMISSIONS) {
		assert.ok(!perms.includes(p), `admin must exclude dangerous ${p}`)
	}
	const expected = ALL_PERMISSIONS.filter((p) => !DANGEROUS_PERMISSIONS.includes(p))
	assert.deepEqual([...perms].sort(), [...expected].sort())
})

test('super_admin is the wildcard — every permission', () => {
	assert.deepEqual([...permissionsForRole('super_admin')].sort(), [...ALL_PERMISSIONS].sort())
})

test('roles are nested supersets: read_only ⊂ support ⊂ admin ⊂ super_admin', () => {
	const chain = ['read_only', 'support', 'admin', 'super_admin'] as const
	for (let i = 0; i < chain.length - 1; i++) {
		const lower = new Set(permissionsForRole(chain[i]))
		const higher = new Set(permissionsForRole(chain[i + 1]))
		for (const p of lower) {
			assert.ok(higher.has(p), `${chain[i + 1]} must contain ${p} held by ${chain[i]}`)
		}
		assert.ok(higher.size > lower.size, `${chain[i + 1]} must be a strict superset of ${chain[i]}`)
	}
})

test('ROLE_RANK orders the ladder', () => {
	assert.ok(ROLE_RANK.read_only < ROLE_RANK.support)
	assert.ok(ROLE_RANK.support < ROLE_RANK.admin)
	assert.ok(ROLE_RANK.admin < ROLE_RANK.super_admin)
})

test('effectivePermissions unions the tier with additive grants, sanitizing unknowns', () => {
	const base = permissionsForRole('read_only')
	const eff = effectivePermissions({
		role: 'read_only',
		permissionGrants: ['content.write', 'not_a_real_key']
	})
	assert.ok(eff.includes('content.write'), 'a valid grant is added on top of the tier')
	for (const p of base) assert.ok(eff.includes(p), 'the whole role tier is retained')
	assert.ok(!eff.some((p) => (p as string) === 'not_a_real_key'), 'unknown keys are sanitized out')
	assert.equal(eff.length, new Set(eff).size, 'no duplicates')
})

test('grants are additive-only — they never shrink super_admin', () => {
	const eff = effectivePermissions({ role: 'super_admin', permissionGrants: [] })
	assert.deepEqual([...eff].sort(), [...ALL_PERMISSIONS].sort())
})
