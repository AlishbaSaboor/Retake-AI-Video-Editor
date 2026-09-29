import { z } from 'zod'

// THE admin permission catalog — the one source of truth for admin RBAC. Every
// admin route/action gates on a key from here; the role templates (roles.ts) are
// built from these keys; <Can> and accessibleNav read them. Add a capability by
// adding a key here and gating the new action on it — nothing needs a migration,
// because AdminMember.permissionGrants is a text[] grant list, not an enum column.
//
// Each permission has a `kind`, and reads may be flagged `sensitive`:
//   read       — viewing data. `sensitive: true` marks PII / financial / private
//                reads; a plain read is operational or aggregate.
//   write      — an ordinary mutation.
//   dangerous  — money movement, seat/permission changes, destructive ops. Off in
//                every template except super_admin.
// Three of the four role templates (roles.ts) are DERIVED from this metadata:
// read_only = non-sensitive reads, admin = everything non-dangerous, super_admin
// = wildcard. So a new permission flows into the right tiers automatically.

export type PermissionKind = 'read' | 'write' | 'dangerous'

export const PERMISSION_GROUPS = [
	{
		lane: 'users',
		label: 'Users',
		navHref: '/admin/users',
		readPermission: 'users.read',
		permissions: [
			{ key: 'users.read', label: 'View user list', kind: 'read' },
			{
				key: 'users.pii.read',
				label: 'View user detail (email, PII)',
				kind: 'read',
				sensitive: true
			},
			{ key: 'users.manage', label: 'Edit / suspend users', kind: 'write' }
		]
	},
	{
		lane: 'content',
		label: 'Content',
		navHref: '/admin/content',
		readPermission: 'content.read',
		permissions: [
			{ key: 'content.read', label: 'View content', kind: 'read' },
			{ key: 'content.write', label: 'Create / edit content', kind: 'write' }
		]
	},
	{
		lane: 'support',
		label: 'Support',
		navHref: '/admin/support',
		readPermission: 'support.read',
		permissions: [
			{ key: 'support.read', label: 'View support inbox', kind: 'read' },
			{ key: 'support.reply', label: 'Reply to support threads', kind: 'write' }
		]
	},
	{
		lane: 'billing',
		label: 'Billing',
		navHref: '/admin/billing',
		readPermission: 'billing.read',
		permissions: [
			{
				key: 'billing.read',
				label: 'View invoices & balances (financial)',
				kind: 'read',
				sensitive: true
			},
			{ key: 'billing.refund', label: 'Issue refunds', kind: 'dangerous' }
		]
	},
	{
		lane: 'flags',
		label: 'Feature flags',
		navHref: '/admin/flags',
		readPermission: 'flags.read',
		permissions: [
			{ key: 'flags.read', label: 'View feature flags', kind: 'read' },
			{ key: 'flags.manage', label: 'Toggle feature flags & rollout', kind: 'write' }
		]
	},
	{
		lane: 'access',
		label: 'Access',
		navHref: '/admin/access',
		readPermission: 'access.read',
		permissions: [
			{
				key: 'access.read',
				label: 'View admin roster & permissions',
				kind: 'read',
				sensitive: true
			},
			{ key: 'access.manage', label: 'Grant / revoke admin seats & roles', kind: 'dangerous' }
		]
	}
] as const

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number]
export type Permission = PermissionGroup['permissions'][number]['key']

// Flattened, uniform view of the catalog. `key`/`kind` exist on every entry;
// `sensitive` only on some reads, so it is normalised to a boolean here.
const ALL_ENTRIES = PERMISSION_GROUPS.flatMap((group) =>
	group.permissions.map((permission) => ({
		key: permission.key,
		kind: permission.kind,
		sensitive: 'sensitive' in permission && permission.sensitive === true
	}))
)

export const ALL_PERMISSIONS: Permission[] = ALL_ENTRIES.map((entry) => entry.key)

export const READ_PERMISSIONS: Permission[] = ALL_ENTRIES.filter(
	(entry) => entry.kind === 'read'
).map((entry) => entry.key)

// The read-only tier: reads that are NOT sensitive. This is what `read_only`
// resolves to — see roles.ts.
export const NON_SENSITIVE_READS: Permission[] = ALL_ENTRIES.filter(
	(entry) => entry.kind === 'read' && !entry.sensitive
).map((entry) => entry.key)

// Everything that is not dangerous — all reads and all writes. This is what
// `admin` resolves to.
export const NON_DANGEROUS_PERMISSIONS: Permission[] = ALL_ENTRIES.filter(
	(entry) => entry.kind !== 'dangerous'
).map((entry) => entry.key)

export const DANGEROUS_PERMISSIONS: Permission[] = ALL_ENTRIES.filter(
	(entry) => entry.kind === 'dangerous'
).map((entry) => entry.key)

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS)

export function isPermission(value: string): value is Permission {
	return PERMISSION_SET.has(value)
}

// Drop any keys no longer in the catalog (a permission was removed after a
// grant) so a stored grant list always resolves to live permissions only.
export function sanitizePermissions(values: readonly string[]): Permission[] {
	return values.filter(isPermission)
}

// Runtime-validated permission key — parse an incoming permission (e.g. in an
// access.manage action) so a stale or hand-crafted key can't reach the grant list.
export const permissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])
