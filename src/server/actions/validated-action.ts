import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { captureError } from '@/lib/observability/capture-error'
import { enforceAuthorize, type AdminContext } from '@/lib/rbac/context'
import type { Permission } from '@/lib/rbac/permissions'
import type { AiAllowanceKind } from '@/lib/ai-limits'
import { providerDidNotCharge } from '@/server/ai/not-charged'
import { requireUser } from '@/server/auth/session'
import { allowanceUsedUp, giveBackAllowance, takeAllowance } from '@/server/lib/ai-allowance'

export type ActionResult<Output> =
	{ ok: true; data: Output } | { ok: false; error: string; status: number }

// Server Actions' counterpart to createApiRoute (src/server/api/route-factory.ts)
// — same Zod-validated input, same captureError reporting, but returns a
// result object instead of a Response: a Server Action's return value goes
// straight to whatever called it (a form, a mutation), not through
// NextResponse. Never let a Server Action throw past this — an uncaught
// throw crosses the server→client boundary as a stripped, digest-only
// error Next can't recover from cleanly. See docs/rules/error-handling.md.
export function validatedAction<InputSchema extends z.ZodType, Output>(config: {
	input: InputSchema
	// Optional admin authorization gate, run BEFORE input parsing/handler — a
	// permission key or a predicate over the resolved AdminContext. Throws
	// AppError on failure, which the catch turns into { ok:false, error, status }.
	// Omit for actions that aren't admin-gated. See docs/rules/authorization.md.
	authorize?: Permission | ((ctx: AdminContext) => boolean | Promise<boolean>)
	// Signed-in users only, run BEFORE input parsing/handler: every action
	// that spends money on a provider. Fails closed (requireUser); the page's
	// redirect in proxy.ts is not a guard. See docs/rules/auth.md.
	signedIn?: boolean
	// The paid AI kind this action spends (src/lib/ai-limits.ts): implies
	// signedIn. One of the user's daily allowance is taken AFTER input
	// parsing (a malformed request costs nothing) and BEFORE the handler
	// calls the provider; at the ceiling it refuses with the reset time and
	// calls nothing. Given back only when the handler fails because the
	// provider certainly didn't charge (src/server/ai/not-charged.ts): an
	// unset key, or a 4xx or 5xx reply. A reply that can't be used, a
	// timeout or any other error keeps it used.
	allowance?: AiAllowanceKind
	handler: (input: z.infer<InputSchema>) => Promise<Output>
}) {
	return async function (rawInput: unknown): Promise<ActionResult<Output>> {
		try {
			if (config.authorize !== undefined) {
				await enforceAuthorize(config.authorize)
			}
			const user = config.signedIn || config.allowance !== undefined ? await requireUser() : null

			const input = config.input.parse(rawInput)
			if (!user || config.allowance === undefined) {
				return { ok: true, data: await config.handler(input) }
			}
			const kind = config.allowance
			const now = new Date()
			const day = await takeAllowance(user.id, kind, now)
			if (!day) throw allowanceUsedUp(kind, now)
			try {
				return { ok: true, data: await config.handler(input) }
			} catch (error) {
				if (providerDidNotCharge(error)) {
					// A failed give-back only costs the user that one call.
					await giveBackAllowance(user.id, kind, day).catch((giveBackError: unknown) =>
						captureError(giveBackError, { feature: 'ai_allowance' })
					)
				}
				throw error
			}
		} catch (error) {
			// redirect()/notFound() called inside the handler are implemented
			// as thrown errors — must run first, or a post-mutation redirect
			// silently turns into a generic { ok: false } result instead of
			// actually navigating.
			unstable_rethrow(error)

			if (error instanceof z.ZodError) {
				return { ok: false, error: 'Invalid request', status: 400 }
			}
			const { userMessage, status } = captureError(error)
			return { ok: false, error: userMessage, status }
		}
	}
}
