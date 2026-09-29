import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { CHECKS, runStandardsChecks } from './check-standards.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO_ROOT, 'scripts/check-standards.mjs')

// Everything the checks read. Copied, not referenced, so a test can break one
// thing in isolation without touching the real repo.
const FIXTURE_FILES = [
	'AGENTS.md',
	'CLAUDE.md',
	'GEMINI.md',
	'QWEN.md',
	'.cursor/rules/project.mdc',
	'README.md',
	'docs/rules',
	'.githooks/commit-msg',
	'.githooks/pre-commit',
	'scripts/check-commit-message.mjs',
	'scripts/check-secrets.mjs',
	'scripts/check-env-vars.mjs',
	'package.json',
	'.github/workflows/ci.yml',
	'.claude/skills/local-review/SKILL.md',
	'.prettierrc.json',
	'.prettierignore',
	'.gitignore',
	'.env.example',
	'src/lib/env.ts',
	'src/lib/supabase',
	'src/server/lib/logger',
	'scripts/check-rls.mjs',
	'tsconfig.json',
	'eslint.config.mjs',
	'.claude-logs/.gitkeep',
	'.codex-logs/.gitkeep'
]

function git(root, ...args) {
	return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
}

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), 'check-standards-'))
	for (const path of FIXTURE_FILES) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		cpSync(join(REPO_ROOT, path), join(root, path), { recursive: true })
	}
	// Shared, not copied: the tool checks need eslint and tsc resolvable from
	// the fixture. A real directory of per-package links rather than one link
	// to the whole tree, because git refuses to evaluate a path "beyond a
	// symbolic link" — and the ignore check probes node_modules/x.js.
	mkdirSync(join(root, 'node_modules'))
	for (const entry of readdirSync(join(REPO_ROOT, 'node_modules'))) {
		symlinkSync(join(REPO_ROOT, 'node_modules', entry), join(root, 'node_modules', entry))
	}
	git(root, 'init', '-q')
	git(root, 'add', '-A')
	return root
}

