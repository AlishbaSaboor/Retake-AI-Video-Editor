# Authorization (Admin RBAC)

Authentication answers _who are you_ (`docs/rules/auth.md`, Supabase). This
file answers _what may you do_ — for the **admin console**, the internal
staff who log in to operate the product.

RBAC here governs **admin** access only. It does **not** model
`creator` / `brand` / end-user — those are separate products with their own
apps, auth surfaces, and ownership guards (`docs/rules/auth.md`). "Which
product am I in" is a routing concern, never an RBAC role. Most users hold
**no admin seat at all**: `getAdminContext()` returns `null` for them and the
console is closed.

## The model: ordered role tier + additive per-user grants

Staff-ness is a **separate table** (`AdminMember`), not a column on `User` —
the presence of an **active** row is what makes someone staff.

- `role` is an `AdminRole` **enum** — the tier of record. Roles are ordered,
  nested supersets: `read_only ⊂ support ⊂ admin ⊂ super_admin`.
  - `super_admin` — **wildcard**: holds every permission, present and future.
    A newly-added catalog key is auto-held, so extending the catalog never
    locks out the top tier.
  - `admin` — all non-dangerous permissions (every read + every write, never
    seats/money/destructive).
  - `support` — all reads (incl. sensitive) + an explicit support-write slice.
  - `read_only` — the **default seat**: non-sensitive reads only, no writes.
- `permissionGrants` is a `String[]` of **additive-only** overrides. It only
  _adds_ keys on top of the role; it can never contradict or shrink the tier.
  `effectivePermissions(member) = permissionsForRole(role) ∪ sanitize(grants)`
  is the one place expansion happens; every gate resolves through it.

Adding a capability = add a key to the catalog (`src/lib/rbac/permissions.ts`)
and gate on it. **No migration** — `permissionGrants` is a `text[]`, not an
enum column; `role` stays a small fixed enum.

## The library (`src/lib/rbac/`)

- `permissions.ts` — the grouped, illustrative capability catalog. Each entry
  is `{ key, label, kind: 'read' | 'write' | 'dangerous', sensitive? }`.
  Derives `ALL_PERMISSIONS`, `READ_PERMISSIONS`, `NON_SENSITIVE_READS`,
  `NON_DANGEROUS_PERMISSIONS`, `DANGEROUS_PERMISSIONS`, plus `permissionSchema`
  (Zod), `isPermission`, `sanitizePermissions`.
- `roles.ts` — `ROLE_RANK`, `LOWEST_ROLE`, `permissionsForRole`,
  `effectivePermissions`, `memberHasPermission`, `roleAtLeast`.
- `context.ts` — the enforcement surface, `cache()`'d once per request:
  - `getAdminContext()` — resolves the session, loads the **active**
    `AdminMember`, returns `{ user, member, permissions, has } | null`.
  - `requireAdmin()` — any active seat (the coarse gate the admin layout uses).
  - `requirePermission(perm)` / `requireAtLeastRole(role)` — per-capability.
  - `requirePermissionOrRedirect(perm)` — page twin (sign-in vs admin home).
  - `requireAuthorize(...)` — used by the factories (below).
- `staff-bootstrap.ts` — `seatRoleForEmail(email)`: an `8x.social` email
  auto-gets the **lowest** seat, everyone else gets `null` (no seat).
- `provision-user.ts` — `provisionUser({ id, email })`: upsert the `User` at
  the Supabase auth uuid, and if `seatRoleForEmail` is non-null, create an
  `AdminMember` at that role. Logs through `src/server/lib/logger`.

## Gate at the edge with the factories

`createApiRoute` and `validatedAction` (`src/server/{api,actions}`) take an
optional `authorize?: Permission | ((ctx) => boolean | Promise<boolean>)`.
When present the factory runs `requireAuthorize` **before** the handler, so a
route/action can't forget its gate. Handlers that need the context call
`getAdminContext()` themselves (`cache()` dedupes the resolution).

A guard **throws**; it never builds a `Response`. Two codes only:

- `new AppError('You must sign in.', { status: 401, code: 'unauthorized' })`
  — no session.
- `new AppError('You do not have access to this.', { status: 403, code: 'forbidden' })`
  — signed in, but no active seat / lacks the permission.

`AppError.status` defaults to 400, so 401/403 **must** be passed explicitly.
The factories already translate a thrown `AppError` to `{ status, userMessage }`
via `captureError` (`docs/rules/error-handling.md`).

## Client surface (small boundary, server-resolved)

`src/lib/rbac/authz-provider.tsx` mounts `<AuthzProvider permissions={…}>` in
the **admin route-group layout**, seeded from the layout's server context as a
serializable `string[]` — no client fetch, no waterfall. `useHasPermission`
and `<Can permission="…">` hide admin controls a seat can't use. This never
wraps creator/brand/end-user UI.

## RLS — the deny-by-default backstop

The **real** authorization boundary is the app layer (the `requirePermission`
gate above). RLS is a _second, locked door_: Prisma connects as the table
owner over a direct connection and is exempt, so RLS never gates a Prisma
query. Enabling it with **no policies** default-denies the `anon` /
`authenticated` roles the Data API would use — so even if the Data API is
switched on later, those roles get nothing (`docs/rules/auth.md`).

On **every user-scoped table**, in the same CI-generated create migration that
creates the table, add `ENABLE ROW LEVEL SECURITY` — **no policy, no `FORCE`**
(forcing it would subject the owner, breaking every Prisma query). Do NOT
hand-write a file under `prisma/schema/migrations/` — these statements go into
the CI-generated create migration (`docs/rules/migrations.md`).

The user-scoped tables this feature adds, and their exact statements:

```sql
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_members" ENABLE ROW LEVEL SECURITY;
```

`feature_flag_overrides` is also user-scoped and carries the same statement —
see `docs/rules/feature-flags.md`. `feature_flags` is **global config, not
user-scoped**, so it gets **no** RLS statement; it is gated by the
`flags.manage` admin action instead.
