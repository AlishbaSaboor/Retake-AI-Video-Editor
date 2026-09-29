#!/usr/bin/env node
// Verifies Row Level Security on the database DATABASE_URL points at — the
// state Postgres reports, not the SQL text — once the migrations are applied.
// Every table has RLS enabled, no table has a policy, no table is FORCEd.
// docs/rules/auth.md has the why: enabled with no policies is a deny-by-default
// lock on the anon and authenticated roles, so the Data API can never read a
// row even if it is switched on later, while Prisma (the table owner) is
// unaffected — which is exactly what FORCE would break.
//
// RLS is not in the Prisma schema, so the drift check cannot see it. This runs
// at the end of CI's migrations job against the replayed database, and locally
// against any database with the migrations applied:
//
//   DATABASE_URL=postgresql://... pnpm check:rls
//
// Exit codes: 0 every table locked, 1 a table is not (or there are none).

import prismaClientModule from '@prisma/client'
import { pathToFileURL } from 'node:url'

const { PrismaClient } = prismaClientModule

// Tables this project deliberately leaves without RLS. Ships empty — the rule
// is every table — and is the one place an exception is recorded, with a
// comment saying why, so the check can never be relaxed quietly, table by
// table, across migrations. FORCE and policies are refused even here.
export const RLS_EXEMPT_TABLES = []

// Prisma's own bookkeeping: not application data, and not a table a migration
// should touch.
const PRISMA_INTERNAL_TABLES = new Set(['_prisma_migrations'])

export function evaluateRlsState(tables, { exemptTables = RLS_EXEMPT_TABLES } = {}) {
	if (tables.length === 0) {
		return { ok: false, problems: ['the database has no tables — were the migrations applied?'] }
	}
	const exempt = new Set(exemptTables)
	const problems = []
	for (const table of tables) {
		if (PRISMA_INTERNAL_TABLES.has(table.name)) continue
		if (table.isForced) {
			problems.push(
				`${table.name}: FORCE ROW LEVEL SECURITY is on — that subjects the owner to policies that ` +
					`do not exist, which locks Prisma out. Enable, don't force.`
			)
		}
		if (table.policyCount > 0) {
			problems.push(
				`${table.name}: has ${table.policyCount} RLS ${table.policyCount === 1 ? 'policy' : 'policies'} — ` +
					`the standard is RLS with no policies; a policy is a PostgREST path nothing sanctioned uses`
			)
		}
		if (exempt.has(table.name)) continue
		if (!table.isEnabled) {
			problems.push(
				`${table.name}: RLS is not enabled — add \`ALTER TABLE "${table.name}" ENABLE ROW LEVEL SECURITY;\` ` +
					`in a migration, or list it in RLS_EXEMPT_TABLES with the reason`
			)
		}
	}
	return { ok: problems.length === 0, problems }
}

async function fetchTables(db) {
	// pg_class is what Postgres itself acts on: relrowsecurity and
	// relforcerowsecurity are the two flags `ALTER TABLE ... ROW LEVEL SECURITY`
	// sets. current_schema() follows the ?schema= in DATABASE_URL, the same
	// schema Prisma migrates. A catalog query is the sanctioned use of
	// $queryRaw — nothing in the Prisma schema can express it.
	return db.$queryRaw`
		SELECT c.relname AS "name",
		       c.relrowsecurity AS "isEnabled",
		       c.relforcerowsecurity AS "isForced",
		       (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS "policyCount"
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p')
		ORDER BY c.relname
	`
}

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error(
			'DATABASE_URL is not set. This check reads a database — point it at one with the migrations applied.'
		)
		process.exit(1)
	}

	const db = new PrismaClient()
	let tables
	try {
		tables = await fetchTables(db)
	} finally {
		await db.$disconnect()
	}

	const { ok, problems } = evaluateRlsState(tables)
	if (!ok) {
		console.error('Row Level Security check failed:\n')
		for (const problem of problems) console.error(`  - ${problem}`)
		console.error('\nSee docs/rules/auth.md, "RLS on, no policies — the deny-by-default backstop".')
		process.exit(1)
	}

	const checked = tables.filter((table) => !PRISMA_INTERNAL_TABLES.has(table.name))
	const exemptNote = RLS_EXEMPT_TABLES.length > 0 ? ` (${RLS_EXEMPT_TABLES.length} exempt)` : ''
	console.log(`RLS enabled with no policies on all ${checked.length} table(s)${exemptNote}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main()
}
