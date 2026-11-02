# This is NOT the Next.js you know

Next.js 16 and React 19 are the pinned versions in this repo. Both have
real breaking changes vs. the v13/14 App Router conventions your training
data was likely written against — read `node_modules/next/dist/docs/` before
writing any code that touches routing, caching, or data fetching. In
particular:

- Every dynamic API is async now — `params`, `searchParams`, `cookies()`,
  `headers()`. The old synchronous access pattern is fully removed as of v16,
  not just deprecated.
- Caching is opt-in, not opt-out. Nothing is cached by default; use the
  `'use cache'` directive where you actually want caching. Don't assume a
  `fetch` call or a GET route handler is cached the way it was in v13/14.
- Turbopack is the default bundler for both `next dev` and `next build` —
  don't add webpack config assuming it's the active bundler.

## React and Next.js performance

- Treat performance as a correctness requirement for every React and Next.js
  change.
- Keep Client Component boundaries as small as possible; do data access and
  non-interactive rendering in Server Components.
- Start independent async work together and avoid request waterfalls. Reuse
  data already fetched instead of issuing duplicate count or aggregate
  queries.
- Do not add heavy client dependencies, barrel imports from large packages,
  or eager loading for features that are not needed on initial render.
- Avoid derived state in effects and repeated expensive work during renders.
  Memoize only genuinely expensive computations, use functional state updates
  when based on prior state, and keep effect dependencies primitive and
  narrow.
- React Compiler is enabled with `panicThreshold: 'all_errors'` (see
  `next.config.ts`) — a Compiler bailout fails the build, it does not
  silently skip optimization. Fix the underlying issue rather than routing
  around the Compiler.
- Before handing off a change, run ESLint, TypeScript, and a production
  Next.js build. Re-check the current guidance in
  `node_modules/next/dist/docs/` before using a Next.js API or convention.

## Engineering rules

Each of these is a short summary — read the linked file before touching
that area, don't rely on the summary alone. They're split into individual
files (not one long section here) so each stays independently readable and
linkable.

- **[Database access](docs/rules/database.md)** — Prisma only, no raw
  SQL clients, no Supabase `.from()`/`.rpc()` for data.
- **[Migrations](docs/rules/migrations.md)** — `scripts/generate-migration.mjs`
  generates migrations from a schema diff against your local database;
  never hand-write a file under `prisma/schema/migrations/`. One-off SQL that isn't a schema change (a
  data fix, reference rows, a view) goes in `prisma/run-once.sql`: it runs
  once per database on the next deploy, after the migrations, tracked by
  content hash in the `_run_once_sql` ledger so it never repeats.
- **[Auth](docs/rules/auth.md)** — Supabase Auth by default for anything
  with real user accounts, removed entirely for landing pages; auth (plus
  one private Storage bucket for long takes' audio in transit), never a
  second path to application data. Authorization is enforced in the
  API/action layer (session + ownership guards) because Prisma connects
  directly, not through PostgREST. Keep the Supabase Data API **off**, and
  still enable RLS with **no policies** on every table — a deny-by-default
  lock so no anon/authenticated role can ever read a row, even if the Data
  API is switched on later. Don't `FORCE` it (Prisma connects as the table
  owner, which must stay exempt). `pnpm check:rls` reads the database (the
  manual `migrations` job) to prove all three, and the Supabase wrappers are typed to their auth
  (or Storage) surface so a data call through them doesn't compile.
- **[State management](docs/rules/state-management.md)** — TanStack Query
  for server state, local state/URL params for client-only state, no
  global store by default.
- **[Error handling](docs/rules/error-handling.md)** — `AppError` for
  user-caused failures, `captureError`/`captureClientError` for everything
  else; never call Sentry or write a raw error into a response/UI directly.
