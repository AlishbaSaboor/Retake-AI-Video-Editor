#!/usr/bin/env node
// Checks that the engineering standards in docs/STANDARDS.md are actually
// wired into this repo — the deterministic half of "was the standardisation
// applied": the files exist, the hook is executable, CI runs every gate on a
// pull request, the lint and TypeScript config that is *in effect* (not just
// written down) enforces what the rules say, nothing machine-local is
// tracked. No network, no model, the same answer on every run.
//
// Usage: node scripts/check-standards.mjs [--root <dir>] [--json]
//
// --root points it at another checkout. The failures are the to-do list for
// bringing that repo onto the standards — see docs/STANDARDS.md, "Bringing an
// existing repo onto the standards".
//
// Every check that scans text asserts it found something before it judges
// what it found. app-discovery's check:env once passed for weeks by matching
// zero variables; a check that can pass by matching nothing is not a check.
//
// Exit codes: 0 every standard met, 1 at least one not met.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const AGENTS_FILE = 'AGENTS.md'
const RULES_DIR = 'docs/rules'
const README_FILE = 'README.md'

// The rules every repo carries whatever its stack — the engineering-discipline
// half that applied in full to app-discovery, a repo sharing none of this
// template's framework choices. Stack-specific rules (database, auth, ...)
// are covered by the bidirectional link check rather than named here.
const CORE_RULES = [
	'code-quality.md',
	'commits.md',
	'deployment.md',
	'logging.md',
	'migrations.md',
	'pull-requests.md'
]

// Each imports AGENTS.md rather than restating it. Only CLAUDE.md is required;
// the others are checked if present.
const REQUIRED_ENTRY_POINT = 'CLAUDE.md'
const OPTIONAL_ENTRY_POINTS = ['GEMINI.md', 'QWEN.md', '.cursor/rules/project.mdc']
const AGENTS_IMPORT_LINE = /^@AGENTS\.md\s*$/m

const HOOK = '.githooks/commit-msg'
const COMMIT_MESSAGE_SCRIPT = 'scripts/check-commit-message.mjs'
const HOOKS_PATH_SETTING = 'core.hooksPath .githooks'

const PRE_COMMIT_HOOK = '.githooks/pre-commit'
const SECRETS_SCRIPT = 'scripts/check-secrets.mjs'

const REQUIRED_SCRIPTS = [
	'lint',
	'typecheck',
	'format',
	'format:check',
	'test',
	'check:env',
	'check:standards',
	'check:rls'
]
const CI_GATES = [
	'lint',
	'typecheck',
	'format:check',
	'check:env',
	'test',
	'check:standards',
	'check:rls'
]
const CI_WORKFLOW = '.github/workflows/ci.yml'
const LOCAL_REVIEW_SKILL = '.claude/skills/local-review/SKILL.md'

const ENV_SCHEMA = 'src/lib/env.ts'
const ENV_EXAMPLE = '.env.example'
const ENV_CHECK_SCRIPT = 'scripts/check-env-vars.mjs'
const LOGGER_DIR = 'src/server/lib/logger'
const LOGGER_TESTS = ['logger.test.mts', 'redact.test.mts', 'context.test.mts']

const RLS_CHECK_SCRIPT = 'scripts/check-rls.mjs'
const SUPABASE_AUTH_ONLY_TYPE = 'src/lib/supabase/auth-only.ts'
const SUPABASE_WRAPPERS = ['src/lib/supabase/server.ts', 'src/lib/supabase/secret-key.ts']
// One representative import from each ban list in eslint.config.mjs — enough
// to prove the group in effect is that one, without restating it here.
const DATA_ACCESS_MARKERS = ['@prisma/client', 'pg']
const SUPABASE_MARKERS = ['@supabase/supabase-js', '@supabase/ssr']

const PRETTIER_CONFIGS = [
	'.prettierrc',
	'.prettierrc.json',
	'prettier.config.js',
	'prettier.config.mjs'
]
const PRETTIER_IGNORE = '.prettierignore'
// One per agent that writes a committed transcript: Claude Code to
// .claude-logs/, Codex to .codex-logs/. Each is optional on its own (a
// Claude-only repo has no .codex-logs/), but at least one must exist, and
// every one that does must be tracked, unignored and formatting-exempt.
const SESSION_LOG_DIRS = ['.claude-logs', '.codex-logs']

