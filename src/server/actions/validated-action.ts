import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { captureError } from '@/lib/observability/capture-error'
import { enforceAuthorize, type AdminContext } from '@/lib/rbac/context'
import type { Permission } from '@/lib/rbac/permissions'

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
	handler: (input: z.infer<InputSchema>) => Promise<Output>
}) {
	return async function (rawInput: unknown): Promise<ActionResult<Output>> {
		try {
			if (config.authorize !== undefined) {
				await enforceAuthorize(config.authorize)
			}

			const input = config.input.parse(rawInput)
			const data = await config.handler(input)
			return { ok: true, data }
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