- **[Logging](docs/rules/logging.md)** — shared Pino structured logger
  (`src/server/lib/logger`) for the record of what happened, server-only,
  redaction as a backstop; never `console.*`, and never a substitute for
  `captureError` (that's what Sentry is for).
- **[Secrets](docs/rules/secrets.md)** — credentials live in env vars read
  through `src/lib/env.ts`, never hardcoded or committed; a `check:secrets`
  scanner backstops it at the pre-commit hook and again in CI, over every
  tracked file. Don't lean on the scanner.
- **[Analytics](docs/rules/analytics.md)** — PostHog through the typed
  taxonomy in `src/lib/analytics/` (`track`/`trackServer`), never
  `posthog.capture` directly; `object_action` snake_case past-tense names,
  ids/enums/booleans only, no PII or free text.
- **[AI usage tracking](docs/rules/ai-usage.md)** — feature code calls
  `src/server/ai/<provider>`, which is the only place an AI SDK is imported
  and the only place `trackAiCall` is called; ESLint fails the build on a
  direct SDK import anywhere else, so an untracked AI call cannot ship. One
  row per call in `ai_usage`, priced at write time, so spend per feature
  and model is one SQL query; treat the columns in
  `prisma/schema/ai-usage.prisma` as a contract. **Adding a model or a new AI
  call means adding it to `OPENROUTER_SLUGS` in
  `src/server/lib/ai-usage/models.ts` first** — take OpenRouter's `id`
  field, not `canonical_slug`, and register both the dated and the floating
  form of any alias you call. An unmapped model doesn't compile
  (`TrackedModel`), a retired slug fails `pnpm check:ai-models`, and
  anything that slips past both is priced NULL rather than silently costing
  $0, so it can be counted as unpriced. Cost is computed at write time,
  never at query time.
- **[Components](docs/rules/components.md)** — `src/components/ui/` is a
  small cva/Radix-based foundation (Button, Input, Card, toast system, ...),
  not a full suite; add to it deliberately rather than reaching for a new
  dependency.
- **[Icons](docs/rules/icons.md)** — every icon is imported from
  `@/components/ui/icons`, never from the provider package (Phosphor by
  default) directly; that one file wraps them, so swapping provider is a
  one-file change. Icons take no label prop — they render `aria-hidden`,
  and an icon-only button labels the button. ESLint fails the build on a
  direct provider import.
- **[Code style](docs/rules/code-style.md)** — formatting, naming
  conventions (camelCase/PascalCase/snake_case), Zod-everywhere API
  contracts, design-token usage.
- **[Code quality](docs/rules/code-quality.md)** — no `any`, no god files,
  DRY without premature abstraction, no magic numbers, logging discipline,
  docstrings that earn their keep.
- **[Feature approach](docs/rules/feature-approach.md)** — propose the
  80/20 slice for a brand-new feature and let the developer choose scope;
  prioritize test/edge-case coverage over scope-minimization once a
  feature already exists and you're adjusting it.
- **[Commits](docs/rules/commits.md)** — don't over-commit (every push is a
  real CI bill — run lint, typecheck, unit tests and build locally before committing, not
  after CI fails), plus Conventional Commits message format, enforced by the
  `commit-msg` hook.
- **[Pull requests](docs/rules/pull-requests.md)** — write the title and
  description last, once the work is actually done, not at PR-creation
  time when it can still change. Open as draft if you need a PR to exist
  before then.
- **[Deployment](docs/rules/deployment.md)** — Vercel deploys from Git
  (production from `main`, previews from PRs) with a hosted Supabase
  project; never deploy manually, and apply migrations before the deploy
  that needs them.

`docs/CI_CD_SETUP.md` lists the GitHub workflows: `ci.yml` (lint,
typecheck, unit tests and build on every push and pull request) and
`manual.yml` (e2e, migrations, database tests, run by hand).

## Per-tool entry points

This file is the source of truth for every coding agent. `CLAUDE.md` imports
it and adds only Claude Code-specific notes; rules go here, not there.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
