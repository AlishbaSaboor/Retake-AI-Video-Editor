#!/usr/bin/env node
// Shared by .githooks/commit-msg (local, every commit) and the CI "commits"
// job (every PR) — one implementation, so the rule can never drift between
// the two enforcement points. Edit the rule here, not in either caller.

const TYPES = [
	'feat',
	'fix',
	'perf',
	'refactor',
	'style',
	'docs',
	'test',
	'build',
	'ci',
	'chore',
	'revert'
]

// Curate this per project — directory names under src/ or top-level feature
// areas work well. An empty list here means "any lowercase-kebab scope is
// accepted", which is easier to start with but weakens scope-searchability
// of commit history as the project grows.
const SCOPES = []

const EXEMPT_PATTERN = /^(Merge |Revert |fixup!|squash!|amend!|Initial commit)/

const HEADER_PATTERN = new RegExp(
	`^(${TYPES.join('|')})(\\([a-z0-9-]+(?:\\/[a-z0-9-]+)?\\))?!?: .+$`
)

export function validateCommitMessage(message) {
	const lines = message.split('\n')
	const header = lines[0] ?? ''

	if (EXEMPT_PATTERN.test(header)) {
		return { valid: true }
	}

	if (header.length > 72) {
		return { valid: false, reason: `header exceeds 72 characters (${header.length})` }
	}

	const match = header.match(HEADER_PATTERN)
	if (!match) {
		return {
			valid: false,
			reason: `header must match "type(scope): subject" — got "${header}". Types: ${TYPES.join(', ')}`
		}
	}

	const scope = match[2]?.slice(1, -1)
	if (SCOPES.length > 0 && scope && !SCOPES.includes(scope.split('/')[0])) {
		return {
			valid: false,
			reason: `scope "${scope}" is not in the curated scope list: ${SCOPES.join(', ')}`
		}
	}

	const subject = header.slice(header.indexOf(': ') + 2)
	if (subject.length === 0) {
		return { valid: false, reason: 'subject must not be empty' }
	}
	if (subject[0] !== subject[0].toLowerCase()) {
		return {
			valid: false,
			reason: 'subject must be lowercase (imperative mood, e.g. "add x" not "Add X")'
		}
	}
	if (subject.endsWith('.')) {
		return { valid: false, reason: 'subject must not end with a period' }
	}

	if (lines.length > 1 && lines[1] !== '') {
		return { valid: false, reason: 'must have a blank line between the header and the body' }
	}

	return { valid: true }
}

async function main() {
	const args = process.argv.slice(2)
	let message

	const rangeIndex = args.indexOf('--range')
	if (rangeIndex !== -1) {
		// CI mode: validate every commit header in base..head.
		const { execSync } = await import('node:child_process')
		const range = args[rangeIndex + 1]
		const log = execSync(`git log --format=%B -z ${range}`, { encoding: 'utf-8' })
		const commits = log.split('\0').filter(Boolean)
		let failed = false
		for (const commitMessage of commits) {
			const result = validateCommitMessage(commitMessage.trim())
			if (!result.valid) {
				console.error(
					`Invalid commit message: ${result.reason}\n\n  ${commitMessage.split('\n')[0]}`
				)
				failed = true
			}
		}
		process.exit(failed ? 1 : 0)
	}

	// Local hook mode: read the message from the commit-msg file path.
	const filePath = args[0]
	if (!filePath) {
		console.error('Usage: check-commit-message.mjs <commit-msg-file> | --range base..head')
		process.exit(1)
	}
	const fs = await import('node:fs')
	message = fs.readFileSync(filePath, 'utf-8').trim()

	const result = validateCommitMessage(message)
	if (!result.valid) {
		console.error(`Invalid commit message: ${result.reason}`)
		console.error('\nExpected format: type(scope): subject')
		console.error(`Types: ${TYPES.join(', ')}`)
		process.exit(1)
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main()
}
