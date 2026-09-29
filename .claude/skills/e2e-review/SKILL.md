---
name: e2e-review
description: Boot the app and run Playwright end-to-end tests against the current branch, review any failures with their trace/screenshot, and flag when a changed user-facing flow has no e2e coverage yet. Use when the user says "/e2e-review", "e2e this", "run the e2e tests", or wants to verify a UI/flow change actually works before opening a PR.
---

# E2E review

Proves a user-facing change actually works end to end, against a real running app — not just that it compiles. This is the **local** sibling of `preview-acceptance-testing`, which runs the same kind of loop against the PR's live Vercel preview. Use this one for local iteration before the PR exists; use that one as the pre-merge gate once it does. Note that a fresh clone of this template has no test-auth bypass, so `preview-acceptance-testing` can only reach the public surface until the project adds one — which is another reason to keep local coverage real.

## 1. Make sure there's something to run against

Playwright's config (`playwright.config.ts`) boots `pnpm dev` itself and waits for it to be ready — you don't need to start the dev server by hand. If you want to test an already-running server instead (e.g. a Vercel preview URL), set `E2E_BASE_URL` and the config skips its own `webServer` step.

If Chromium isn't installed yet (`~/Library/Caches/ms-playwright/` empty, or the run fails with a "browser not found" error), install it first:

```bash
pnpm exec playwright install chromium
```

## 2. Run it

```bash
DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
CRON_SECRET="placeholder-secret" \
pnpm test:e2e
```

If any spec touches a real database-backed flow, point `DATABASE_URL` at an actual local/dev database instead of the placeholder — the placeholder is only safe for flows that don't hit Prisma.

## 3. On failure, actually look at the evidence

Don't guess at a fix from the error message alone. Open `playwright-report/index.html` (generated automatically) and read the failure's trace and screenshot — Playwright captures a screenshot on failure and a full trace on retry, per `playwright.config.ts`. Fix based on what actually happened in the browser, not assumptions.

## 4. Check coverage of what changed

Diff the branch (`git diff main...HEAD`) for new pages, routes, or user-facing flows. If something new and user-facing has no corresponding spec under `e2e/`, either:

- Write a minimal spec covering its golden path (not every edge case — that's what the deeper preview/staging QA skills are for once this project has them), or
- Flag it explicitly as untested and let the user decide if that's acceptable for this change.

If the diff touches an AI call, a model id, or `src/server/lib/ai-usage/`,
this skill is not the right gate on its own — run `/ai-usage-check`, which
covers the model map, the pricing arithmetic, and a real row written to a
real database. The specs here only prove the endpoint's auth boundary holds.

Delete `e2e/smoke.spec.ts` once the project has real coverage — it exists only to prove the initial App Router + i18n wiring works on a fresh clone.

## 5. Report

Which flows were exercised, pass/fail for each, any spec files added, and anything flagged as changed-but-uncovered.
