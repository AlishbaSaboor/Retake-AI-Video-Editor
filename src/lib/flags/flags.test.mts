import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FLAGS, isBooleanFlag, isFlagKey, isVariantOf, type FlagKey } from './flags'

test('every flag has a known kind, a description, an owner, and a well-formed default', () => {
	const kinds = new Set(['release', 'ops', 'experiment', 'module', 'permission'])
	for (const [key, def] of Object.entries(FLAGS)) {
		assert.ok(kinds.has(def.kind), `${key}.kind "${def.kind}" is not a known FlagKind`)
		assert.ok(def.description.length > 0, `${key} should have a non-empty description`)
		assert.ok(def.owner.length > 0, `${key} should have a non-empty owner`)

		if ('variants' in def) {
			// A variant/experiment flag: non-empty tuple, string default that IS a
			// declared variant.
			assert.ok(def.variants.length > 0, `${key} should declare at least one variant`)
			assert.equal(typeof def.default, 'string', `${key}.default should be a variant string`)
			assert.ok(
				(def.variants as readonly string[]).includes(def.default as string),
				`${key}.default "${def.default}" must be one of its variants`
			)
		} else {
			assert.equal(typeof def.default, 'boolean', `${key}.default should be a boolean`)
		}
	}
})

test('an experiment flag leads with control so PostHog has a baseline', () => {
	for (const [key, def] of Object.entries(FLAGS)) {
		if ('type' in def && def.type === 'experiment') {
			assert.equal(def.variants[0], 'control', `${key} (experiment) must lead with 'control'`)
		}
	}
})

test('isBooleanFlag distinguishes on/off flags from variant flags', () => {
	assert.equal(isBooleanFlag('new_dashboard'), true)
	assert.equal(isBooleanFlag('dashboard_layout'), false)
	assert.equal(isBooleanFlag('pricing_page_experiment'), false)
})

test('isVariantOf accepts a declared variant of the flag', () => {
	assert.equal(isVariantOf('dashboard_layout', 'compact'), true)
	assert.equal(isVariantOf('dashboard_layout', 'control'), true)
})

test('isVariantOf rejects an off-list or wrong-typed variant, and any value on a boolean flag', () => {
	assert.equal(isVariantOf('dashboard_layout', 'gigantic'), false)
	assert.equal(isVariantOf('dashboard_layout', 42), false)
	assert.equal(isVariantOf('dashboard_layout', true), false)
	// A boolean flag has no variants, so nothing is a variant of it.
	assert.equal(isVariantOf('new_dashboard', true), false)
	assert.equal(isVariantOf('new_dashboard', 'control'), false)
})

test('isFlagKey accepts a registered key', () => {
	assert.equal(isFlagKey('new_dashboard'), true)
	assert.equal(isFlagKey('dashboard_layout'), true)
})

test('isFlagKey rejects an unknown key', () => {
	assert.equal(isFlagKey('not_a_real_flag'), false)
})

test('isFlagKey rejects non-string values', () => {
	assert.equal(isFlagKey(undefined), false)
	assert.equal(isFlagKey(null), false)
	assert.equal(isFlagKey(42), false)
	assert.equal(isFlagKey({ new_dashboard: true }), false)
})

test('isFlagKey is not fooled by inherited Object properties', () => {
	// Object.hasOwn, not the `in` operator: 'toString' lives on Object.prototype
	// but is not a flag, so it must not pass the guard.
	assert.equal(isFlagKey('toString'), false)
	assert.equal(isFlagKey('constructor'), false)
})

// Type-level sanity: FlagKey stays the closed union.
const _key: FlagKey = 'dashboard_layout'
void _key
