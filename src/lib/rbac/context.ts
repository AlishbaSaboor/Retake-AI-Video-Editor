import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { AdminMember, AdminRole, User } from '@prisma/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { db } from '@/server/db/client'
import { AppError } from '@/lib/errors/app-error'
import { PERMISSION_GROUPS, type Permission } from './permissions'
import { effectivePermissions, ROLE_RANK } from './roles'

// The resolved admin context for a request. `user` + `member` are the Prisma
// rows; `permissions` is the effective set as a serialisable array (the admin
// layout passes it straight to <AuthzProvider>); `has` answers a check without
// re-deriving. Resolved once per request via cache(), so a layout, a page and
// an action in the same request share one session read + one DB read.
export type AdminContext = {
	user: User
	member: AdminMember
	permissions: Permission[]
	has: (permission: Permission) => boolean
}

// The signed-in Supabase auth user id, or null. cache()'d so requireAdmin and
// getAdminContext don't each make the network call.
const getSessionUserId = cache(async (): Promise<string | null> => {
	const supabase = await createServerSupabaseClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()
	return user?.id ?? null
})

// The current request's admin context, or null when the caller holds no active
// admin seat (or there is no session) — i.e. every non-staff user. cache()'d.
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
	const userId = await getSessionUserId()
	if (!userId) return null

	const record = await db.adminMember.findUnique({
		where: { userId },
		include: { user: true }
	})
	if (!record || !record.isActive) return null

	const { user, ...member } = record
	const permissions = effectivePermissions(member)
	const set = new Set<string>(permissions)
	return { user, member, permissions, has: (permission) => set.has(permission) }
})

// The two admin-gate failures, as factories so the message + status + code live
// in one place: no session -> 401 unauthorized, signed-in-but-no-access -> 403
// forbidden. Guards throw these; the route/action factories translate them.
const unauthorized = () => new AppError('You must sign in.', { status: 401, code: 'unauthorized' })

const forbidden = () =>
	new AppError('You do not have access to this.', { status: 403, code: 'forbidden' })

// Coarse gate: any active admin seat (the gate the admin layout uses). Throws
// unauthorized (no session) or forbidden (signed in, not staff) so the redirect
// twin can route each. Per-capability checks use requirePermission.
export async function requireAdmin(): Promise<AdminContext> {
	const context = await getAdminContext()
	if (context) return context
	const userId = await getSessionUserId()
	if (!userId) throw unauthorized()
	throw forbidden()
}

// THE per-capability gate — call at the top of an admin action/route with the
// permission it needs. Returns the context so the caller can read ctx.user etc.
export async function requirePermission(permission: Permission): Promise<AdminContext> {
	const context = await requireAdmin()
	if (!context.has(permission)) {
		throw forbidden()
	}
	return context
}

// Tier gate — the caller's role must rank at or above `role`.
export async function requireAtLeastRole(role: AdminRole): Promise<AdminContext> {
	const context = await requireAdmin()
	if (ROLE_RANK[context.member.role] < ROLE_RANK[role]) {
		throw forbidden()
	}
	return context
}

// The gate the route/action factories' `authorize` option runs: a permission
// key, or a predicate over the resolved context. Throws forbidden on a false
// predicate; the string form delegates to requirePermission.
export async function enforceAuthorize(
	authorize: Permission | ((ctx: AdminContext) => boolean | Promise<boolean>)
): Promise<AdminContext> {
	if (typeof authorize === 'string') return requirePermission(authorize)
	const context = await requireAdmin()
	if (!(await authorize(context))) {
		throw forbidden()
	}
	return context
}

// Page twin of requirePermission: a signed-in non-staff user bounces to /admin,
// no session to /sign-in. (Both routes are illustrative — point them at the
// project's real auth pages.)
export async function requirePermissionOrRedirect(permission: Permission): Promise<AdminContext> {
	try {
		return await requirePermission(permission)
	} catch (error) {
		if (error instanceof AppError) {
			redirect(error.code === 'unauthorized' ? '/sign-in' : '/admin')
		}
		throw error
	}
}

// The admin nav lanes this context may see — filtered to each group's read
// permission. Empty for a null context.
export function accessibleNav(context: AdminContext | null): { href: string; label: string }[] {
	if (!context) return []
	return PERMISSION_GROUPS.filter((group) => context.has(group.readPermission)).map((group) => ({
		href: group.navHref,
		label: group.label
	}))
}