// Mutations that add a file the index must know about call `git add`
// themselves; a blanket re-add here would undo an index-only mutation such
// as `update-index --chmod=-x`.
function withFixture(mutate, ids) {
	const root = createFixture()
	try {
		mutate(root)
		const { results } = runStandardsChecks({ root, ids })
		return Object.fromEntries(results.map((result) => [result.id, result]))
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
}

function edit(root, path, transform) {
	writeFileSync(join(root, path), transform(readFileSync(join(root, path), 'utf8')))
}

test('the template itself meets every standard', () => {
	const { results } = runStandardsChecks({ root: REPO_ROOT })
	const failed = results.filter((result) => !result.ok)
	assert.deepEqual(
		failed.map((result) => `${result.id}: ${result.detail}`),
		[],
		'the template must pass its own check'
	)
	assert.equal(results.length, CHECKS.length)
})

test('a fixture built from the template passes every check, so later failures are the mutation', () => {
	const results = withFixture(() => {})
	const failed = Object.values(results).filter((result) => !result.ok)
	assert.deepEqual(
		failed.map((result) => `${result.id}: ${result.detail}`),
		[]
	)
})

test('agents-md fails when AGENTS.md is missing', () => {
	const results = withFixture((root) => rmSync(join(root, 'AGENTS.md')), ['agents-md'])
	assert.equal(results['agents-md'].ok, false)
	assert.match(results['agents-md'].detail, /AGENTS\.md is missing/)
})

test('structured-logger rejects a missing dependency, implementation or test coverage', () => {
	const results = withFixture(
		(root) => {
			edit(root, 'package.json', (text) => {
				const pkg = JSON.parse(text)
				delete pkg.dependencies.pino
				pkg.scripts.test = 'node --test scripts/*.test.mjs'
				return JSON.stringify(pkg)
			})
			rmSync(join(root, 'src/server/lib/logger/logger.ts'))
			writeFileSync(join(root, 'src/server/lib/logger/redact.test.mts'), '')
		},
		['structured-logger']
	)
	assert.equal(results['structured-logger'].ok, false)
	assert.match(results['structured-logger'].detail, /pino is not a runtime dependency/)
	assert.match(results['structured-logger'].detail, /logger\.ts is missing/)
	assert.match(results['structured-logger'].detail, /redact\.test\.mts contains no contract tests/)
	assert.match(results['structured-logger'].detail, /test script must discover/)
})

test('structured-logger rejects a replacement engine and an unwired Pino import ban', () => {
	const results = withFixture(
		(root) => {
			writeFileSync(join(root, 'src/server/lib/logger/logger.ts'), 'export const log = console\n')
			edit(root, 'eslint.config.mjs', (text) =>
				text.replace("['pino', 'pino/**']", "['other-logger']")
			)
		},
		['structured-logger']
	)
	assert.equal(results['structured-logger'].ok, false)
	assert.match(results['structured-logger'].detail, /must construct the shared Pino logger/)
	assert.match(results['structured-logger'].detail, /must ban pino/)
})

test('logging lint boundaries survive each dependency-specific exemption', async () => {
	const eslint = new ESLint({ cwd: REPO_ROOT })
	for (const filePath of [
		'src/lib/env.ts',
		'src/components/ui/icons.tsx',
		'src/server/ai/anthropic.ts',
		'src/server/db/client.ts',
		'src/lib/supabase/server.ts',
		'src/proxy.ts',
		'src/server/lib/logger/index.ts',
		'src/server/lib/logger/logger.ts'
	]) {
		const [result] = await eslint.lintText("import pino from 'pino'\npino()\n", { filePath })
		assert.equal(
			result.messages.some((message) => message.ruleId === 'no-restricted-imports'),
			filePath !== 'src/server/lib/logger/logger.ts',
			filePath
		)
	}
	const [client] = await eslint.lintText(
		"'use client'\nimport { log } from '@/server/lib/logger'\nlog.info('test')\n",
		{ filePath: 'src/components/logger-probe.tsx' }
	)
	assert.ok(client.messages.some((message) => message.ruleId === 'no-restricted-syntax'))
	const [consoleCall] = await eslint.lintText("console.error('test')\n", {
		filePath: 'src/server/logger-probe.ts'
	})
	assert.ok(consoleCall.messages.some((message) => message.ruleId === 'no-console'))
})

test('agents-md-links-resolve refuses to pass on an index that links to nothing', () => {
	const results = withFixture(
		(root) =>
			writeFileSync(join(root, 'AGENTS.md'), '# Repo\n\n## Engineering rules\n\nNone yet.\n'),
		['agents-md-links-resolve']
	)
	assert.equal(results['agents-md-links-resolve'].ok, false)
	assert.match(results['agents-md-links-resolve'].detail, /links to nothing/)
})

test('agents-md-links-resolve names a dangling link', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'AGENTS.md', (text) => `${text}\n- [Ghost](docs/rules/does-not-exist.md)\n`),
		['agents-md-links-resolve']
	)
	assert.equal(results['agents-md-links-resolve'].ok, false)
	assert.match(results['agents-md-links-resolve'].detail, /does-not-exist\.md/)
})

test('rules-all-linked names a rule nothing points at', () => {
	const results = withFixture(
		(root) => writeFileSync(join(root, 'docs/rules/orphan.md'), '# Orphan\n'),
		['rules-all-linked']
	)
	assert.equal(results['rules-all-linked'].ok, false)
	assert.match(results['rules-all-linked'].detail, /orphan\.md/)
})

test('rules-core-set names the missing core rule', () => {
	const results = withFixture(
		(root) => rmSync(join(root, 'docs/rules/commits.md')),
		['rules-core-set']
	)
	assert.equal(results['rules-core-set'].ok, false)
	assert.match(results['rules-core-set'].detail, /commits\.md/)
})

test('per-tool-entry-points fails when CLAUDE.md restates the rules instead of importing them', () => {
	const results = withFixture(
		(root) => writeFileSync(join(root, 'CLAUDE.md'), '# Rules\n\nUse Prisma. Never use any.\n'),
		['per-tool-entry-points']
	)
	assert.equal(results['per-tool-entry-points'].ok, false)
	assert.match(results['per-tool-entry-points'].detail, /CLAUDE\.md does not contain/)
})

test('per-tool-entry-points fails when an optional per-tool file exists without the import', () => {
	const results = withFixture(
		(root) => writeFileSync(join(root, 'GEMINI.md'), '# Gemini\n\nSome restated rules.\n'),
		['per-tool-entry-points']
	)
	assert.equal(results['per-tool-entry-points'].ok, false)
	assert.match(results['per-tool-entry-points'].detail, /GEMINI\.md exists but/)
})

test('commit-msg-hook fails when the hook is not executable on disk', () => {
	const results = withFixture(
		(root) => chmodSync(join(root, '.githooks/commit-msg'), 0o644),
		['commit-msg-hook']
	)
	assert.equal(results['commit-msg-hook'].ok, false)
	assert.match(results['commit-msg-hook'].detail, /not executable/)
})

