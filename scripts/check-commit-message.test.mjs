import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCommitMessage } from './check-commit-message.mjs'

test('accepts a well-formed conventional commit', () => {
	assert.equal(validateCommitMessage('feat(auth): add magic link sign-in').valid, true)
})

test('accepts a breaking-change marker', () => {
	assert.equal(validateCommitMessage('feat(api)!: drop v1 endpoints').valid, true)
})

test('accepts exempt merge/revert commits regardless of format', () => {
	assert.equal(validateCommitMessage("Merge branch 'main' into feature").valid, true)
})

test('rejects a missing type', () => {
	assert.equal(validateCommitMessage('update the login page').valid, false)
})

test('rejects a capitalized subject', () => {
	assert.equal(validateCommitMessage('fix(auth): Add missing redirect').valid, false)
})

test('rejects a trailing period', () => {
	assert.equal(validateCommitMessage('fix(auth): add missing redirect.').valid, false)
})

test('rejects a header over 72 characters', () => {
	const long = 'feat(auth): ' + 'a'.repeat(70)
	assert.equal(validateCommitMessage(long).valid, false)
})
