#!/usr/bin/env node
// Fails if any process.env.X reference in src/ isn't declared in both
// .env.example and src/lib/env.ts's Zod schema — keeps the two from
// drifting apart as the project grows (8x-marketing shipped a real
// undeclared-env-var bug that its own security audit flagged and never
// fixed; this check exists so that doesn't happen here).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const SRC_DIR = 'src'
const ENV_EXAMPLE_PATH = '.env.example'
const ENV_SCHEMA_PATH = 'src/lib/env.ts'

// Standard Node/Next.js runtime vars — always present, never app config,
// not worth requiring in .env.example or the Zod schema.
const ALLOWLIST = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL', 'VERCEL_ENV', 'CI'])

function walk(dir) {
	const entries = readdirSync(dir)
	const files = []
	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const stat = statSync(fullPath)
		if (stat.isDirectory()) {
			files.push(...walk(fullPath))
		} else if (['.ts', '.tsx'].includes(extname(fullPath))) {
			files.push(fullPath)
		}
	}
	return files
}

function extractEnvVarUsages(files) {
	const used = new Set()
	const pattern = /process\.env\.([A-Z0-9_]+)/g
	for (const file of files) {
		const content = readFileSync(file, 'utf-8')
		for (const match of content.matchAll(pattern)) {
			used.add(match[1])
		}
	}
	return used
}

function extractDeclaredVars(path, pattern) {
	const content = readFileSync(path, 'utf-8')
	const declared = new Set()
	for (const match of content.matchAll(pattern)) {
		declared.add(match[1])
	}
	return declared
}

const used = extractEnvVarUsages(walk(SRC_DIR))
const inExample = extractDeclaredVars(ENV_EXAMPLE_PATH, /^([A-Z0-9_]+)=/gm)
const inSchema = extractDeclaredVars(ENV_SCHEMA_PATH, /^\s*([A-Z0-9_]+):\s*z\./gm)

const missing = [...used].filter(
	(name) => !ALLOWLIST.has(name) && (!inExample.has(name) || !inSchema.has(name))
)

if (missing.length > 0) {
	console.error(
		'The following env vars are used in src/ but missing from .env.example and/or src/lib/env.ts:'
	)
	for (const name of missing) {
		console.error(
			`  - ${name} (in .env.example: ${inExample.has(name)}, in env.ts: ${inSchema.has(name)})`
		)
	}
	process.exit(1)
}

console.log(`OK — ${used.size} env vars used, all declared in .env.example and env.ts.`)
