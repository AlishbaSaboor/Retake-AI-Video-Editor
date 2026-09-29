---
name: local-review
description: Run the full local pre-push gate (lint, typecheck, format, env-var check, unit tests, build) and a manual review pass against this repo's AGENTS.md/docs/rules rules — the mechanism that makes the no-over-committing rule work by catching problems before a paid CI run does. Use when the user says "/local-review", "review this before I push", "is this ready", or has finished a change and wants it validated locally before CI sees it.
---

# Local review

A pre-push gate: the same checks CI runs, plus a manual rule-compliance pass CI can't fully automate. Run this once a change is functionally done, not after every edit.

**This is what makes `docs/rules/commits.md`'s no-over-committing rule actually work.** Every push triggers real, paid CI runs — this skill exists so CI _confirms_ what's already verified, instead of being the first place a lint error, a type error, or a broken build gets discovered. If you're about to push-and-see-what-CI-says, run this first instead. If it's clean, commit once — not once per fix as you iterate.

## 1. Automated gates, in order

Stop at the first failure and fix it (or report it) before continuing — don't run everything blind and dump five unrelated failures on the user.

```bash
pnpm lint
pnpm typecheck
pnpm format:check   # if this fails, just run `pnpm format` — it's always safe, never ask first
pnpm check:env
pnpm check:secrets   # scans tracked files for committed credentials
pnpm check:standards
pnpm check:ai-models   # skip if the project deleted AI usage tracking
pnpm test
DATABASE_URL="postgresql://<your local database>" pnpm check:rls   # needs the migrations applied
```

`check:rls` reads the database rather than the migration files, so it needs
one: the local Postgres `dev-onboarding` set up, with
`pnpm exec prisma migrate deploy` run against it first. Without
`DATABASE_URL` it fails rather than skips — a skipped RLS check is the same
as no RLS check. CI runs it at the end of the `migrations` job against the
replayed database, so a table without RLS turns that job red.

`check:standards` (`scripts/check-standards.mjs`) is the one gate that
checks the scaffolding rather than the code: the rules index, the commit
hook, the CI gates, the lint and TypeScript config actually in effect,
tracked-file hygiene. A failure means a standard was unwired — usually by a
refactor that moved or deleted something without noticing it was
load-bearing. `docs/STANDARDS.md` lists what it looks for and how to meet
each item.

`check:ai-models` is the one gate here that calls out to the network. It
exits 0 when OpenRouter is unreachable, so a failure means a slug this
project maps has actually been retired upstream — a real finding, and one
that otherwise surfaces months later as a model quietly costing $0. See
`docs/rules/ai-usage.md`.

Then a full build with the same placeholder env vars CI's `build` job uses (every route is dynamic, so these never need to be real):

```bash
DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
CRON_SECRET="placeholder-secret" \
pnpm build
```

## 2. Manual review pass

Diff the branch against its merge-base (`git diff $(git merge-base main HEAD)...HEAD` or `git diff main...HEAD` if the branch is up to date), and check the changed files against these rules from `AGENTS.md`/`docs/rules/*`:

- **Database access** — every query goes through `db` from `@/server/db/client`. Flag any raw `pg`/`postgres` client, any Supabase `.from()`/`.rpc()` call, any `$queryRaw` that isn't called out explicitly as necessary.
- **Migrations** — nothing hand-edited under `prisma/schema/migrations/`. If the diff touches that folder, that's a stop-the-review finding, not a style note.
- **Run-once SQL** — a change to `prisma/run-once.sql` replaces the previous one-off rather than appending to it (the old one already ran), creates no tables/columns/indexes the schema doesn't declare, and survives CI's replay onto an empty database (no dependence on production-only rows). See `docs/rules/migrations.md`, "Run-once SQL".
- **API routes** — `src/app/api/**/route.ts` files contain zero logic, just `export const GET = createApiRoute(...)`/`createCronRoute(...)`. Schema + handler logic lives in `src/server/api/**`.
- **Server/Client boundaries** — no `@/server/**` import (or anything marked `server-only`) reachable from a file with `'use client'` at the top. Client Component boundaries should be as small as the diff allows.
- **State management** — `QueryClient` only ever constructed inside a `useState` initializer (see `src/components/query-provider.tsx`), never at module scope. No new global state library (Zustand, Redux, Jotai) added without it being an explicit, discussed decision — flag it, don't silently allow it.
- **Auth** — no Supabase `.from()`/`.rpc()` for application data (auth/session only, see `docs/rules/auth.md`); no auth check added to a page instead of the API/action layer.
- **Env vars** — any new `process.env.X` has a matching `.env.example` entry and `src/lib/env.ts` schema entry. `pnpm check:env` catches most of this mechanically; still worth a manual look for anything its regex might miss (e.g. a dynamically-constructed var name).
- **AI calls** (`docs/rules/ai-usage.md`) — every provider SDK call goes
  through `trackAiCall`, never direct from feature code. A new AI call, a
  new model id, or any change under `src/server/lib/ai-usage/` means running
  `/ai-usage-check` rather than reviewing it by eye — the silent failure
  here is a call that still works but stopped being costed, which no amount
  of reading the diff will show you. Flag a `feature` string that doesn't
  distinguish the call from an existing one, and anything but ids in `meta`.
- **Magic numbers** (`docs/rules/code-quality.md`) — deliberately not an ESLint rule (too noisy — see that file for why). A numeric literal whose meaning isn't obvious from context — a threshold, rate, timeout, limit — should be a named constant. Flag it, don't just wave it through because the linter didn't.
- **DRY / Rule of Three** — if the diff's logic already exists in 2+ other files, that's the signal to extract before adding a third copy, not after. Don't flag 2 occurrences as a problem — that's expected, not a violation (see the Sandi Metz caveat in `docs/rules/code-quality.md` for why premature extraction is its own failure mode).
- **God files** — no numeric threshold, but if a changed file now mixes routing/data-access/business-logic/rendering in one place, say so.
- **Docstrings** — flag comments that just restate the code below them; that's noise, not documentation. A missing comment on a genuinely non-obvious invariant is a real finding, an unnecessary one is too.
- **Naming** — camelCase for JS/TS, PascalCase for components/types, `SCREAMING_SNAKE_CASE` only for true constants, snake_case only inside `@map`/`@@map` on the Prisma side.
- **Feature scope** (`docs/rules/feature-approach.md`) — if the diff is a brand-new feature, did the PR/commit description show an 80/20 tradeoff was considered, or does it look like the fullest possible version was built without that being asked for? If it's an adjustment to something existing, scope-mimimization is the wrong lens — check test/edge-case coverage instead.
- **Commit messages** — `git log <merge-base>..HEAD --oneline` matches Conventional Commits. Catch this locally; it's the same rule the push-time hook and CI's `commits` job enforce, just cheaper to fix before either runs.

## 3. Report

A short pass/fail summary: which gates passed, what the manual pass found (file:line for each item), and what's a blocking issue vs. worth flagging but not blocking. If you fixed anything trivial (formatting, an obviously-missing env declaration), say so. If something needs a judgment call from the user (e.g. a new global store, a `$queryRaw` usage), ask rather than deciding for them.

If everything's clean and this is the point the branch is actually done: this is also the trigger to write or finalize the PR's real title/description (mark it ready for review if it was opened as a draft) — see `docs/rules/pull-requests.md`. Don't leave a PR description describing an earlier, incomplete state of the branch once you've confirmed the work is finished.
