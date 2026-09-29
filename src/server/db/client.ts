import 'server-only'
import { PrismaClient } from '@prisma/client'

// Re-exported from the one file allowed to import @prisma/client, so callers
// that need the Prisma namespace at runtime — e.g. Prisma.DbNull to clear a
// nullable Json column, or Prisma.* input types — get it from here rather than
// reaching for the banned package directly. See docs/rules/database.md.
export { Prisma } from '@prisma/client'

// Cache the client on globalThis outside production so hot-reload during
// `next dev` doesn't open a fresh connection pool on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = db
}
