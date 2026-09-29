import type { AdminRole } from '@prisma/client'
import {
	ALL_PERMISSIONS,
	NON_DANGEROUS_PERMISSIONS,
	NON_SENSITIVE_READS,
	READ_PERMISSIONS,
	sanitizePermissions,
	type Permission
} from './permissions'

// Admin roles, ordered as nested supersets: read_only ⊂ support ⊂ admin ⊂
// super_admin. The order defines "lowest role" and makes requireAtLeastRole
// sound (a higher role holds everything a lower one does, plus more). super_admin
// is the wildcard (holds every permission, present and future); admin is
// everything-except-dangerous; support adds the sensitive reads + a support write
// slice on top of read_only; read_only is non-sensitive reads only.
export const ROLE_ORDER = [
	'read_only',
	'support',
	'admin',
	'super_admin'
] as const satisfies readonly AdminRole[]

export const ROLE_RANK: Record<AdminRole, number> = {
	read_only: 0,
	support: 1,
	admin: 2,
	super_admin: 3
}

// The default seat an auto-provisioned staff member gets (staff-bootstrap.ts).
export const LOWEST_ROLE: AdminRole = ROLE_ORDER[0]

// The explicit write slice `support` adds on top of every read. Hand-curated —
// support is the one non-derived template (read_only/admin/super_admin derive
// from catalog metadata, so they self-maintain as permissions are added).
const SUPPORT_WRITES: Permission[] = ['support.reply']

// A role's permission set. read_only/admin/super_admin are derived from the
// catalog so a new permission lands in the right tier automatically; support is
// the curated exception. super_admin returns the whole catalog — the wildcard —
// so a permission added later is held by super_admin with no edit here.
export function permissionsForRole(role: AdminRole): Permission[] {
	switch (role) {
		case 'super_admin':
			return [...ALL_PERMISSIONS]
		case 'admin':
			return [...NON_DANGEROUS_PERMISSIONS]
		case 'support':
			return unique([...READ_PERMISSIONS, ...SUPPORT_WRITES])
		case 'read_only':
			return [...NON_SENSITIVE_READS]
	}
}

// A member's EFFECTIVE permissions: the role's tier UNION the per-admin additive
// grants (sanitized against the live catalog). Additive-only — a grant can add a
// permission the role lacks but can never remove one the role gives, so role and
// grants can't contradict. The one place role→permission expansion happens; every
// gate resolves through here.
export function effectivePermissions(member: {
	role: AdminRole
	permissionGrants: readonly string[]
}): Permission[] {
	return unique([
		...permissionsForRole(member.role),
		...sanitizePermissions(member.permissionGrants)
	])
}

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
	return permissionsForRole(role).includes(permission)
}

function unique(values: Permission[]): Permission[] {
	return [...new Set(values)]
}
