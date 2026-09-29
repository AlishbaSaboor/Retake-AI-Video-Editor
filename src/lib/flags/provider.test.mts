import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FLAGS, type FlagKey } from './flags'
import {
	parseWeights,
	rolloutBucket,
	walkProviders,
	weightedVariant,
	type FlagContext,
	type FlagProvider,
	type FlagValue
} from './provider'

// A fake provider that always answers the same way, standing in for one link
// (DB override, DB flag, PostHog) so precedence can be tested with no DB. The
// answer is a FlagValue (boolean OR a variant string) so both on/off and
// multivariate resolution can be exercised.
function fixed(answer: FlagValue | undefined): FlagProvider {
	return { resolve: () => Promise.resolve(answer) }
}

// A fake that records whether it was consulted, to prove a decided earlier link
// short-circuits the chain (later links are never asked).
function spy(answer: FlagValue | undefined): { provider: FlagProvider; calls: () => number } {
	let calls = 0
	return {
		provider: {
			resolve: () => {
				calls++
				return Promise.resolve(answer)
			}
		},
		calls: () => calls
	}
}

const KEY: FlagKey = 'new_dashboard'
const CTX: FlagContext = { userId: 'user-1' }

test('the first defined answer wins: override (link 1) beats every downstream link', async () => {
	// order: override=true, dbFlag=false, posthog=false → override's true wins.
	const result = await walkProviders(KEY, CTX, [fixed(true), fixed(false), fixed(false)])
	assert.equal(result, true)
})

test('an override of false pins the flag off even when downstream would enable it', async () => {
	const result = await walkProviders(KEY, CTX, [fixed(false), fixed(true), fixed(true)])
	assert.equal(result, false)
})

test('a link that abstains (undefined) falls through to the next link', async () => {
	// override abstains, DB flag decides true.
	const result = await walkProviders(KEY, CTX, [fixed(undefined), fixed(true), fixed(false)])
	assert.equal(result, true)
})

test('DB flag beats PostHog: the kill-switch (DB false) wins over a PostHog true', async () => {
	// override abstains, DB flag says false (kill-switch), PostHog says true.
	const result = await walkProviders(KEY, CTX, [fixed(undefined), fixed(false), fixed(true)])
	assert.equal(result, false)
})

test('PostHog is consulted only when both DB links abstain', async () => {
	const result = await walkProviders(KEY, CTX, [fixed(undefined), fixed(undefined), fixed(true)])
	assert.equal(result, true)
})

test('when every provider abstains, the registry static default is returned', async () => {
	// new_dashboard.default is false.
	const result = await walkProviders(KEY, CTX, [
		fixed(undefined),
		fixed(undefined),
		fixed(undefined)
	])
	assert.equal(result, FLAGS[KEY].default)
	assert.equal(result, false)
})

test('with no providers at all, the flag resolves to its static default', async () => {
	const onByDefault = 'checkout_kill_switch' satisfies FlagKey
	assert.equal(FLAGS[onByDefault].default, true)
	const result = await walkProviders(onByDefault, CTX, [])
	assert.equal(result, true)
})

test('a decided earlier link short-circuits: later providers are never consulted', async () => {
	const first = spy(true)
	const second = spy(false)
	const third = spy(false)
	const result = await walkProviders(KEY, CTX, [first.provider, second.provider, third.provider])
	assert.equal(result, true)
	assert.equal(first.calls(), 1)
	assert.equal(second.calls(), 0, 'link after a decided one must not be consulted')
	assert.equal(third.calls(), 0)
})

test('every provider is consulted in order until one decides', async () => {
	const first = spy(undefined)
	const second = spy(undefined)
	const third = spy(true)
	const result = await walkProviders(KEY, CTX, [first.provider, second.provider, third.provider])
	assert.equal(result, true)
	assert.equal(first.calls(), 1)
	assert.equal(second.calls(), 1)
	assert.equal(third.calls(), 1)
})

// --- multivariate resolution -------------------------------------------------

