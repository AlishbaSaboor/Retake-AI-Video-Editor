---
name: ai-usage-check
description: Prove this branch's AI calls still work and still get costed, end to end — model map against live OpenRouter prices, pricing and failure-isolation unit tests, and a real tracked call writing a real priced row that MOAD can read. Use when the user says "/ai-usage-check", "check the AI tracking", "did the AI calls break", or when a branch touches an AI call, a model id, src/server/lib/ai-usage/, or prisma/schema/ai-usage.prisma.
---

# AI usage check

The gate for anything touching AI. Two failure modes it exists to catch, and
they need different evidence:

- **The AI calls broke.** Loud, and caught by the specs below.
- **The AI calls work but stopped being costed.** Silent. A model gets
  swapped for a newer one, the map isn't updated, and every call from then on
  is recorded at NULL cost. The spend report keeps looking plausible. This is
  the one worth running the skill for.

Read `docs/rules/ai-usage.md` for what each layer is protecting.

## 1. Is this branch even in scope

```bash
git diff --name-only $(git merge-base main HEAD)...HEAD
```

In scope if it touches `src/server/lib/ai-usage/`,
`prisma/schema/ai-usage.prisma`, or any file that calls `trackAiCall`. Also
in scope if it adds a provider SDK call anywhere — that is the case where the
finding is "this call isn't tracked at all".

If nothing matches, say so and stop. Don't run the whole gate to report a
clean bill on a branch that changed a CSS file.

## 2. Static gates, in order

Stop at the first failure and fix it before continuing.

```bash
pnpm check:ai-models   # every mapped slug still prices upstream
pnpm typecheck         # a call site cannot name an unmapped model
pnpm test              # pricing, extraction, failure isolation
```

Reading the results:

- **`check:ai-models` printing "Could not reach OpenRouter"** is a pass, not
  a skip to paper over. It means upstream was unreachable, and the runtime
  degrades the same way: rows written with a NULL cost, countable on the
  dashboard. Note it in the report and move on.
- **`check:ai-models` naming a retired slug** is a real finding. Look the
  model up at `https://openrouter.ai/api/v1/models`, take the `id` field,
  update `OPENROUTER_SLUGS`. Do not delete the entry to make the check pass
  unless the project genuinely stopped calling that model.
- **A typecheck error on `TrackedModel`** means someone added an AI call for
  a model nobody mapped. That is the check working. Add the map entry.

## 3. One real tracked call, against a real database

The layers above never write a row. This is the step that proves the
pipeline end to end, and it is the only one that catches a broken Prisma
write, a schema drift, or a sink that throws where nobody looks.

Needs a real `DATABASE_URL` and a real provider key. If the project has
neither to hand, say so in the report rather than claiming coverage this
step didn't give.

1. Point `DATABASE_URL` at a local database with migrations applied
   (`pnpm exec prisma migrate deploy`).
2. Exercise a real feature that makes a tracked call — through the UI via
   `local-feature-testing`, or by calling the server action directly.
3. Read the row back:

   ```bash
   # via .claude/skills/sql-preview, or:
   pnpm exec prisma studio
   ```

   ```sql
   select provider, model, service_tier, feature, status,
          input_tokens, output_tokens, cache_read_tokens, cost_micro_usd
   from ai_usage order by created_at desc limit 5;
   ```

Check, in this order:

- **A row exists at all.** No row means the sink is failing silently, which
  it is designed to do. Look in Sentry for the `captureError` from
  `persist`.
- **`cost_micro_usd` is not NULL.** NULL means the model isn't mapped, or
  the rate card couldn't be fetched. Both are findings.
- **`cost_micro_usd` is not 0** for a call that returned real tokens. Zero
  where NULL was expected means something is converting a missing price into
  a number, which is the exact silent-undercount bug the NULL exists to
  prevent.
- **`model` is an OpenRouter slug** (`anthropic/claude-opus-5`), not the
  provider's own id, and carries no `:batch` suffix. A raw provider id there
  means the model is unmapped; the row's cost will be NULL to match, and the
  two findings are the same finding.
- **Token counts are plausible.** An `input_tokens` that looks suspiciously
  like `input + cached` is the provider-accounting trap in `usage.ts` —
  compare against what the provider's own response reported.
- **`meta` holds ids only.** No prompt text, no completion text. This is a
  privacy check, not a style one: MOAD reads this table with raw SQL, so
  nothing here is hidden behind an aggregate.

## 4. Coverage of what changed

- A new AI call with no `feature` that distinguishes it from an existing one
  is a finding — the whole ledger is queried along that axis.
- A new provider means new extractor tests, including the cached-token case.
  Absent, flag it: `docs/rules/ai-usage.md` explains why that one assertion
  carries the most weight.
- A change to `createAiTracker` with the failure-isolation tests untouched
  is a finding regardless of whether they still pass. Those tests are the
  reason a broken ledger can't take a user-facing feature down.
- **A renamed, retyped or re-based column in `prisma/schema/ai-usage.prisma`
  is a blocking finding.** MOAD reads this table directly, so the columns are
  a cross-repo contract that nothing in this repo will fail on. Units are the
  dangerous half: `cost_micro_usd` holding anything but millionths of a USD
  breaks every total silently, in a direction nobody sees.

## Report

Per layer: what ran, what passed, what it proves. Be exact about what step 3
did or didn't cover — "no provider key available, no real row written" is a
useful report; implying end-to-end coverage that didn't happen is not.

List findings as blocking or worth flagging. A retired slug is blocking. A
missing batch tier upstream for a model the project never calls in batch is
not.