test('commit-msg-hook fails when the hook is executable locally but not in the git index', () => {
	const results = withFixture(
		(root) => git(root, 'update-index', '--chmod=-x', '.githooks/commit-msg'),
		['commit-msg-hook']
	)
	assert.equal(results['commit-msg-hook'].ok, false)
	assert.match(results['commit-msg-hook'].detail, /100644 in the git index/)
})

test('commit-msg-hook fails when the hook does not call the shared script', () => {
	const results = withFixture(
		(root) => {
			writeFileSync(join(root, '.githooks/commit-msg'), '#!/usr/bin/env sh\nexit 0\n')
			chmodSync(join(root, '.githooks/commit-msg'), 0o755)
		},
		['commit-msg-hook']
	)
	assert.equal(results['commit-msg-hook'].ok, false)
	assert.match(
		results['commit-msg-hook'].detail,
		/does not call scripts\/check-commit-message\.mjs/
	)
})

test('secrets-scan fails when the scanner script is gone', () => {
	const results = withFixture(
		(root) => rmSync(join(root, 'scripts/check-secrets.mjs')),
		['secrets-scan']
	)
	assert.equal(results['secrets-scan'].ok, false)
	assert.match(results['secrets-scan'].detail, /check-secrets\.mjs is missing/)
})

test('secrets-scan fails when the pre-commit hook does not call the scanner', () => {
	const results = withFixture(
		(root) => {
			writeFileSync(join(root, '.githooks/pre-commit'), '#!/usr/bin/env sh\nexit 0\n')
			chmodSync(join(root, '.githooks/pre-commit'), 0o755)
		},
		['secrets-scan']
	)
	assert.equal(results['secrets-scan'].ok, false)
	assert.match(results['secrets-scan'].detail, /does not call scripts\/check-secrets\.mjs/)
})

test('secrets-scan fails when the pre-commit hook is executable locally but not in the git index', () => {
	const results = withFixture(
		(root) => git(root, 'update-index', '--chmod=-x', '.githooks/pre-commit'),
		['secrets-scan']
	)
	assert.equal(results['secrets-scan'].ok, false)
	assert.match(results['secrets-scan'].detail, /100644 in the git index/)
})

test('secrets-scan fails when CI stops running check:secrets', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text.replace('      - run: pnpm check:secrets\n', '')
			),
		['secrets-scan']
	)
	assert.equal(results['secrets-scan'].ok, false)
	assert.match(results['secrets-scan'].detail, /never runs check:secrets/)
})

test('hooks-path-installed fails when prepare no longer points git at .githooks', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'package.json', (text) => {
				const pkg = JSON.parse(text)
				delete pkg.scripts.prepare
				return JSON.stringify(pkg, null, '\t')
			}),
		['hooks-path-installed']
	)
	assert.equal(results['hooks-path-installed'].ok, false)
})

test('package-scripts names the missing gate and requires --max-warnings=0 on lint', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'package.json', (text) => {
				const pkg = JSON.parse(text)
				delete pkg.scripts['check:env']
				return JSON.stringify(pkg, null, '\t')
			}),
		['package-scripts']
	)
	assert.equal(results['package-scripts'].ok, false)
	assert.match(results['package-scripts'].detail, /check:env/)

	const warnings = withFixture(
		(root) =>
			edit(root, 'package.json', (text) => {
				const pkg = JSON.parse(text)
				pkg.scripts.lint = 'eslint .'
				return JSON.stringify(pkg, null, '\t')
			}),
		['package-scripts']
	)
	assert.equal(warnings['package-scripts'].ok, false)
	assert.match(warnings['package-scripts'].detail, /max-warnings=0/)
})

test('ci-gates-every-pr names the gate CI stopped running', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text.replace('      - run: pnpm test\n', '')
			),
		['ci-gates-every-pr']
	)
	assert.equal(results['ci-gates-every-pr'].ok, false)
	assert.match(results['ci-gates-every-pr'].detail, /never runs: test$/)
})

test('ci-gates-every-pr does not count a gate that only appears in a comment', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text.replace('      - run: pnpm test\n', '      # - run: pnpm test\n')
			),
		['ci-gates-every-pr']
	)
	assert.equal(results['ci-gates-every-pr'].ok, false)
	assert.match(results['ci-gates-every-pr'].detail, /never runs: test$/)
})

