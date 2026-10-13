import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POSTHOG_INIT_OPTIONS } from './init-options'

test('PostHog never autocaptures or records sessions; page views stay, captured by hand', () => {
	assert.equal(POSTHOG_INIT_OPTIONS.autocapture, false)
	assert.equal(POSTHOG_INIT_OPTIONS.disable_session_recording, true)
	assert.equal(POSTHOG_INIT_OPTIONS.capture_pageview, false)
	assert.equal(POSTHOG_INIT_OPTIONS.person_profiles, 'identified_only')
})

test('the browser starts PostHog with these options and nothing that overrides them', () => {
	const source = readFileSync(
		new URL('../../../instrumentation-client.ts', import.meta.url),
		'utf-8'
	)
	const init = /posthog\.init\(([\s\S]*?)\n\t\}\)/.exec(source)?.[1] ?? ''
	assert.match(init, /\.\.\.POSTHOG_INIT_OPTIONS\s*$/)
	assert.doesNotMatch(init, /autocapture|session_recording|capture_pageview/)
	assert.equal(source.match(/posthog\.init\(/g)?.length, 1)
})
