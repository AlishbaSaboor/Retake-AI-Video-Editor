#!/usr/bin/env node
// Applies prisma/run-once.sql to a database exactly once per version of the
// file. .github/workflows/deploy-migrations.yml runs this against production
// right after `prisma migrate deploy` on every push to main; ci.yml's
// migrations job runs it against a throwaway Postgres on every PR, where the
// ledger is empty and the file always applies, so a broken one-off fails
// there instead of on main. docs/rules/migrations.md ("Run-once SQL") is the
// policy for what belongs in the file.
//
// "Once" is a ledger: the _run_once_sql table (prisma/schema/run-once-sql.prisma)
// holds the SHA-256 of every file version this database has applied. A
// version is the file's executable content — comments and whitespace don't
// count, so a doc tweak never re-runs a one-off. The ledger row and the SQL go
// to Postgres as ONE command, which runs as one implicit transaction: either
// both land or neither does, so a failed one-off is retried on the next deploy
// and a successful one can never run twice.
//
// Usage:
//   node scripts/run-once-sql.mjs                     DIRECT_URL, else DATABASE_URL
//   node scripts/run-once-sql.mjs --db-url <url>
//   node scripts/run-once-sql.mjs --file <path>       default prisma/run-once.sql

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const DEFAULT_FILE = 'prisma/run-once.sql'
const LEDGER_TABLE = '_run_once_sql'
const SHORT_HASH_LENGTH = 12
// Prisma's "table does not exist" error: the ledger migration hasn't been
// applied to this database yet.
const PRISMA_TABLE_MISSING_CODE = 'P2021'

export function parseArgs(argv) {
	const get = (flag) => {
		const i = argv.indexOf(flag)
		return i === -1 ? undefined : argv[i + 1]
	}
	return {
		dbUrl: get('--db-url'),
		file: get('--file') ?? DEFAULT_FILE
	}
}

// The direct/session connection is what the migration commands just used, so
// the one-off sees the database in the state they left it; the app's pooler
// URL is the fallback for a local setup that only defines DATABASE_URL. An
// empty string counts as unset — that is what an unconfigured GitHub secret
// expands to.
export function resolveDatabaseUrl({ dbUrl, env }) {
	return [dbUrl, env.DIRECT_URL, env.DATABASE_URL].find((value) => value != null && value !== '')
}

// CI logs are retained and shared: never print credentials, and drop the
// query string too, since a Postgres URL can carry `?password=` there.
export function redactDatabaseUrl(url) {
	try {
		const parsed = new URL(url)
		return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
	} catch {
		return '<unparseable database url>'
	}
}

function stripComments(sqlText) {
	return sqlText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

// The identity of a file version: its executable content, comments removed
// and whitespace collapsed, hashed. Null when there is nothing to run.
export function fingerprint(sqlText) {
	const normalized = stripComments(sqlText).replace(/\s+/g, ' ').trim()
	if (normalized === '') {
		return null
	}
	return createHash('sha256').update(normalized).digest('hex')
}

// The ledger insert goes FIRST: a version already in the ledger fails on the
// primary key before any of its SQL runs, and the whole command rolls back.
export function buildScript({ hash, sqlText }) {
	const sqlLiteral = sqlText.replace(/'/g, "''")
	return `INSERT INTO "${LEDGER_TABLE}" ("hash", "sql") VALUES ('${hash}', '${sqlLiteral}');\n\n${sqlText}\n`
}

async function findApplied({ url, hash }) {
	const prisma = new PrismaClient({ datasourceUrl: url })
	try {
		return await prisma.runOnceSql.findUnique({ where: { hash }, select: { appliedAt: true } })
	} finally {
		await prisma.$disconnect()
	}
}

async function main() {
	const { dbUrl, file } = parseArgs(process.argv.slice(2))

	const url = resolveDatabaseUrl({ dbUrl, env: process.env })
	if (url == null) {
		console.error('Missing database URL: pass --db-url <url> or set DIRECT_URL / DATABASE_URL.')
		process.exit(1)
	}
	const target = redactDatabaseUrl(url)

	let sqlText
	try {
		sqlText = readFileSync(file, 'utf-8')
	} catch {
		console.error(`Cannot read ${file}.`)
		process.exit(1)
	}

	const hash = fingerprint(sqlText)
	if (hash == null) {
		console.log(`${file} has no statements — nothing to run.`)
		process.exit(0)
	}
	const version = hash.slice(0, SHORT_HASH_LENGTH)

	let applied
	try {
		applied = await findApplied({ url, hash })
	} catch (error) {
		if (error?.code === PRISMA_TABLE_MISSING_CODE) {
			console.error(
				`The ${LEDGER_TABLE} table does not exist on ${target} — apply the migrations first (\`pnpm exec prisma migrate deploy\`).`
			)
			process.exit(1)
		}
		throw error
	}
	if (applied != null) {
		console.log(
			`${file} (version ${version}) was already applied to ${target} on ${applied.appliedAt.toISOString()} — nothing to run.`
		)
		process.exit(0)
	}

	console.log(`Applying ${file} (version ${version}) to ${target} ...`)
	try {
		const output = execFileSync(
			'pnpm',
			['exec', 'prisma', 'db', 'execute', '--stdin', '--url', url],
			{
				input: buildScript({ hash, sqlText }),
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe']
			}
		)
		process.stdout.write(output)
	} catch (error) {
		// The ledger insert goes first, so a race with another run of this same
		// version fails on the primary key — and the only proof of that is the
		// row the other run committed. If it is there now, this version has
		// been applied and nothing is wrong; if not, the failure is real.
		if ((await findApplied({ url, hash })) != null) {
			console.log(`${file} (version ${version}) was applied by a concurrent run — nothing to run.`)
			process.exit(0)
		}
		process.stderr.write(`${error.stdout ?? ''}${error.stderr ?? ''}`)
		process.exit(typeof error.status === 'number' && error.status !== 0 ? error.status : 1)
	}
	console.log(`Applied ${file} and recorded version ${version} in ${LEDGER_TABLE}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error)
		process.exit(1)
	})
}