test('ci-gates-every-pr fails when the workflow does not trigger on pull requests', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text.replace('  pull_request:\n', '  workflow_dispatch:\n')
			),
		['ci-gates-every-pr']
	)
	assert.equal(results['ci-gates-every-pr'].ok, false)
	assert.match(results['ci-gates-every-pr'].detail, /pull_request/)
})

test('ci-gates-every-pr accepts npm run, yarn and bun invocations, not only pnpm', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text
					.replace('pnpm lint', 'npm run lint')
					.replace('pnpm typecheck', 'yarn typecheck')
					.replace('pnpm format:check', 'bun run format:check')
					.replace('pnpm test\n', 'npm test\n')
			),
		['ci-gates-every-pr']
	)
	assert.equal(results['ci-gates-every-pr'].ok, true, results['ci-gates-every-pr'].detail)
})

test('local-review-mirrors-ci fails when a CI gate is missing from the skill', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.claude/skills/local-review/SKILL.md', (text) =>
				text.replace('pnpm check:env\n', '')
			),
		['local-review-mirrors-ci']
	)
	assert.equal(results['local-review-mirrors-ci'].ok, false)
	assert.match(results['local-review-mirrors-ci'].detail, /check:env/)
})

test('eslint-effective-rules reads the resolved config, so a later block overriding the rule is caught', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'eslint.config.mjs', (text) =>
				text.replace(
					'export default eslintConfig',
					// A trailing block that flips the rule back off — last match wins.
					"eslintConfig.push({ files: ['src/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } })\nexport default eslintConfig"
				)
			),
		['eslint-effective-rules']
	)
	assert.equal(results['eslint-effective-rules'].ok, false)
	assert.match(results['eslint-effective-rules'].detail, /no-explicit-any is not an error/)
})

test('typescript-strict reads the resolved config', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'tsconfig.json', (text) => text.replace('"strict": true', '"strict": false')),
		['typescript-strict']
	)
	assert.equal(results['typescript-strict'].ok, false)
	assert.match(results['typescript-strict'].detail, /strict/)
})

test('env-schema fails when the schema stops going through zod', () => {
	const results = withFixture(
		(root) => writeFileSync(join(root, 'src/lib/env.ts'), 'export const env = process.env\n'),
		['env-schema']
	)
	assert.equal(results['env-schema'].ok, false)
	assert.match(results['env-schema'].detail, /does not import zod/)
})

test('no-machine-local-state-tracked flags a tracked .vercel/project.json, even nested', () => {
	const results = withFixture(
		(root) => {
			mkdirSync(join(root, 'nested/site/.vercel'), { recursive: true })
			writeFileSync(join(root, 'nested/site/.vercel/project.json'), '{"projectId":"prj_x"}\n')
			git(root, 'add', '-f', 'nested/site/.vercel/project.json')
		},
		['no-machine-local-state-tracked']
	)
	assert.equal(results['no-machine-local-state-tracked'].ok, false)
	assert.match(results['no-machine-local-state-tracked'].detail, /\.vercel/)
})

test('no-machine-local-state-tracked allows .env.example and nothing else in the .env family', () => {
	const results = withFixture(
		(root) => {
			writeFileSync(join(root, '.env.local'), 'SECRET=1\n')
			git(root, 'add', '-f', '.env.local')
		},
		['no-machine-local-state-tracked']
	)
	assert.equal(results['no-machine-local-state-tracked'].ok, false)
	assert.match(results['no-machine-local-state-tracked'].detail, /\.env\.local/)
})

test('machine-local-state-ignored flags patterns that only match at the root', () => {
	const results = withFixture(
		(root) =>
			writeFileSync(
				join(root, '.gitignore'),
				'/node_modules/\n/.vercel/\n.env\n.env.local\n.env.production\n.DS_Store\nsupabase/.temp/\n'
			),
		['machine-local-state-ignored']
	)
	assert.equal(results['machine-local-state-ignored'].ok, false)
	assert.match(
		results['machine-local-state-ignored'].detail,
		/nested\/dir\/\.vercel\/project\.json/
	)
	assert.match(results['machine-local-state-ignored'].detail, /nested\/node_modules\/x\.js/)
})

test('session-logs-tracked fails when transcripts are gitignored', () => {
	const results = withFixture(
		(root) => edit(root, '.gitignore', (text) => `${text}\n.claude-logs/\n`),
		['session-logs-tracked']
	)
	assert.equal(results['session-logs-tracked'].ok, false)
	assert.match(results['session-logs-tracked'].detail, /gitignored/)
})