const VARIANT_KEY: FlagKey = 'dashboard_layout'

test('a variant answer flows through unchanged: PostHog (link 3) picks the variant', async () => {
	// override + DB flag abstain, PostHog decides a variant string.
	const result = await walkProviders(VARIANT_KEY, CTX, [
		fixed(undefined),
		fixed(undefined),
		fixed('compact')
	])
	assert.equal(result, 'compact')
})

test('the kill-switch (DB → control default) beats a PostHog variant', async () => {
	// override abstains; DB link forces the control default; PostHog would pick
	// 'spacious' but never wins.
	const result = await walkProviders(VARIANT_KEY, CTX, [
		fixed(undefined),
		fixed('control'),
		fixed('spacious')
	])
	assert.equal(result, 'control')
})

test('a variant flag with every provider abstaining resolves to its control default', async () => {
	const result = await walkProviders(VARIANT_KEY, CTX, [
		fixed(undefined),
		fixed(undefined),
		fixed(undefined)
	])
	assert.equal(result, FLAGS[VARIANT_KEY].default)
	assert.equal(result, 'control')
})

// --- weighted variant split (PostHog-independent A/B/n) ----------------------
// dashboard_layout's declared variants are ['control', 'compact', 'spacious'].

const USERS = Array.from({ length: 400 }, (_, i) => `user-${i}`)

test('parseWeights accepts a well-formed map and rejects malformed input', () => {
	assert.deepEqual(parseWeights({ control: 50, compact: 50 }), { control: 50, compact: 50 })
	assert.equal(parseWeights(null), undefined)
	assert.equal(parseWeights([50, 50] as never), undefined)
	assert.equal(parseWeights({}), undefined)
	assert.equal(parseWeights({ control: -1 }), undefined)
	assert.equal(parseWeights({ control: 'lots' } as never), undefined)
})

test('weightedVariant is deterministic and independent of the weights key order', () => {
	// Same intent, different JSON key order — every user must land in the same arm.
	const a = { control: 50, compact: 50 }
	const b = { compact: 50, control: 50 }
	for (const user of USERS) {
		assert.equal(weightedVariant(VARIANT_KEY, user, a), weightedVariant(VARIANT_KEY, user, b))
	}
})

test('weightedVariant matches the bucket→cumulative-share mapping in declared order', () => {
	const weights = { control: 30, compact: 30, spacious: 40 }
	for (const user of USERS) {
		const bucket = rolloutBucket(VARIANT_KEY, user)
		const expected = bucket < 30 ? 'control' : bucket < 60 ? 'compact' : 'spacious'
		assert.equal(weightedVariant(VARIANT_KEY, user, weights), expected)
	}
})

test('weightedVariant ignores an off-registry weight key (no silent dead band)', () => {
	// A legacy / seeded key that is no longer a declared variant must not consume
	// part of the range — every user still gets a real variant, never undefined.
	const weights = { control: 50, compact: 50, legacy_variant: 1000 }
	for (const user of USERS) {
		const picked = weightedVariant(VARIANT_KEY, user, weights)
		assert.ok(picked === 'control' || picked === 'compact', `got ${picked}`)
	}
})

test('weightedVariant makes the last variant fully reachable (no unreachable top sliver)', () => {
	// All weight on the last declared variant → everyone lands on it.
	for (const user of USERS) {
		assert.equal(
			weightedVariant(VARIANT_KEY, user, { control: 0, compact: 0, spacious: 5 }),
			'spacious'
		)
	}
	// All weight on the first → everyone lands on it.
	for (const user of USERS) {
		assert.equal(
			weightedVariant(VARIANT_KEY, user, { control: 7, compact: 0, spacious: 0 }),
			'control'
		)
	}
})

test('weightedVariant abstains (undefined) when no declared variant carries weight', () => {
	assert.equal(weightedVariant(VARIANT_KEY, 'user-1', { legacy_variant: 100 }), undefined)
	assert.equal(weightedVariant(VARIANT_KEY, 'user-1', {}), undefined)
})
