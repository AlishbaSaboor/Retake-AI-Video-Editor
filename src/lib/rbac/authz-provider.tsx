'use client'

import { createContext, useContext, useMemo } from 'react'
import { captureClientError } from '@/lib/observability/capture-client-error'
// Type-only: the catalog's key union. Importing the type (not the runtime
// PERMISSIONS array) keeps this 'use client' module free of any server-safe
// catalog logic and out of the client bundle's data. Permission is a string
// union, so a plain string prop widens to it losslessly at the boundary.
import type { Permission } from '@/lib/rbac/permissions'

// The client mirror of the server's resolved permission set. The admin layout
// (a Server Component) resolves getAdminContext().permissions and passes them
// down as a serializable string[] — there is NO client fetch here, so no
// request waterfall (AGENTS.md perf rule). The context stores a Set for O(1)
// membership checks instead of Array.includes on every <Can> render.
const AuthzContext = createContext<ReadonlySet<string> | null>(null)

// A signed-in admin's effective permissions, seeded from the server. `has`
// answers a permission check without re-deriving anything client-side.
export function AuthzProvider({
	permissions,
	children
}: {
	permissions: string[]
	children: React.ReactNode
}): React.ReactElement {
	// Memoize so the context value is referentially stable across renders when
	// the permission list is unchanged — a new Set on every render would force
	// every consumer to re-render. Depend on the array reference the server
	// hands down (stable per navigation); the Set is derived, never mutated.
	const value = useMemo(() => new Set(permissions), [permissions])

	return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>
}

// Read the current admin's permission set. A missing provider is a wiring
// bug (a <Can>/useHasPermission used outside the admin route group), not a
// user-caused failure — surface it through captureClientError (never console
// or Sentry directly, per docs/rules/error-handling.md) and fail closed so a
// misplaced control is hidden, not shown.
function usePermissionSet(): ReadonlySet<string> {
	const set = useContext(AuthzContext)
	if (set === null) {
		captureClientError(new Error('AuthzProvider is missing from the tree'), {
			hook: 'usePermissionSet'
		})
		return EMPTY_PERMISSIONS
	}
	return set
}

// Shared empty result for the fail-closed path — a module-level constant keeps
// its reference stable, so a consumer that hit the missing-provider branch does
// not re-render on an identity change.
const EMPTY_PERMISSIONS: ReadonlySet<string> = new Set()

// True when the current admin holds `perm`. Accepts a plain string (a Permission
// key widens to it) so callers outside the catalog's type scope can still ask;
// an unknown key simply reads false.
export function useHasPermission(perm: string): boolean {
	const set = usePermissionSet()
	return set.has(perm)
}

// Renders `children` only when the current admin holds `permission`; otherwise
// renders `fallback` (nothing by default). The declarative way to hide an admin
// control a seat can't use — admin-console-scoped, never wraps creator/brand/
// end-user UI (those are separate products).
export function Can({
	permission,
	children,
	fallback = null
}: {
	permission: string
	children: React.ReactNode
	fallback?: React.ReactNode
}): React.ReactNode {
	return useHasPermission(permission) ? children : fallback
}

// Re-exported so admin call sites can annotate a permission with the catalog's
// key union at the type level without importing the runtime catalog into a
// client module.
export type { Permission }
