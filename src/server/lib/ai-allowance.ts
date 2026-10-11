import 'server-only'
import { DAILY_AI_LIMITS, type AiAllowanceKind } from '@/lib/ai-limits'
import { AppError } from '@/lib/errors/app-error'
import { db, Prisma } from '@/server/db/client'

// Each signed-in user's daily ceiling on the paid AI actions
// (DAILY_AI_LIMITS), counted in ai_allowances by user, UTC day and kind.
// Taking one is a single conditional update, so simultaneous requests can't
// pass the ceiling; validatedAction takes one before the handler calls the
// provider and gives it back if the handler fails.

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** The UTC day `now` falls on, as the `day` column holds it. */
export function utcDay(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** The plain refusal once today's `kind` is used up: what, and when it resets. */
export function allowanceUsedUp(kind: AiAllowanceKind, now: Date): AppError {
	const { perDay, what } = DAILY_AI_LIMITS[kind]
	const minutes = Math.ceil((utcDay(now).getTime() + DAY_MS - now.getTime()) / MINUTE_MS)
	const hours = Math.floor(minutes / 60)
	const wait = hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
	return new AppError(
		`You've used today's ${perDay} ${what}. They reset at midnight UTC, in ${wait}.`,
		{ status: 429, code: 'ai_allowance' }
	)
}

/**
 * Takes one of today's `kind` for `userId`, unless the day's ceiling is
 * reached: the day taken, or null. One conditional update counts it; the
 * day's first call creates the row, and if another request created it first
 * (a unique-key conflict), it's counted against that row instead.
 */
export async function takeAllowance(
	userId: string,
	kind: AiAllowanceKind,
	now: Date
): Promise<Date | null> {
	const day = utcDay(now)
	const counted = async () => {
		const { count } = await db.aiAllowance.updateMany({
			where: { userId, day, kind, used: { lt: DAILY_AI_LIMITS[kind].perDay } },
			data: { used: { increment: 1 } }
		})
		return count === 1
	}
	if (await counted()) return day
	try {
		await db.aiAllowance.create({ data: { userId, day, kind, used: 1 } })
		return day
	} catch (error) {
		if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
			throw error
		}
		return (await counted()) ? day : null
	}
}

/** Gives back one of `kind` taken on `day`: the call it was taken for failed. */
export async function giveBackAllowance(
	userId: string,
	kind: AiAllowanceKind,
	day: Date
): Promise<void> {
	await db.aiAllowance.updateMany({
		where: { userId, day, kind, used: { gt: 0 } },
		data: { used: { decrement: 1 } }
	})
}