// Machine-local by construction. Each is probed at the root and nested,
// because a pattern that catches one and misses the other is how
// app-discovery came to track a b2b-dashboard/site/.vercel/project.json.
const MUST_BE_IGNORED = [
	'.env',
	'.env.local',
	'.env.production',
	'.vercel/project.json',
	'nested/dir/.vercel/project.json',
	'node_modules/x.js',
	'nested/node_modules/x.js',
	'.DS_Store',
	'nested/.DS_Store',
	'supabase/.temp/project-ref'
]
const MUST_NOT_BE_TRACKED = [
	{ label: 'a .vercel/ directory', pattern: /(^|\/)\.vercel\// },
	{ label: 'supabase CLI state (supabase/.temp/)', pattern: /(^|\/)supabase\/\.temp\// },
	{ label: 'node_modules/', pattern: /(^|\/)node_modules\// },
	{ label: '.DS_Store', pattern: /(^|\/)\.DS_Store$/ },
	{
		label:
			'a populated env file (.env, .env.local, .env.*.local, .env.development, .env.production)',
		pattern: /(^|\/)\.env(\.local|\..+\.local|\.development|\.production)?$/
	}
]
const MAX_LISTED_HITS = 3

// `pnpm lint`, `npm run lint`, `yarn lint`, `bun run lint` all name the same
// package.json script; this pulls the script name out of any of them.
const SCRIPT_INVOCATION = /\b(?:pnpm|npm|yarn|bun)\b(?:\s+run)?\s+([a-z][a-z0-9:_-]*)/g

function pass() {
	return { ok: true }
}

function fail(detail) {
	return { ok: false, detail }
}

function createContext(rootArg) {
	const root = resolve(rootArg)
	const has = (path) => existsSync(join(root, path))
	const read = (path) => (has(path) ? readFileSync(join(root, path), 'utf8') : null)
	const git = (...args) =>
		spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
	const isGitRepo = git('rev-parse', '--is-inside-work-tree').status === 0
	const trackedFiles = isGitRepo ? git('ls-files', '-z').stdout.split('\0').filter(Boolean) : []

	let packageJson = null
	const rawPackage = read('package.json')
	if (rawPackage != null) {
		try {
			packageJson = JSON.parse(rawPackage)
		} catch {
			packageJson = null
		}
	}

	return { root, has, read, git, isGitRepo, trackedFiles, packageJson, memo: new Map() }
}

function scriptsInvokedIn(text) {
	// YAML and Markdown both comment with `#`; a comment that mentions
	// `pnpm lint` is not a gate.
	const withoutComments = text.replace(/^\s*#.*$/gm, '').replace(/\s#.*$/gm, '')
	return new Set([...withoutComments.matchAll(SCRIPT_INVOCATION)].map((match) => match[1]))
}

function fencedCodeIn(markdown) {
	// Only the ``` blocks: a skill that *mentions* `pnpm check:env` in prose
	// is not a skill that runs it.
	return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]).join('\n')
}

function ruleLinksIn(agentsText) {
	// Matches `docs/rules/<file>.md` wherever it appears — a Markdown link
	// target or backticked prose both count as "AGENTS.md points at it".
	return new Set(
		[...agentsText.matchAll(/docs\/rules\/([a-z0-9-]+\.md)/g)].map((match) => match[1])
	)
}

function ruleFilesIn(ctx) {
	if (!ctx.has(RULES_DIR)) return []
	return readdirSync(join(ctx.root, RULES_DIR))
		.filter((name) => name.endsWith('.md'))
		.sort()
}

function isExecutable(ctx, path) {
	const EXECUTE_BITS = 0o111
	return (statSync(join(ctx.root, path)).mode & EXECUTE_BITS) !== 0
}

function indexMode(ctx, path) {
	// `git ls-files -s` prints "<mode> <object> <stage>\t<path>". The index
	// mode is what a fresh clone gets; a hook that is +x on one laptop and
	// 100644 in git is a hook nobody else has.
	const out = ctx.git('ls-files', '-s', '--', path).stdout.trim()
	return out.split(' ')[0] || null
}

function isIgnored(ctx, path) {
	return ctx.git('check-ignore', '-q', '--', path).status === 0
}

function runBinary(ctx, name, args) {
	const bin = join(ctx.root, 'node_modules', '.bin', name)
	if (!existsSync(bin)) {
		return {
			error: `${name} is not installed under node_modules — run the package manager's install first`
		}
	}
	try {
		return {
			stdout: execFileSync(bin, args, {
				cwd: ctx.root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			})
		}
	} catch (error) {
		const stderr = typeof error.stderr === 'string' ? error.stderr.trim().split('\n')[0] : ''
		return { error: `${name} ${args.join(' ')} failed: ${stderr || error.message}` }
	}
}

function severityOf(setting) {
	const level = Array.isArray(setting) ? setting[0] : setting
	if (level === 2 || level === 'error') return 'error'
	if (level === 1 || level === 'warn') return 'warn'
	return 'off'
}

function effectiveEslintRules(ctx) {
	// The *resolved* config for an ordinary src file, not the config file: flat
	// config resolves a rule by last match wins, so a rule can be written down
	// and still be off. Memoised on the context — three checks read it.
	if (!ctx.memo.has('eslint')) {
		const result = runBinary(ctx, 'eslint', ['--print-config', ENV_SCHEMA])
		let outcome
		if (result.error) {
			outcome = { error: result.error }
		} else {
			try {
				outcome = { rules: JSON.parse(result.stdout)?.rules ?? {} }
			} catch {
				outcome = { error: `eslint --print-config ${ENV_SCHEMA} did not print a config` }
			}
		}
		ctx.memo.set('eslint', outcome)
	}
	return ctx.memo.get('eslint')
}

function restrictedImportGroups(rules) {
	// Every pattern the effective no-restricted-imports rule bans, flattened.
	// Null when the rule is not an error at all.
	const entry = rules['no-restricted-imports']
	if (!Array.isArray(entry) || severityOf(entry) !== 'error') return null
	const groups = []
	for (const option of entry.slice(1)) {
		for (const pattern of option?.patterns ?? []) {
			if (typeof pattern === 'string') groups.push(pattern)
			else groups.push(...(pattern.group ?? []))
		}
	}
	return groups
}

function requireGit(ctx) {
	return ctx.isGitRepo
		? null
		: fail(`${ctx.root} is not a git repository, so tracked-file checks cannot run`)
}

export const CHECKS = [
	{
		id: 'agents-md',
		title: 'AGENTS.md exists and indexes the engineering rules',
		run(ctx) {
			const text = ctx.read(AGENTS_FILE)
			if (text == null)
				return fail(`${AGENTS_FILE} is missing — it is the file every coding agent reads`)
			if (!/^##\s+Engineering rules\s*$/m.test(text)) {
				return fail(`${AGENTS_FILE} has no "## Engineering rules" section`)
			}
			return pass()
		}
	},
	{
		id: 'agents-md-links-resolve',
		title: 'every rule AGENTS.md links to exists',
		run(ctx) {
			const text = ctx.read(AGENTS_FILE)
			if (text == null) return fail(`${AGENTS_FILE} is missing`)
			const links = ruleLinksIn(text)
			if (links.size === 0) {
				return fail(
					`${AGENTS_FILE} links to nothing under ${RULES_DIR}/ — the rules index is empty`
				)
			}
			const dangling = [...links].filter((name) => !ctx.has(join(RULES_DIR, name)))
			if (dangling.length > 0) {
				return fail(`${AGENTS_FILE} links to rules that do not exist: ${dangling.join(', ')}`)
			}
			return pass()
		}
	},
	{
		id: 'rules-all-linked',
		title: 'every file in docs/rules/ is linked from AGENTS.md',
		run(ctx) {
			const files = ruleFilesIn(ctx)
			if (files.length === 0) return fail(`${RULES_DIR}/ has no rule files`)
			const text = ctx.read(AGENTS_FILE)
			if (text == null) return fail(`${AGENTS_FILE} is missing`)
			const links = ruleLinksIn(text)
			const orphans = files.filter((name) => !links.has(name))
			if (orphans.length > 0) {
				return fail(
					`rules nobody is pointed at: ${orphans.join(', ')} — link each from ${AGENTS_FILE} or delete it`
				)
			}
			return pass()
		}
	},
	{
		id: 'rules-core-set',
		title: 'the stack-agnostic core rules are present',
		run(ctx) {
			const missing = CORE_RULES.filter((name) => !ctx.has(join(RULES_DIR, name)))
			if (missing.length > 0) return fail(`missing from ${RULES_DIR}/: ${missing.join(', ')}`)
			return pass()
		}
	},
	{
		id: 'per-tool-entry-points',
		title: 'per-tool instruction files import AGENTS.md instead of restating it',
		run(ctx) {
			const problems = []
			const required = ctx.read(REQUIRED_ENTRY_POINT)
			if (required == null) problems.push(`${REQUIRED_ENTRY_POINT} is missing`)
			else if (!AGENTS_IMPORT_LINE.test(required)) {
				problems.push(`${REQUIRED_ENTRY_POINT} does not contain an "@AGENTS.md" line`)
			}
			for (const path of OPTIONAL_ENTRY_POINTS) {
				const text = ctx.read(path)
				if (text != null && !AGENTS_IMPORT_LINE.test(text)) {
					problems.push(`${path} exists but does not contain an "@AGENTS.md" line`)
				}
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'readme',
		title: 'README.md exists',
		run(ctx) {
			return ctx.has(README_FILE) ? pass() : fail(`${README_FILE} is missing`)
		}
	},
	{
		id: 'commit-msg-hook',
		title: 'the commit-msg hook exists, is executable, and runs the shared check',
		run(ctx) {
			if (!ctx.has(HOOK)) return fail(`${HOOK} is missing`)
			if (!isExecutable(ctx, HOOK)) return fail(`${HOOK} is not executable (chmod +x)`)
			if (ctx.isGitRepo) {
				const mode = indexMode(ctx, HOOK)
				if (mode != null && mode !== '100755') {
					return fail(
						`${HOOK} is ${mode} in the git index, so a fresh clone gets a non-executable hook — ` +
							`run: git update-index --chmod=+x ${HOOK}`
					)
				}
			}
			if (!ctx.read(HOOK).includes(COMMIT_MESSAGE_SCRIPT)) {
				return fail(`${HOOK} does not call ${COMMIT_MESSAGE_SCRIPT}`)
			}
			if (!ctx.has(COMMIT_MESSAGE_SCRIPT)) return fail(`${COMMIT_MESSAGE_SCRIPT} is missing`)
			return pass()
		}
	},
	{
		id: 'hooks-path-installed',
		title: 'the package install points git at .githooks',
		run(ctx) {
			const prepare = ctx.packageJson?.scripts?.prepare
			if (typeof prepare !== 'string' || !prepare.includes(HOOKS_PATH_SETTING)) {
				return fail(`package.json "prepare" script must run "git config ${HOOKS_PATH_SETTING}"`)
			}
			return pass()
		}
	},
	{
		id: 'ci-commits-job',
		title: 'CI re-runs the commit message check over every PR commit',
		run(ctx) {
			const text = ctx.read(CI_WORKFLOW)
			if (text == null) return fail(`${CI_WORKFLOW} is missing`)
			if (!text.includes(COMMIT_MESSAGE_SCRIPT) || !text.includes('--range')) {
				return fail(`${CI_WORKFLOW} never runs "${COMMIT_MESSAGE_SCRIPT} --range"`)
			}
			return pass()
		}
	},
	{
		id: 'secrets-scan',
		title: 'a secret scanner guards commits at the pre-commit hook and again in CI',
		run(ctx) {
			const problems = []
			if (!ctx.has(SECRETS_SCRIPT)) problems.push(`${SECRETS_SCRIPT} is missing`)
			// Same three properties as the commit-msg hook: present, executable on
			// disk, and 100755 in the index so a fresh clone gets a working hook.
			if (!ctx.has(PRE_COMMIT_HOOK)) {
				problems.push(`${PRE_COMMIT_HOOK} is missing`)
			} else {
				if (!isExecutable(ctx, PRE_COMMIT_HOOK)) {
					problems.push(`${PRE_COMMIT_HOOK} is not executable (chmod +x)`)
				}
				if (ctx.isGitRepo) {
					const mode = indexMode(ctx, PRE_COMMIT_HOOK)
					if (mode != null && mode !== '100755') {
						problems.push(
							`${PRE_COMMIT_HOOK} is ${mode} in the git index, so a fresh clone gets a ` +
								`non-executable hook — run: git update-index --chmod=+x ${PRE_COMMIT_HOOK}`
						)
					}
				}
				if (!(ctx.read(PRE_COMMIT_HOOK) ?? '').includes(SECRETS_SCRIPT)) {
					problems.push(`${PRE_COMMIT_HOOK} does not call ${SECRETS_SCRIPT}`)
				}
			}
			const script = ctx.packageJson?.scripts?.['check:secrets']
			if (typeof script !== 'string' || !script.includes(SECRETS_SCRIPT)) {
				problems.push(`the "check:secrets" script does not run ${SECRETS_SCRIPT}`)
			}
			// CI is the enforcement point a local `--no-verify` cannot skip.
			const workflow = ctx.read(CI_WORKFLOW)
			if (workflow == null) problems.push(`${CI_WORKFLOW} is missing`)
			else if (!scriptsInvokedIn(workflow).has('check:secrets')) {
				problems.push(`${CI_WORKFLOW} never runs check:secrets`)
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'package-scripts',
		title: 'package.json defines every gate script',
		run(ctx) {
			const scripts = ctx.packageJson?.scripts
			if (scripts == null || Object.keys(scripts).length === 0) {
				return fail('package.json has no "scripts" — or is missing or unparseable')
			}
			const missing = REQUIRED_SCRIPTS.filter((name) => typeof scripts[name] !== 'string')
			if (missing.length > 0) return fail(`package.json scripts missing: ${missing.join(', ')}`)
			if (
				!scripts.lint.includes('--max-warnings=0') &&
				!scripts.lint.includes('--max-warnings 0')
			) {
				return fail('the "lint" script must pass --max-warnings=0 so a warning fails the gate')
			}
			return pass()
		}
	},
	{
		id: 'ci-gates-every-pr',
		title: 'CI runs every gate on every pull request',
		run(ctx) {
			const text = ctx.read(CI_WORKFLOW)
			if (text == null) return fail(`${CI_WORKFLOW} is missing — nothing gates a branch`)
			const hasPullRequestTrigger =
				/^\s*pull_request\s*:/m.test(text) ||
				/^\s*on\s*:\s*pull_request\b/m.test(text) ||
				/^\s*on\s*:\s*\[[^\]]*\bpull_request\b/m.test(text)
			if (!hasPullRequestTrigger) return fail(`${CI_WORKFLOW} does not trigger on pull_request`)
			const invoked = scriptsInvokedIn(text)
			if (invoked.size === 0) {
				return fail(`${CI_WORKFLOW} invokes no package.json script at all`)
			}
			const missing = CI_GATES.filter((gate) => !invoked.has(gate))
			if (missing.length > 0) return fail(`${CI_WORKFLOW} never runs: ${missing.join(', ')}`)
			return pass()
		}
	},
	{
		id: 'local-review-mirrors-ci',
		title: 'the local-review skill runs the same gates CI does',
		run(ctx) {
			const text = ctx.read(LOCAL_REVIEW_SKILL)
			if (text == null) return fail(`${LOCAL_REVIEW_SKILL} is missing`)
			const commands = fencedCodeIn(text)
			if (commands.trim() === '') {
				return fail(`${LOCAL_REVIEW_SKILL} has no fenced command block, so it runs nothing`)
			}
			const invoked = scriptsInvokedIn(commands)
			const missing = CI_GATES.filter((gate) => !invoked.has(gate))
			if (missing.length > 0) {
				return fail(
					`${LOCAL_REVIEW_SKILL} does not run: ${missing.join(', ')} — CI would be the first to`
				)
			}
			return pass()
		}
	},
	{
		id: 'eslint-effective-rules',
		title: 'the ESLint config in effect forbids `any` and console output in src/',
		run(ctx) {
			const { rules, error } = effectiveEslintRules(ctx)
			if (error) return fail(error)
			const problems = []
			if (severityOf(rules['@typescript-eslint/no-explicit-any']) !== 'error') {
				problems.push('@typescript-eslint/no-explicit-any is not an error')
			}
			if (severityOf(rules['no-console']) !== 'error') problems.push('no-console is not an error')
			return problems.length > 0 ? fail(`for ${ENV_SCHEMA}: ${problems.join('; ')}`) : pass()
		}
	},
	{
		id: 'structured-logger',
		title: 'the shared Pino logger is import-restricted and its contract tests are wired',
		run(ctx) {
			const problems = []
			if (!ctx.packageJson?.dependencies?.pino) problems.push('pino is not a runtime dependency')
			for (const file of ['index.ts', 'logger.ts', 'redact.ts', 'context.ts', ...LOGGER_TESTS]) {
				if (!ctx.has(`${LOGGER_DIR}/${file}`)) problems.push(`${LOGGER_DIR}/${file} is missing`)
			}
			const source = ctx.read(`${LOGGER_DIR}/logger.ts`) ?? ''
			if (!/^import\s+pino\s+from\s+['"]pino['"]/m.test(source) || !/\bpino\(/.test(source)) {
				problems.push(`${LOGGER_DIR}/logger.ts must construct the shared Pino logger`)
			}
			for (const file of LOGGER_TESTS) {
				if (!/\btest\(/.test(ctx.read(`${LOGGER_DIR}/${file}`) ?? '')) {
					problems.push(`${LOGGER_DIR}/${file} contains no contract tests`)
				}
			}
			const test = ctx.packageJson?.scripts?.test ?? ''
			if (!test.includes('--test') || !test.includes('src/**/*.test.mts')) {
				problems.push('the test script must discover src/**/*.test.mts, including logger contracts')
			}
			const { rules, error } = effectiveEslintRules(ctx)
			if (error) problems.push(error)
			else {
				const groups = restrictedImportGroups(rules) ?? []
				if (!groups.includes('pino') || !groups.includes('pino/**')) {
					problems.push(`no-restricted-imports for ${ENV_SCHEMA} must ban pino and pino/**`)
				}
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'typescript-strict',
		title: 'TypeScript runs in strict mode',
		run(ctx) {
			if (!ctx.has('tsconfig.json')) return fail('tsconfig.json is missing')
			const result = runBinary(ctx, 'tsc', ['--showConfig', '-p', 'tsconfig.json'])
			if (result.error) return fail(result.error)
			let config
			try {
				config = JSON.parse(result.stdout)
			} catch {
				return fail('tsc --showConfig did not print a config')
			}
			return config?.compilerOptions?.strict === true
				? pass()
				: fail('compilerOptions.strict is not true in the resolved tsconfig')
		}
	},
	{
		id: 'prettier-config',
		title: 'Prettier is configured and has an ignore file',
		run(ctx) {
			if (!PRETTIER_CONFIGS.some((path) => ctx.has(path))) {
				return fail(`no Prettier config (${PRETTIER_CONFIGS.join(', ')})`)
			}
			if (!ctx.has(PRETTIER_IGNORE)) return fail(`${PRETTIER_IGNORE} is missing`)
			return pass()
		}
	},
	{
		id: 'env-schema',
		title: 'environment variables go through one Zod schema, documented and checked',
		run(ctx) {
			const problems = []
			const schema = ctx.read(ENV_SCHEMA)
			if (schema == null) problems.push(`${ENV_SCHEMA} is missing`)
			else if (!/from\s+['"]zod['"]/.test(schema))
				problems.push(`${ENV_SCHEMA} does not import zod`)
			if (!ctx.has(ENV_EXAMPLE)) problems.push(`${ENV_EXAMPLE} is missing`)
			if (!ctx.has(ENV_CHECK_SCRIPT)) problems.push(`${ENV_CHECK_SCRIPT} is missing`)
			const checkEnv = ctx.packageJson?.scripts?.['check:env']
			if (typeof checkEnv !== 'string' || !checkEnv.includes(ENV_CHECK_SCRIPT)) {
				problems.push(`the "check:env" script does not run ${ENV_CHECK_SCRIPT}`)
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'machine-local-state-ignored',
		title: '.gitignore covers machine-local state at the root and nested',
		run(ctx) {
			const notGit = requireGit(ctx)
			if (notGit) return notGit
			const leaking = MUST_BE_IGNORED.filter((path) => !isIgnored(ctx, path))
			if (leaking.length > 0) return fail(`.gitignore does not ignore: ${leaking.join(', ')}`)
			return pass()
		}
	},
	{
		id: 'no-machine-local-state-tracked',
		title: 'nothing machine-local is tracked',
		run(ctx) {
			const notGit = requireGit(ctx)
			if (notGit) return notGit
			if (ctx.trackedFiles.length === 0) return fail('git tracks no files at all')
			const problems = []
			for (const { label, pattern } of MUST_NOT_BE_TRACKED) {
				const hits = ctx.trackedFiles.filter((file) => pattern.test(file))
				if (hits.length > 0) {
					problems.push(`${label}: ${hits.slice(0, MAX_LISTED_HITS).join(', ')}`)
				}
			}
			return problems.length > 0 ? fail(`tracked — ${problems.join('; ')}`) : pass()
		}
	},
	{
		id: 'session-logs-tracked',
		title: 'session transcripts are tracked, kept, and exempt from formatting',
		run(ctx) {
			const notGit = requireGit(ctx)
			if (notGit) return notGit
			const problems = []
			const prettierIgnore = (ctx.read(PRETTIER_IGNORE) ?? '')
				.split('\n')
				.map((line) => line.trim().replace(/\/$/, ''))
			const present = SESSION_LOG_DIRS.filter((dir) => ctx.has(dir))
			if (present.length === 0) {
				problems.push(
					`no session-log directory exists (${SESSION_LOG_DIRS.map((dir) => `${dir}/`).join(' or ')})`
				)
			}
			let anyTracked = false
			for (const dir of present) {
				if (isIgnored(ctx, `${dir}/2026-01-01_00-00-00_probe.md`)) {
					problems.push(`${dir}/ is gitignored, so transcripts never ship with the branch`)
				}
				if (ctx.trackedFiles.some((file) => file.startsWith(`${dir}/`))) anyTracked = true
				// Transcripts are verbatim records. The first one committed fails
				// `format:check` unless Prettier is told to leave the directory alone.
				if (!prettierIgnore.includes(dir)) {
					problems.push(`${PRETTIER_IGNORE} does not list ${dir}/`)
				}
			}
			if (present.length > 0 && !anyTracked) {
				problems.push(
					`no session-log directory has anything tracked — add a .gitkeep so the directory survives a clone`
				)
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'prisma-only-data-path',
		title: 'the ESLint config in effect makes Prisma the only data path',
		run(ctx) {
			const { rules, error } = effectiveEslintRules(ctx)
			if (error) return fail(error)
			const groups = restrictedImportGroups(rules)
			if (groups == null) return fail(`no-restricted-imports is not an error for ${ENV_SCHEMA}`)
			const missing = DATA_ACCESS_MARKERS.filter((marker) => !groups.includes(marker))
			if (missing.length > 0) {
				return fail(
					`no-restricted-imports for ${ENV_SCHEMA} does not ban: ${missing.join(', ')} — only ` +
						`src/server/db/client.ts may construct the Prisma client, and raw drivers nowhere`
				)
			}
			return pass()
		}
	},
	{
		id: 'supabase-auth-only',
		title: 'Supabase clients are typed to their auth surface and the SDK is import-restricted',
		run(ctx) {
			const { rules, error } = effectiveEslintRules(ctx)
			if (error) return fail(error)
			const problems = []
			const groups = restrictedImportGroups(rules) ?? []
			const missing = SUPABASE_MARKERS.filter((marker) => !groups.includes(marker))
			if (missing.length > 0) {
				problems.push(`no-restricted-imports for ${ENV_SCHEMA} does not ban: ${missing.join(', ')}`)
			}
			const typeSource = ctx.read(SUPABASE_AUTH_ONLY_TYPE)
			if (typeSource == null) {
				problems.push(`${SUPABASE_AUTH_ONLY_TYPE} is missing`)
			} else {
				const pick = typeSource.match(/Pick<\s*SupabaseClient(?:<[^>]*>)?\s*,\s*([^>]+)>/)
				if (pick == null) {
					problems.push(
						`${SUPABASE_AUTH_ONLY_TYPE} does not define a Pick<SupabaseClient, ...> type`
					)
				} else if (/'(from|rpc)'/.test(pick[1])) {
					problems.push(`${SUPABASE_AUTH_ONLY_TYPE} exposes from/rpc — that is a data path`)
				}
			}
			for (const wrapper of SUPABASE_WRAPPERS) {
				const source = ctx.read(wrapper)
				if (source == null) {
					problems.push(`${wrapper} is missing`)
				} else if (
					!/export\s+(?:async\s+)?function\s+\w+\([^)]*\)\s*:\s*(?:Promise<)?AuthOnlySupabaseClient/.test(
						source
					)
				) {
					problems.push(`${wrapper} does not return AuthOnlySupabaseClient`)
				}
			}
			return problems.length > 0 ? fail(problems.join('; ')) : pass()
		}
	},
	{
		id: 'rls-check-wired',
		title: 'the RLS check exists and CI runs it after the migrations are applied',
		run(ctx) {
			if (!ctx.has(RLS_CHECK_SCRIPT)) return fail(`${RLS_CHECK_SCRIPT} is missing`)
			const script = ctx.packageJson?.scripts?.['check:rls']
			if (typeof script !== 'string' || !script.includes(RLS_CHECK_SCRIPT)) {
				return fail(`the "check:rls" script does not run ${RLS_CHECK_SCRIPT}`)
			}
			const workflow = ctx.read(CI_WORKFLOW)
			if (workflow == null) return fail(`${CI_WORKFLOW} is missing`)
			const deployAt = workflow.indexOf('migrate deploy')
			const checkAt = workflow.search(/\b(?:pnpm|npm run|yarn|bun run)\s+check:rls\b/)
			if (deployAt === -1) return fail(`${CI_WORKFLOW} never runs prisma migrate deploy`)
			if (checkAt === -1) return fail(`${CI_WORKFLOW} never runs check:rls`)
			if (checkAt < deployAt) {
				return fail(`${CI_WORKFLOW} runs check:rls before the migrations are applied`)
			}
			return pass()
		}
	}
]

export function runStandardsChecks({ root = process.cwd(), ids = null } = {}) {
	const ctx = createContext(root)
	const selected = ids == null ? CHECKS : CHECKS.filter((check) => ids.includes(check.id))
	const results = selected.map((check) => {
		let outcome
		try {
			outcome = check.run(ctx)
		} catch (error) {
			outcome = fail(`check crashed: ${error.message}`)
		}
		return { id: check.id, title: check.title, ok: outcome.ok, detail: outcome.detail ?? null }
	})
	return { root: ctx.root, results }
}

function main() {
	const args = process.argv.slice(2)
	const rootIndex = args.indexOf('--root')
	const root = rootIndex === -1 ? process.cwd() : args[rootIndex + 1]
	if (rootIndex !== -1 && !root) {
		console.error('Usage: check-standards.mjs [--root <dir>] [--json]')
		process.exit(1)
	}
	const isJsonOutput = args.includes('--json')

	const { root: resolvedRoot, results } = runStandardsChecks({ root })
	const failed = results.filter((result) => !result.ok)

	if (isJsonOutput) {
		console.log(
			JSON.stringify({ root: resolvedRoot, isMet: failed.length === 0, results }, null, 2)
		)
		process.exit(failed.length > 0 ? 1 : 0)
	}

	const width = Math.max(...results.map((result) => result.id.length))
	console.log(`Standards check — ${results.length} checks against ${resolvedRoot}\n`)
	for (const result of results) {
		console.log(`  ${result.ok ? '✓' : '✗'} ${result.id.padEnd(width)}  ${result.title}`)
		if (!result.ok) console.log(`      ${result.detail}`)
	}
	console.log('')
	if (failed.length > 0) {
		console.error(
			`${results.length - failed.length} of ${results.length} standards met. ` +
				`docs/STANDARDS.md says what each one means and how to meet it.`
		)
		process.exit(1)
	}
	console.log(`All ${results.length} standards met.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main()
}
