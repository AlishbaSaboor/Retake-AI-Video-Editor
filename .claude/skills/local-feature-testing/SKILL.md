---
name: local-feature-testing
description: Spin up the app locally against a local database to manually verify a change before opening a PR. Use before claiming a feature works, especially for UI or route changes.
---

# Local feature testing

Run the app locally end-to-end to actually see a change work, rather than
inferring correctness from types/lint alone.

## Process

1. Confirm `.env.local` exists and has a working `DATABASE_URL` pointed at
   a local or personal dev database with the current migrations applied
   (`pnpm exec prisma migrate deploy`, then `pnpm db:run-once` for the
   current one-off in `prisma/run-once.sql`). If it's missing required vars, check
   them against `.env.example` and ask the user for anything secret you
   can't generate yourself (e.g. a real Sentry DSN — not required for local
   dev, since instrumentation no-ops without one).
2. `pnpm dev` and wait for the ready message.
3. Exercise the actual golden path for the change in a browser, plus at
   least one edge case (empty state, error state, or the boundary condition
   the change was meant to fix).
4. If the change touches a route handler or server action, hit it directly
   (`curl`) as well as through the UI, to confirm the response shape matches
   what any client code expects.
5. Report what you actually observed working, not what you expect to work —
   if you can't run the UI in this environment, say so explicitly rather
   than claiming success from a passing build alone.
