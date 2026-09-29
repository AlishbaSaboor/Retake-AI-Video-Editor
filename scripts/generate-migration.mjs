#!/usr/bin/env node
// Generates the missing Prisma migration by diffing the schema against a
// database that has every already-committed migration replayed onto it —
// the diff between "replayed history" and "current schema" IS the missing
// migration. Ported from 8x-core's proven pattern; see
// docs/rules/migrations.md for the full policy this script enforces (never
// hand-write a migration, one sanctioned exception below). Note: the
// parent org-level `.claude/rules/migrations.md` (if this repo is opened
// alongside other 8x repos) describes the Supabase-CLI migration workflow
// used elsewhere in the org — it does NOT apply here; docs/rules/migrations.md
// supersedes it for this repo.
//
// Usage:
//   node scripts/generate-migration.mjs --name <branch-derived-name> --db-url <url>
//   node scripts/generate-migration.mjs --check --db-url <url>   (dry run, CI guard on main)
//
// Requires DATABASE_URL (or --db-url) to already have every migration in
// prisma/schema/migrations/ replayed onto it (`prisma migrate deploy`) —
// this script only diffs from there, it does not replay history itself.

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMA_DIR = 'prisma/schema'
const MIGRATIONS_DIR = join(SCHEMA_DIR, 'migrations')

// Patterns that indicate `prisma migrate diff` chose a destructive rewrite
// (usually because it can't tell a rename from a drop-and-add). Any match
// here means the generator refuses to write anything — a human has to
// hand-write data-preserving SQL and a backfill instead. This is the ONE
// sanctioned exception to "never hand-write a migration."
const DESTRUCTIVE_PATTERNS = [
	/DROP TABLE/i,
	/DROP COLUMN/i,
	/DROP TYPE/i,
	/DROP SCHEMA/i,
	/ALTER COLUMN .+ SET NOT NULL/i,
	/ALTER COLUMN .+ SET DATA TYPE/i,
	/DROP NOT NULL.+USING/i
]

function parseArgs() {
	const args = process.argv.slice(2)
	const get = (flag) => {
		const i = args.indexOf(flag)
		return i === -1 ? undefined : args[i + 1]
	}
	return {
		check: args.includes('--check'),
		name: get('--name') ?? 'unnamed_migration',
		dbUrl: get('--db-url') ?? process.env.DATABASE_URL
	}
}

function sanitizeName(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 60)
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '')
}

function findDestructivePattern(sql) {
	return DESTRUCTIVE_PATTERNS.find((pattern) => pattern.test(sql))
}

function main() {
	const { check, name, dbUrl } = parseArgs()

	if (!dbUrl) {
		console.error('Missing --db-url (or DATABASE_URL env var)')
		process.exit(1)
	}

	const diff = execSync(
		`pnpm prisma migrate diff --from-url "${dbUrl}" --to-schema-datamodel ${SCHEMA_DIR} --script`,
		{ encoding: 'utf-8' }
	).trim()

	const isEmptyDiff = diff.split('\n').every((line) => line.startsWith('--') || line.trim() === '')

	if (isEmptyDiff) {
		console.log('No schema drift detected — nothing to generate.')
		process.exit(0)
	}

	const destructive = findDestructivePattern(diff)
	if (destructive) {
		console.error(
			`Refusing to auto-generate this migration — it contains a destructive pattern (${destructive}):\n\n${diff}\n\n` +
				'This usually means prisma migrate diff cannot tell a rename from a drop+add, or a NOT NULL/type change ' +
				'would fail against existing rows. Hand-write data-preserving SQL (and a backfill if needed) in a new ' +
				'migration created with `prisma migrate dev --create-only`, per .claude/rules/migrations.md.'
		)
		process.exit(2)
	}

	if (check) {
		console.log('Migration would be generated (dry run, nothing written):\n')
		console.log(diff)
		process.exit(0)
	}

	const dirName = `${timestamp()}_${sanitizeName(name)}`
	const migrationDir = join(MIGRATIONS_DIR, dirName)
	mkdirSync(migrationDir, { recursive: true })
	writeFileSync(join(migrationDir, 'migration.sql'), diff + '\n')
	console.log(`Wrote ${join(migrationDir, 'migration.sql')}`)

	// Replay the migration we just wrote, proving it applies — not just
	// that it was syntactically generated.
	execSync(`pnpm prisma migrate deploy`, {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: dbUrl }
	})
	console.log('Replayed successfully.')
}

main()