test('session-logs-tracked fails when Prettier is not told to skip the transcripts', () => {
	const results = withFixture(
		(root) => writeFileSync(join(root, '.prettierignore'), 'dist/\n'),
		['session-logs-tracked']
	)
	assert.equal(results['session-logs-tracked'].ok, false)
	assert.match(results['session-logs-tracked'].detail, /\.prettierignore does not list/)
})

test('session-logs-tracked names the one present log dir left out of prettierignore', () => {
	const results = withFixture(
		(root) => edit(root, '.prettierignore', (text) => text.replace('.codex-logs/\n', '')),
		['session-logs-tracked']
	)
	assert.equal(results['session-logs-tracked'].ok, false)
	assert.match(results['session-logs-tracked'].detail, /does not list \.codex-logs\//)
})

test('session-logs-tracked passes a Claude-only repo with no .codex-logs dir', () => {
	const results = withFixture(
		(root) => {
			rmSync(join(root, '.codex-logs'), { recursive: true, force: true })
			edit(root, '.prettierignore', (text) => text.replace('.codex-logs/\n', ''))
		},
		['session-logs-tracked']
	)
	assert.equal(results['session-logs-tracked'].ok, true, results['session-logs-tracked'].detail)
})

test('git-backed checks fail, not skip, outside a git repository', () => {
	const root = mkdtempSync(join(tmpdir(), 'check-standards-nogit-'))
	try {
		const { results } = runStandardsChecks({
			root,
			ids: ['no-machine-local-state-tracked', 'machine-local-state-ignored', 'session-logs-tracked']
		})
		assert.equal(results.length, 3)
		for (const result of results) {
			assert.equal(result.ok, false)
			assert.match(result.detail, /not a git repository/)
		}
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test('the CLI exits 1 and reports the failure as JSON when a standard is unmet', () => {
	const root = createFixture()
	try {
		rmSync(join(root, 'README.md'))
		let stdout
		let status = 0
		try {
			stdout = execFileSync(process.execPath, [SCRIPT, '--root', root, '--json'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			})
		} catch (error) {
			stdout = error.stdout
			status = error.status
		}
		assert.equal(status, 1)
		const report = JSON.parse(stdout)
		assert.equal(report.isMet, false)
		assert.equal(report.results.find((result) => result.id === 'readme').ok, false)
		assert.ok(existsSync(join(root, 'AGENTS.md')), 'the fixture is otherwise intact')
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

test('prisma-only-data-path fails when @prisma/client drops out of the restricted-imports group', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'eslint.config.mjs', (text) => text.replace("\t\t'@prisma/client',\n", '')),
		['prisma-only-data-path']
	)
	assert.equal(results['prisma-only-data-path'].ok, false)
	assert.match(results['prisma-only-data-path'].detail, /does not ban: @prisma\/client/)
})

test('supabase-auth-only fails when a wrapper hands out the full client', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'src/lib/supabase/server.ts', (text) =>
				text.replace(': Promise<AuthOnlySupabaseClient>', '')
			),
		['supabase-auth-only']
	)
	assert.equal(results['supabase-auth-only'].ok, false)
	assert.match(
		results['supabase-auth-only'].detail,
		/server\.ts does not return AuthOnlySupabaseClient/
	)
})

test('supabase-auth-only fails when the auth-only type is widened to a data path', () => {
	const results = withFixture(
		(root) =>
			edit(root, 'src/lib/supabase/auth-only.ts', (text) =>
				text.replace("'auth'>", "'auth' | 'from'>")
			),
		['supabase-auth-only']
	)
	assert.equal(results['supabase-auth-only'].ok, false)
	assert.match(results['supabase-auth-only'].detail, /exposes from\/rpc/)
})

test('rls-check-wired fails when the check script is gone', () => {
	const results = withFixture(
		(root) => rmSync(join(root, 'scripts/check-rls.mjs')),
		['rls-check-wired']
	)
	assert.equal(results['rls-check-wired'].ok, false)
	assert.match(results['rls-check-wired'].detail, /check-rls\.mjs is missing/)
})

test('rls-check-wired fails when CI runs the check before the migrations are applied', () => {
	const results = withFixture(
		(root) =>
			edit(root, '.github/workflows/ci.yml', (text) =>
				text.replace(
					'      - run: pnpm install --frozen-lockfile # postinstall runs `prisma generate`\n',
					'      - run: pnpm install --frozen-lockfile # postinstall runs `prisma generate`\n      - run: pnpm check:rls\n'
				)
			),
		['rls-check-wired']
	)
	assert.equal(results['rls-check-wired'].ok, false)
	assert.match(results['rls-check-wired'].detail, /before the migrations are applied/)
})
