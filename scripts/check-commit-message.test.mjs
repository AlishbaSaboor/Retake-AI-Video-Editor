import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// Run as the commit-msg hook and CI run it: a real `node` process. On
// Windows the script once never ran its checks at all (its entry-point test
// compared a file URL with a Windows path) and exited 0 for anything, so
// both a bad message failing and a good one passing are checked, each mode.
const SCRIPT = fileURLToPath(new URL('./check-commit-message.mjs', import.meta.url))
const run = (args, cwd) =>
	spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf-8' })

test('run as the commit-msg hook (a message file): a bad message exits 1, a good one 0', () => {
	const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'))
	try {
		const bad = join(dir, 'BAD_MSG')
		writeFileSync(bad, 'fix(make): Bold text on a block\n')
		const failed = run([bad])
		assert.equal(failed.status, 1, failed.stderr)
		assert.match(failed.stderr, /subject must be lowercase/)
		const good = join(dir, 'GOOD_MSG')
		writeFileSync(good, 'fix(make): bold text on a block\n\nWhy it changed.\n')
		const passed = run([good])
		assert.equal(passed.status, 0, passed.stderr)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test('run as CI runs it (--range): a range with a bad message exits 1, an all-good range 0', () => {
	const dir = mkdtempSync(join(tmpdir(), 'commit-range-'))
	const git = (...args) => {
		const result = spawnSync(
			'git',
			[
				'-c',
				'user.name=Test',
				'-c',
				'user.email=test@example.com',
				'-c',
				'core.hooksPath=',
				...args
			],
			{ cwd: dir, encoding: 'utf-8' }
		)
		assert.equal(result.status, 0, result.stderr)
		return result.stdout.trim()
	}
	try {
		git('init', '-q')
		git('commit', '-q', '--allow-empty', '-m', 'Initial commit')
		const base = git('rev-parse', 'HEAD')
		git('commit', '-q', '--allow-empty', '-m', 'feat(make): four looks')
		const goodHead = git('rev-parse', 'HEAD')
		const passed = run(['--range', `${base}..${goodHead}`], dir)
		assert.equal(passed.status, 0, passed.stderr)
		git('commit', '-q', '--allow-empty', '-m', "fix(make): Bold's text on a block")
		const failed = run(['--range', `${base}..HEAD`], dir)
		assert.equal(failed.status, 1, failed.stderr)
		assert.match(failed.stderr, /fix\(make\): Bold's text on a block/)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
