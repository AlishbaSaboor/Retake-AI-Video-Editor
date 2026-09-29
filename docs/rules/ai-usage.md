# AI usage tracking

Every AI provider call this app makes goes through `trackAiCall` from
`@/server/lib/ai-usage/sink`. Never call a provider SDK directly from
feature code. One row per call lands in `ai_usage`, priced at write time.

Nothing in this app reads that table. MOAD, the cross-project spend
dashboard, queries it directly and read-only through the Supabase Management
API, the same path used for DB access and provisioning. So there is no
endpoint here, no API key, and no credential in either direction.

That makes the column contract in `prisma/schema/ai-usage.prisma` a
cross-repo API. Every project stores the same units in the same shape, and
renaming or re-basing a column breaks the dashboard even though nothing in
this repo imports it. Talk to whoever runs MOAD before changing one.

If this project makes no AI calls, delete the whole thing rather than
leaving it dormant — see "Removing it" at the bottom. An empty table nobody
writes to is worse than no table, because MOAD reports it as a project
sitting at zero spend instead of a project that opted out.

## Two layers, and feature code only sees one

**`src/server/ai/<provider>.ts` owns the SDK.** It is the only file allowed
to import a provider package, and the only file that calls `trackAiCall`.
`src/server/ai/anthropic.ts` is the reference pattern for this layer: read it
before adding a provider, copy its shape as well as its file, and keep it
around even before an SDK is installed, so the next person setting one up
gets a working example instead of this paragraph.

**Feature code calls that module.** It never imports an SDK and never sees
`trackAiCall`:

```ts
import { createMessage } from '@/server/ai/anthropic'

const message = await createMessage(
	{ feature: 'offer_copy', model: 'claude-opus-5', meta: { brand_id: brandId } },
	{ max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }
)
```

Note that `model` is passed once and used for both the SDK call and the
usage row, so the two can't disagree about which model was billed. The
response comes back untouched and SDK errors are rethrown untouched, so this
drops into an existing call with no other change.

`no-restricted-imports` in `eslint.config.mjs` enforces the split, the same
way it does for icons: importing `@anthropic-ai/sdk`, `openai`,
`@google/genai`, `ai` or `@ai-sdk/*` anywhere outside `src/server/ai/` fails
the build. An untracked AI call is therefore a lint error, not something
anyone has to remember at review time.

Adding a method (embeddings, images, batches) means adding a wrapper to the
provider module, not reaching for the SDK at the call site. Keep those
wrappers to the methods actually in use — a passthrough for a method nobody
calls is a shape assumption nobody will verify.

**`feature`** is required, and is the axis every cost question gets asked
along. Spend a moment on it: `offer_copy` and `offer_copy_retry` answer
different questions, `generate` answers none.

**`meta`** follows the analytics property rule (`docs/rules/analytics.md`
rule 5): ids, enums and booleans only. No prompt text, no completion text,
nothing a human typed. MOAD reads this table with raw SQL, so that rule is
the only thing keeping the column safe to share.

**Streaming** records usage when the stream finishes, not when it starts.
`streamMessage` in the example module shows the pattern: hand the stream to
the caller immediately, and let `trackAiCall` wrap `finalMessage()`.

