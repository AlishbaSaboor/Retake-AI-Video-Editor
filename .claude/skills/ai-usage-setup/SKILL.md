---
name: ai-usage-setup
description: Decide whether this project tracks AI spend, then either wire it up for the chosen providers and models or strip it out cleanly. Use when the user says "/ai-usage-setup", "set up AI tracking", "which AI providers should this project use", "we're adding AI to this project", "remove the AI tracking", or when template-setup's AI question lands on either answer.
---

# AI usage setup

Runs from `template-setup`, or on the day a project first adds an AI call.
Ends in one of two states, never in between: tracking wired for a named set
of providers and models, or the implementation deleted with
`docs/rules/ai-usage.md` left behind as the reference.

It can run more than once. A project that opted out at setup and later adds
an AI call runs it again — section 3.0 restores what the strip removed.

Read `docs/rules/ai-usage.md` first. This skill executes the decisions that
file explains; it does not restate them.

## 1. Ask whether this project calls an AI provider at all

Not "might it one day". Today, or in the work already planned. A landing
page doesn't. A dashboard that summarises data does.

If the answer is no, go to section 5 and delete. Dormant tracking is the
worst of the three states: MOAD reports the project as sitting at zero spend
rather than as a project that opted out, and the difference between "we
spent nothing" and "we don't track" is exactly the thing the dashboard
exists to tell someone.

## 2. Ask which providers, and which models

Providers first — `anthropic`, `openai`, `google`. Then the specific models
under each. Push for specific: "Claude" is not an answer, `claude-opus-5`
is. The model id is what goes in the map, and a wrong or vague one is the
mis-pricing this whole design is built to prevent.

Two things worth raising while they decide:

- **Ask whether they call floating or dated aliases.** A provider echoes
  back the dated id when you called a dated alias and the short one when you
  called a floating one, and both reach the map. If they don't know, map
  both forms.
- **Ask about the batch tier.** It is a separate upstream entry at half
  price, mapped as `<slug>:batch` automatically from `serviceTier: 'batch'`,
  but only if the model has a batch listing upstream. `pnpm check:ai-models`
  reports which of their models don't.

Anything they name that isn't in `AI_PROVIDERS` needs an extractor written
before it can be tracked — see section 4.

## 3. Wire it up

**0. If the implementation isn't here, restore it before editing anything.**
Check for `src/server/lib/ai-usage/`. If it's missing, this project opted out
at setup and every step below edits a file that doesn't exist. Do not write a
fresh implementation — the traps in `docs/rules/ai-usage.md` are exactly the
ones that get re-derived wrong, and a second implementation that differs from
the template breaks MOAD's cross-repo comparison without failing anything
here.

Copy it from the template instead:

```bash
git clone --depth 1 git@github.com:8xsocial/8x-web-template.git /tmp/8x-template
```

Bring over, adapting import paths and nothing else:

- `prisma/schema/ai-usage.prisma`
- `src/server/lib/ai-usage/` (including `ai-usage.test.mts`)
- `src/server/ai/anthropic.ts`
- `scripts/check-ai-models.mjs`, its `check:ai-models` entry in
  `package.json`, and the `ai-models` job in `.github/workflows/ci.yml`
- `AI_SDK_IMPORTS` and the `src/server/ai/**` override in `eslint.config.mjs`

Then restore the first paragraph of `docs/rules/ai-usage.md` — the strip
replaced it with a "this project does not track AI spend" note that is now
false. The template's copy of the file is the source for it.

Generate the migration through this repo's normal process
(`docs/rules/migrations.md`), never by hand-writing a file under
`prisma/schema/migrations/`. Confirm `pnpm typecheck` passes before moving
on, then continue from step 1 as if the files had been there all along.

1. **Trim `OPENROUTER_SLUGS`** in `src/server/lib/ai-usage/models.ts` to
   exactly the models from step 2. Delete the template's starter entries
   that this project won't call. Look each slug up live:

   ```bash
   curl -s 'https://openrouter.ai/api/v1/models?output_modalities=text,embeddings,transcription' | \
     python3 -c "import json,sys; [print(m['id']) for m in json.load(sys.stdin)['data'] if 'SEARCH' in m['id']]"
   ```

   Take the `id` field. `canonical_slug` differs and does not price. Keep the
   `output_modalities` query string — without it the response is text-output
   models only, and an embedding or transcription model looks absent when it
   is really there and really priced.

2. **Trim `AI_PROVIDERS`** in the same file to the providers in use, and
   delete the unused extractors from `usage.ts`. An extractor for a provider
   nobody calls is a shape assumption nobody will ever verify.

