#!/usr/bin/env node
// Prints the latest messages sent from the Contact us page, newest first,
// from the LOCAL database: the only place they're kept (nothing is emailed or
// sent anywhere). They're personal data (a name, an email, what was written),
// so this reads them and nothing else:
//
//   - read-only: one select, no write of any kind;
//   - only the latest N (default 20, at most 200), never the whole table;
//   - only the date, name, email and message: never the hashed IP;
//   - only from a database on this machine: it refuses any other host, so it
//     can't be pointed at a real database by accident.
//
// Usage (DATABASE_URL from .env.local, as `pnpm dev` reads it):
//
//   pnpm contact:messages            # the latest 20
//   pnpm contact:messages --limit 5
//
// Exit codes: 0 printed (or there are none), 1 refused or failed.

import prismaClientModule from '@prisma/client'
import { pathToFileURL } from 'node:url'

const { PrismaClient } = prismaClientModule

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 200
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Whether `url` is a Postgres database on this machine. A malformed URL isn't. */
export function isLocalDatabase(url) {
	try {
		const { protocol, hostname } = new URL(url)
		return /^postgres(ql)?:$/.test(protocol) && LOCAL_HOSTS.has(hostname)
	} catch {
		return false
	}
}

/** How many to print, from `--limit N`: the default when absent; null when N isn't 1 to MAX_LIMIT. */
export function parseLimit(args) {
	const at = args.indexOf('--limit')
	if (at === -1) return DEFAULT_LIMIT
	const value = args[at + 1]
	const limit = /^\d+$/.test(value ?? '') ? Number(value) : NaN
	return limit >= 1 && limit <= MAX_LIMIT ? limit : null
}

/**
 * The latest `limit` messages, newest first: one select of the four columns
 * printed, so the hashed IP is never even read.
 */
export function readLatest(db, limit) {
	return db.contactMessage.findMany({
		select: { createdAt: true, name: true, email: true, message: true },
		orderBy: { createdAt: 'desc' },
		take: limit
	})
}

/** The messages as plain text, one block each, newest first. */
export function formatMessages(rows) {
	if (rows.length === 0) return 'No contact messages yet.'
	const blocks = rows.map(({ createdAt, name, email, message }) => {
		const when = `${createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
		return `${when} · ${name ?? '(no name)'} <${email}>\n${message}`
	})
	const heading = `${rows.length} latest contact ${rows.length === 1 ? 'message' : 'messages'}, newest first:`
	return [heading, ...blocks].join('\n\n')
}

async function main() {
	const url = process.env.DATABASE_URL
	if (!url || !isLocalDatabase(url)) {
		console.error(
			'Refused: DATABASE_URL must point at a database on this machine (localhost). Contact messages are personal data and are only read locally.'
		)
		process.exit(1)
	}
	const limit = parseLimit(process.argv.slice(2))
	if (limit === null) {
		console.error(`--limit takes a whole number from 1 to ${MAX_LIMIT}.`)
		process.exit(1)
	}
	const db = new PrismaClient()
	try {
		console.log(formatMessages(await readLatest(db, limit)))
	} finally {
		await db.$disconnect()
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`Couldn't read the contact messages: ${error.message}`)
		process.exit(1)
	})
}
