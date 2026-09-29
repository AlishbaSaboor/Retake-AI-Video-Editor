# This is NOT the Next.js you know

Next.js 16 and React 19 are the pinned versions in this template. Both have
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
linkable, the same way the org's other repos split topic-scoped rules out
of one monolithic instructions file.

- **[Database access](docs/rules/database.md)** — Prisma only, no raw
  SQL clients, no Supabase `.from()`/`.rpc()` for data.
- **[Migrations](docs/rules/migrations.md)** — CI generates and commits
  migrations from a schema diff; never hand-write a file under
  `prisma/schema/migrations/`. One-off SQL that isn't a schema change (a
  data fix, reference rows, a view) goes in `prisma/run-once.sql`: it runs
  once per database on the next deploy, after the migrations, tracked by
  content hash in the `_run_once_sql` ledger so it never repeats.
- **[Auth](docs/rules/auth.md)** — Supabase Auth by default for anything
  with real user accounts, removed entirely for landing pages; auth only,
  never a second path to application data. Authorization is enforced in the
  API/action layer (session + ownership guards) because Prisma connects
  directly, not through PostgREST. Keep the Supabase Data API **off**, and
  still enable RLS with **no policies** on every table — a deny-by-default
  lock so no anon/authenticated role can ever read a row, even if the Data
  API is switched on later. Don't `FORCE` it (Prisma connects as the table
  owner, which must stay exempt). `pnpm check:rls` reads the database in CI
  to prove all three, and the Supabase wrappers are typed to their auth
  surface so a data call through them doesn't compile.
- **[Authorization](docs/rules/authorization.md)** — admin-console RBAC:
  `AdminMember` seat (ordered `AdminRole` enum tier + additive
  `permissionGrants`), the `src/lib/rbac/` catalog + `getAdminContext`
  gates, the factory `authorize` option, and the `<AuthzProvider>`/`<Can>`
  client surface; `requirePermission` is the real boundary, RLS the
  backstop. Governs staff only — creators/brands/end-users are separate
  products, not roles.
- **[Feature flags](docs/rules/feature-flags.md)** — provider-agnostic,
  typed `FLAGS` registry resolved through an ordered chain (DB override >
  DB flag > PostHog > static default), server + client surfaces, and the
  `flags.manage`-gated admin toggle action; PostHog is one provider, not
  the system.
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
  scanner backstops it at the pre-commit hook and again in CI, over source
  and over the `.claude-logs/`/`.codex-logs/` transcripts that ship on the
  branch. Redact a secret out of a transcript before logging the session —
  don't lean on the scanner.
- **[Analytics](docs/rules/analytics.md)** — PostHog through the typed
  taxonomy in `src/lib/analytics/` (`track`/`trackServer`), never
  `posthog.capture` directly; `object_action` snake_case past-tense names,
  ids/enums/booleans only, no PII or free text.
- **[AI usage tracking](docs/rules/ai-usage.md)** — feature code calls
  `src/server/ai/<provider>`, which is the only place an AI SDK is imported
  and the only place `trackAiCall` is called; ESLint fails the build on a
  direct SDK import anywhere else, so an untracked AI call cannot ship. One
  row per call in `ai_usage`, priced at write time. MOAD reads that table
  directly and read-only over the Supabase Management API, so there is no
  endpoint and no credential here, and the column contract in
  `prisma/schema/ai-usage.prisma` is a cross-repo API. **Adding a model or a new AI
  call means adding it to `OPENROUTER_SLUGS` in
  `src/server/lib/ai-usage/models.ts` first** — take OpenRouter's `id`
  field, not `canonical_slug`, and register both the dated and the floating
  form of any alias you call. An unmapped model doesn't compile
  (`TrackedModel`), a retired slug fails `pnpm check:ai-models`, and
  anything that slips past both is priced NULL rather than silently costing
  $0, and counted on the dashboard as unpriced. Cost is computed at
  write time, never at query time. A project with no AI calls deletes the
  whole thing rather than leaving it dormant.
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
  real CI bill — verify locally with `local-review` before committing, not
  after CI fails), plus Conventional Commits message format, enforced by a
  shared hook + CI job.
- **[Pull requests](docs/rules/pull-requests.md)** — write the title and
  description last, once the work is actually done, not at PR-creation
  time when it can still change. Open as draft if you need a PR to exist
  before then.
- **[Deployment](docs/rules/deployment.md)** — never deploy manually; what
  CI/CD actually does instead.

`docs/STANDARDS.md` is the checklist of what every 8x repo carries — the
files, hooks, gates and config behind the rules above — paired with the
deterministic check that proves each item is still wired:
`pnpm check:standards` (`scripts/check-standards.mjs`), run in CI on every
pull request. It is also the playbook for bringing an existing repo onto
these standards: point the script at that repo and its failures are the
to-do list.

`docs/CI_CD_SETUP.md` has the human side of this — which GitHub secrets,
environments, and Vercel settings need to exist for the above to actually
work, not just be documented.

## Per-tool entry points

This file is the source of truth. Each tool also gets a thin file in its own
convention that imports this one and adds only what is specific to that tool
(its command format, whether it writes a session transcript, whether it can
run the workflows in `.claude/skills/`):

- `CLAUDE.md` — Claude Code
- `GEMINI.md` — Gemini CLI
- `QWEN.md` — Qwen Code
- `.cursor/rules/project.mdc` — Cursor
- `AGENTS.md` (this file) — Codex, Amp, OpenCode, and anything else that
  reads the shared convention directly

Rules go here, not in those files. If you find yourself writing an
engineering rule into a per-tool file, it belongs in this one instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
