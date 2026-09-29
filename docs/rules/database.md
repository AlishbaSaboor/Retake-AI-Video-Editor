# Database access

All database access goes through the Prisma client (`@/server/db/client`,
exported as `db`). Never query the database any other way — no raw
`pg`/`postgres` clients, no Supabase `.from()`/`.rpc()` calls for data. If
this project also uses Supabase for auth, storage, or realtime, that's fine
— Supabase must never become a second path to the same data Prisma owns.
`$queryRaw` is allowed only where Prisma genuinely cannot express the query,
called out explicitly in the PR description.

This is a hard rule, not a style preference: the org's legacy 8x repo
shipped 147 direct Postgres RPC call sites that TypeScript couldn't see,
and a dropped column silently broke one of them in production. A typed ORM
with zero stored procedures structurally removes that failure class.

Enforced by `eslint.config.mjs`'s `no-restricted-imports`, the same shape as
the icon and AI-SDK rules: `@prisma/client` may be imported as a value only
in `src/server/db/client.ts` (type imports are fine anywhere), and `pg`,
`postgres`, and the other drivers and ORMs have no importer at all. Supabase's
own client can't reach data either — see `docs/rules/auth.md`.
`pnpm check:standards` confirms the rule is in effect.
