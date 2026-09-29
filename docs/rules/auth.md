# Auth

**Default: Supabase Auth, for anything with real user accounts.** A pure
landing/marketing page with no sign-in gets it removed entirely — see
"Removing auth" below. `template-setup` asks this explicitly; don't leave
it undecided.

## Why Supabase Auth, not next-auth or something else

This is the one place this template intentionally uses Supabase for
something beyond a connection string — matching the pattern already proven
in 8x-brands and legacy `8x`: **Supabase owns auth, session, and (if a
project needs it) realtime; Prisma owns every other byte of data.** Never
let that boundary blur — no `supabase.from()` calls for application data,
ever (see `docs/rules/database.md`).

## The three pieces

1. **`src/proxy.ts`** refreshes the session cookie on every request, before
   next-intl's locale routing runs. It fails open — if
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` aren't set, or
   the network call to Supabase fails, the site still serves pages; the
   session just doesn't get refreshed on that request. Confirmed directly:
   the app boots and serves 200s with no Supabase env vars at all, and with
   fake/unreachable Supabase credentials, in both cases well under 200ms.
2. **`src/lib/supabase/server.ts`** (`createServerSupabaseClient`) — read
   the current session in a Server Component or route handler. Can't
   refresh an expired session itself (Server Components can't set cookies);
   that's what `proxy.ts` is for.
3. **`src/lib/supabase/secret-key.ts`** (`createSecretKeyClient`) —
   bypasses auth entirely. Server-only, for admin auth operations (deleting
   a user's auth account) or a verified webhook with no session. Never call
   this from a path a request can reach without already being verified
   trusted.

There's no fourth "authenticated Supabase client for data" tier the way
some other org repos have it — this template has no data-access role for
Supabase at all, on purpose.

That is enforced by the type system, not by review. Both wrappers return
`AuthOnlySupabaseClient` (`src/lib/supabase/auth-only.ts`), the client's
auth surface and nothing else, so `supabase.from()` or `.rpc()` fails
`pnpm typecheck`. The SDK itself can only be imported inside
`src/lib/supabase/` and `src/proxy.ts` (`eslint.config.mjs`), so there is no
way to construct a wider client elsewhere. A project that adopts Supabase
realtime widens that one type deliberately — never to `from` or `rpc`.

## The `User.id` convention

`prisma/schema/example.prisma` models this: `User.id` **is** the Supabase
auth user's UUID, set explicitly when the row is first created (an auth
webhook, or on first sign-in), never Prisma-generated
(`@default(cuid())`). This avoids running two parallel identity systems
that have to stay in sync. Same convention as 8x-brands and legacy `8x`.

## Authorization: enforced in the app, RLS as a locked door

**The real authorization boundary is the API/action layer**, not Postgres
Row Level Security. Prisma connects over a direct connection and does not go
through PostgREST, so RLS has nothing to enforce against a Prisma query — the
check that actually protects a row is the ownership guard you write in the
handler. RLS is a _second, locked door_ behind that, not the primary lock.

For any handler / action / loader that touches user-scoped data:

1. Resolve the caller's session first (`createServerSupabaseClient`);
   reject if absent.
2. Assert the caller may access the _specific_ rows (ownership / membership
   / role) **before** the query, not after.
3. Never scope a query by a client-supplied id alone — scope it to the
   authenticated user server-side.

### RLS on, no policies — the deny-by-default backstop

Two settings, together, make it structurally impossible for anything but
Prisma to read application data:

1. **Keep the Supabase Data API off.** Settings → API → disable it. Nothing
   in this template talks to PostgREST or `supabase-js` for data
   (`docs/rules/database.md`), so nothing legitimate breaks.
2. **Enable RLS with no policies on every table**, via a migration:

   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   ```

   RLS enabled with zero policies denies every row to every role that is
   _subject_ to RLS — which is exactly the `anon` and `authenticated` roles
   the Data API would use. So even if someone flips the Data API back on
   later, those roles get nothing. There is no policy to write because there
   is no sanctioned path through PostgREST to govern.

**Do not `FORCE ROW LEVEL SECURITY`.** Prisma connects as the table owner
(the default Supabase `postgres` connection), and the owner is exempt from
RLS _unless_ you force it. Forcing it would subject the owner to the
policies that don't exist and deny every Prisma query — breaking the app to
protect a door no one uses. Enable, don't force.

Enabling RLS is an `ALTER TABLE`, which the Prisma schema can't express, so
it lives in a hand-written migration — one of the sanctioned exceptions in
`docs/rules/migrations.md`. Add the `ENABLE ROW LEVEL SECURITY` statement for
each new table in a migration alongside the one CI generates to create it.

**Enforced by `pnpm check:rls`**, which runs at the end of CI's `migrations`
job against the replayed database and reads `pg_class` and `pg_policy`
directly: every table enabled, no policies, none forced. A new table goes
red there until its RLS migration lands. "Every table" is deliberate — it
removes the per-table judgement of what counts as user-scoped. A table that
genuinely must stay open is listed in `RLS_EXEMPT_TABLES` in
`scripts/check-rls.mjs` with the reason; the list ships empty, and FORCE or a
policy is refused even on an exempt table.

This whole section applies the moment a project has real user accounts.

## Wiring it up (when `template-setup` says this project needs accounts)

1. `pnpm add @supabase/supabase-js @supabase/ssr` (already the case if
   you're reading this in a repo generated after this rule was added —
   check `package.json` before re-adding).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` from the Supabase project's dashboard
   (Settings → API Keys). Use the `sb_publishable_…` / `sb_secret_…` keys,
   never the legacy anon / service_role JWTs — those are disabled on every
   8x project.
3. Everything else — `src/proxy.ts`, `src/lib/supabase/*` — is already
   present and working; there's nothing else to scaffold.

## Removing auth (landing pages, no accounts)

1. `pnpm remove @supabase/supabase-js @supabase/ssr`.
2. Delete `src/lib/supabase/`.
3. In `src/proxy.ts`, delete the Supabase block and go back to a plain
   `export default createIntlMiddleware(routing)`.
4. Remove `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/
   `SUPABASE_SECRET_KEY` from `.env.example` and their entries in
   `src/lib/env.ts`.
5. Run `pnpm check:env` and `pnpm typecheck` to confirm nothing's left
   dangling.