`serviceTier` (`standard` | `fast` | `batch`) and `extract` (for a response
shape the built-in extractors don't know) are the remaining optional fields
on the underlying `trackAiCall`.

## Adding a model, or a new AI call

1. **Add the model to `OPENROUTER_SLUGS`** in
   `src/server/lib/ai-usage/models.ts`, mapping the provider's own model id
   to OpenRouter's `id` for it. Find it at
   `https://openrouter.ai/api/v1/models?output_modalities=text,embeddings,transcription`
   — and take the `id` field, not `canonical_slug`; they differ, and only
   `id` prices. That query string matters: the bare URL lists text-output
   models only, so an embedding or transcription model looks absent when it
   is really there and really priced.
2. **Register both forms if you call a floating alias.** A provider echoes
   back the dated id (`claude-haiku-4-5-20251001`) when you called a dated
   alias and the short one (`claude-opus-5`) when you called a floating one.
   Both reach the map.
3. **Only map models you actually call.** Every entry is checked against the
   live catalogue by `pnpm check:ai-models`, so a speculative entry is a CI
   failure waiting for the day that slug retires.
4. Wrap the call in `trackAiCall` and give it a `feature`.
5. Run `pnpm typecheck` and `pnpm check:ai-models`.

Nothing in that map is derived, and it must stay that way. The id schemes
disagree on word order and separators — Anthropic serves
`claude-haiku-4-5-20251001`, OpenRouter calls the same model
`anthropic/claude-haiku-4.5` and its canonical slug
`anthropic/claude-4.5-haiku-20251001`. A normalizer clever enough to bridge
that is also clever enough to resolve a new model to the wrong row and
mis-price it in silence. Don't write one.

## How an unmapped model fails loudly

Three places, because each catches a different way this goes wrong.

**At `pnpm typecheck`.** `AiCallSpec.model` is typed as `TrackedModel`,
which is `keyof typeof OPENROUTER_SLUGS`. A call site naming a model nobody
mapped does not compile. This is the cheapest of the three and catches the
common case: someone shipped a new AI call and forgot the map.

**At `pnpm check:ai-models`, in its own CI job.** The direction TypeScript
cannot see: a slug that was right when it was written and has since been
retired upstream. That is how a mapping rots with nobody touching the code.
The script exits 0 when OpenRouter is unreachable, so a blip upstream turns
one square red on its own rather than every PR in every repo.

**On the dashboard, which is the one that actually works.** An unmapped
model is recorded with `cost_micro_usd` **NULL, never 0**, so MOAD counts
what it could not price:

```sql
select model, count(*) from ai_usage where cost_micro_usd is null group by model;
```

Sentry alerts get muted within a week. A dashboard row saying 3,412 calls are
missing from the total does not. This is the one guarantee the reader has to
honour: `sum(coalesce(cost_micro_usd, 0))` turns "we don't know" into "$0"
and reintroduces the exact silent undercount the NULL exists to prevent. A
zero sums cleanly and under-reports forever; a NULL is visible.

## Things that are easy to get wrong

**Cost is computed at write time, not read time.** Pricing at query time
would mean last quarter's reported spend silently changes when a model gets
cheaper. The row stores what the call cost when it was made. It also means
MOAD's read is a plain `SUM` that never depends on OpenRouter being up.

**The `model` column stores the OpenRouter slug, not the provider's model
id.** The provider's id is what comes back on the response, and it varies:
call a floating alias and you get `claude-haiku-4.5`, call the dated one and
you get `claude-haiku-4-5-20251001`, same model either way. Stored raw, one
model would show up as two rows in a cross-repo total. `persist()` in
`sink.ts` translates through `openRouterSlug` on the way in, without the
`:batch` suffix, since `service_tier` already carries the tier. An unmapped
model falls back to the raw provider id, which is exactly the set of rows
with a NULL cost.

**The three providers disagree on whether prompt tokens include cached
tokens.** Anthropic's `input_tokens` excludes both cache figures. OpenAI's
`prompt_tokens` and Google's `promptTokenCount` include them, so
`src/server/lib/ai-usage/usage.ts` subtracts. Get this wrong and the totals
are plausible, self-consistent, and wrong.

**Long-context tiers are real.** Several models roughly double their rate
past a prompt-size threshold, carried in the rate card's `overrides` array.
Pricing off the top-level rates alone under-reports by half on exactly the
calls that cost the most.

**Money is stored in micro-USD as a `BigInt`.** Millionths of a dollar, as
an integer, so sums are exact and no float ever touches a money total. The
one division to dollars happens in the reader, at the very end. This is also
the cross-repo units contract: every project stores micro-USD, because one
repo logging cents and another dollars is 100x wrong with nothing to catch
it.

**Tracking never breaks the call it tracks.** A failed row costs a line in a
spend report; a failed AI call costs a user their feature. `createAiTracker`
swallows everything on the recording path, including a bug in a caller's own
`extract`. There is a test for exactly this in `ai-usage.test.mts`; if you
refactor the tracker, that test is the one that matters.

## Removing it

For a project that makes no AI calls, delete:

- `prisma/schema/ai-usage.prisma`
- `src/server/lib/ai-usage/` and `src/server/ai/`
- `AI_SDK_IMPORTS` and the `src/server/ai/**` block in `eslint.config.mjs`
- `scripts/check-ai-models.mjs`, the `check:ai-models` script in
  `package.json`, and the `ai-models` job in `.github/workflows/ci.yml`

Tell whoever runs MOAD, too — a table that stops existing reads to a direct
SQL reader as a broken project, not as one that opted out.

**This file stays, and so does its bullet in `AGENTS.md`.** It is the only
thing that survives the deletion, and it has to, for two reasons. It is the
reference an agent reads on the day this project does add an AI call — every
trap above (the cached-token disagreement, NULL-never-0, micro-USD, the
explicit slug map) is knowledge that is expensive to re-derive and easy to
get plausibly wrong. And `pnpm check:standards` fails on a rule that is
linked but gone.

What does change is the top of this file. Replace the first paragraph with a
note saying where the project stands, so nobody goes looking for a table
that isn't there:

> **This project does not track AI spend.** There is no `ai_usage` table and
> no `src/server/lib/ai-usage/`. Everything below describes the system that
> gets wired up on the day this project makes its first AI call — run
> `/ai-usage-setup` then, and read this file before writing the call.

Re-adding later is the same skill. It restores the implementation from
`8x-web-template` rather than rebuilding it, so a project that opted out at
setup and changes its mind ends up with the same code as one that never
stripped.
