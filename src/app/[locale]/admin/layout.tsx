import { requireAdmin } from '@/lib/rbac/context'
import { AuthzProvider } from '@/lib/rbac/authz-provider'
import { getFlagSnapshot } from '@/lib/flags/server'
import { FeatureFlagProvider } from '@/lib/flags/client'
import { PostHogIdentify } from '@/lib/analytics/posthog-identify'

// The admin route-group layout — the ONLY place the admin console's client
// providers are mounted (docs/rules/authorization.md, docs/rules/feature-flags.md).
// It is NOT the root [locale] layout: RBAC and the flag snapshot are
// admin-console-scoped, so creator/brand/end-user surfaces never pay for them.
//
// An async Server Component: it resolves the admin context (which reads the
// Supabase session via async cookies() and loads the active AdminMember) on the
// server, then hands the client providers only serializable props — a
// string[] of permission keys and a Record<FlagKey, boolean> flag snapshot.
// No client fetch, so no request waterfall on the client (AGENTS.md perf rule).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	// Coarse gate: any active admin seat. Throws AppError unauthorized(401) with
	// no session / forbidden(403) when signed in but not staff — per-capability
	// gates (requirePermission) live on the individual routes and actions.
	const ctx = await requireAdmin()

	// getFlagSnapshot needs the resolved context (ctx.user.id as the PostHog
	// distinctId, ctx.member.role for role targeting), so it runs after
	// requireAdmin; it is cache()'d and does one DB round trip plus one silent
	// PostHog bulk read. Both snapshots are plain serialisable objects (values
	// and payloads), so the client only ever receives plain objects.
	//
	// personProperties are the "tags" a PostHog release condition / cohort can
	// target. We pass them at eval time because local evaluation (secretKey set)
	// only sees the properties handed to it — not what identifyUser stored on the
	// person. Add your real user traits here (plan, tenure, beta_tester, …) when
	// you target flags by them; role is already surfaced separately as admin_role.
	const { flags, payloads } = await getFlagSnapshot({
		userId: ctx.user.id,
		role: ctx.member.role,
		personProperties: { is_staff: true }
	})

	return (
		<AuthzProvider permissions={ctx.permissions}>
			<FeatureFlagProvider flags={flags} payloads={payloads}>
				{/* Ties this PostHog session to the admin + their tags, so posthog-js
				    re-evaluates flags for them and events / session replay carry the
				    right flag values. distinctId matches the flag context above. */}
				<PostHogIdentify
					distinctId={ctx.user.id}
					traits={{ admin_role: ctx.member.role, is_staff: true }}
				/>
				{children}
			</FeatureFlagProvider>
		</AuthzProvider>
	)
}