3. **Set up `src/server/ai/`.** `anthropic.ts` is the reference pattern for
   this whole layer — read it before writing anything here, and follow its
   shape rather than inventing a different one. It ships with a placeholder
   client block at the top. For each provider in use:
   install the SDK (`pnpm add @anthropic-ai/sdk`), delete the marked
   placeholder block, and paste the two real lines its comment gives. Copy
   the file per provider and delete the ones this project doesn't use. Add
   the provider's API key to `.env.example` and `src/lib/env.ts` in the same
   pass, or `pnpm check:env` fails.

   This is the layer feature code actually calls, and it is the only place
   `trackAiCall` appears. Keep the file even if this project hasn't installed
   an SDK yet: it compiles as-is, and the next person setting up a provider
   gets a working example instead of a paragraph. `no-restricted-imports` already bans the SDKs
   everywhere else, so nothing outside this folder can make an untracked
   call. Don't relax that rule to simplify a call site — it is the thing
   making the tracking non-optional rather than merely encouraged.

4. **Nothing to provision for MOAD.** It reads the `ai_usage` table directly
   and read-only through the Supabase Management API — no endpoint, no key,
   no env var, in either direction. The one thing to do outside the repo is
   tell whoever runs MOAD that this project's database has the table.

   What that costs instead is a schema contract: the columns in
   `prisma/schema/ai-usage.prisma` are identical across every repo, and MOAD
   breaks on a rename that nothing here will catch. Don't adjust them to suit
   one project. `cost_micro_usd` in particular is millionths of a USD
   everywhere, because one repo logging cents and another dollars is 100x
   wrong with nothing to error on.

5. **Verify**, in this order:

   ```bash
   pnpm check:ai-models   # every mapped slug still prices
   pnpm typecheck         # call sites can only name mapped models
   pnpm test              # pricing, extraction, failure isolation
   ```

6. **Run `/ai-usage-check`** once there is a real AI call to exercise.

## 4. A provider that isn't one of the three

Only if step 2 turned one up. Adding one means:

- A new entry in `AI_PROVIDERS` in `models.ts`.
- A new extractor in `EXTRACTORS` in `usage.ts`. **Answer one question
  before writing it: does this provider's prompt-token count already include
  cached tokens?** Anthropic's excludes, OpenAI's and Google's include.
  Getting it wrong produces totals that are plausible, self-consistent, and
  wrong. Find it in the provider's own token-counting docs, not by
  inference.
- Tests in `ai-usage.test.mts` mirroring the existing per-provider ones,
  including the cached-token case. Copy the shape; the assertion that
  matters is the subtraction.
- A check that OpenRouter lists the provider's models at all. If it doesn't,
  the model prices as NULL forever and the project needs its own rate source
  before tracking is worth wiring.

## 5. Removing it

Follow the "Removing it" list in `docs/rules/ai-usage.md` exactly — it is
the authoritative list of files and config to delete. Confirm with the user
before running the deletions, the same way `template-setup` confirms its
destructive steps.

**`docs/rules/ai-usage.md` itself is not on that list, and neither is its
bullet in `AGENTS.md`.** Deleting the implementation and keeping the rule is
the intended end state, not a half-removal: the rule is what an agent reads
on the day this project adds an AI call, and section 3.0 is what turns it
back into code. Replace the file's first paragraph with the status note the
rule doc gives, so nobody goes looking for a table that isn't there.

Then run `pnpm lint && pnpm typecheck && pnpm check:env && pnpm test` to
prove nothing dangled. Lint is the one that catches a half-removal: an
`AI_SDK_IMPORTS` rule left pointing at a deleted `src/server/ai/` bans every
SDK with no sanctioned place left to import one.

## Report

State plainly which of the two end states the project is in. If wired: the
providers and models mapped, whether the implementation was already present
or restored from the template, and that telling whoever runs MOAD about this
project's database is the user's one remaining step. If removed: what was
deleted, that `docs/rules/ai-usage.md` was kept and its opening paragraph
replaced with the status note, that the gates pass, and that MOAD should be
told the table is gone so the project reads as opted out rather than
broken.

## Don't

- Don't leave the tracking installed but unused because AI "might" get added
  later. Adding it back later is one skill run; a dormant table quietly
  misreporting a project on a shared dashboard is a bug nobody owns.
- Don't map a model the project doesn't call. Every entry is a live CI
  dependency on a slug staying available upstream.
- Don't invent a slug from the model's name. Look it up.
- Don't write a normalizer between provider ids and OpenRouter slugs, however
  tempting the pattern looks across three or four entries. `docs/rules/ai-usage.md`
  says why.
