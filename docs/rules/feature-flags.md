# Feature flags

Provider-agnostic, typed, server + client. The full PostHog flag surface:
boolean on/off, multivariate **variants**, **experiments** (control-led),
**holdouts**, JSON **payloads**, person/group/**cohort** targeting, and **local
evaluation** — plus DB-side controls (kill-switch, gradual rollout, per-user
pins, weighted splits) that work with **no PostHog key at all**. PostHog is **one
provider**, not the system.

## The typed registry is the source of truth (`src/lib/flags/flags.ts`)

Every flag is a key in `FLAGS`, an `as const` object. The keys are a **closed
set**, so a flag name is never a bare string that can drift or typo — `FlagKey`
is the union of the literal keys. Adding a flag is one line here; the whole
provider chain and both surfaces derive from it.

`FlagDef` is a **discriminated union on `type`** (the value _shape_), kept
separate from `kind` (intent/grouping only):

- `type: 'boolean'` (or omitted) — a `BooleanFlagDef`: `default: boolean`.
- `type: 'variant'` — a `VariantFlagDef`: a `variants` tuple and a `default`
  that must be one of them. Resolves to one of the closed variant strings.
- `type: 'experiment'` — an `ExperimentFlagDef`: same as variant, but the tuple
  is typed `['control', ...]` so **omitting the `control` baseline PostHog
  experiments require is a compile error**.

`default` is the **terminal fallback**: what a flag resolves to when no provider
has an opinion. Ship `false` (boolean) or `'control'` (variant) for anything not
fully rolled out.

Derived from the registry, so a call site infers the exact type per key:

- `ValueOf<K>` — a flag's resolved value type: a variant flag's literal union
  (`'control' | 'compact' | 'spacious'`), a boolean flag's `boolean`.
- `FlagSnapshot` — `{ [K in FlagKey]: ValueOf<K> }`, what `getAllFlags` returns
  and the client provider is seeded with.
- `isFlagKey` / `isBooleanFlag` / `isVariantFlag` / `isVariantOf` — runtime
  guards. `isVariantOf` narrows an unknown (a PostHog variant string crossing the
  network) to a **declared** variant before it's used as one.

This module has **no `server-only` import and no heavy deps** (no zod, no
PostHog) on purpose — `client.tsx` imports `FLAGS` at runtime for its
value/default fallbacks, so keep it light.

**Payloads are orthogonal to a flag's value.** Any flag — boolean _or_ variant —
may also carry a JSON **payload** (PostHog's flag-payloads feature). The value
lives in the registry; the payload's schema lives in `payload-schemas.ts`
(`PAYLOAD_SCHEMAS`), so zod stays out of the client bundle. `PayloadOf<K>` is the
declared payload type (`z.infer`) or open `JsonValue` when none is declared, and
`validatePayload(key, raw)` guards every payload at the boundary.

## The resolution chain (`src/lib/flags/provider.ts` + `server.ts`)

A `FlagProvider` returns a `FlagValue` (`boolean | string` — an on/off or a
variant) to decide and stop, or `undefined` to abstain and fall through. A
provider **never throws** for "no opinion", and swallows real infra failures (DB
down, PostHog unreachable) into `undefined` so one flaky backend degrades to the
next link — a flag read never fails the page. `walkProviders` is generic over the
key, so it returns that flag's precise `ValueOf<K>`.

The chain, in precedence order (first decided wins):

1. **DB per-user override** (`FeatureFlagOverride`) — a specific user pinned. A
   boolean flag returns the pin; a variant flag can pin a **specific `variant`**
   (validated), else `enabled=false` forces `control` and `enabled=true` (no
   variant) abstains. A per-user **`payload`** pin follows the same precedence.
2. **DB global flag** (`FeatureFlag`) — `enabled=false` is a **hard kill-switch**
   for every shape (boolean → off, variant → forced to `control`), beating
   PostHog and default. For a boolean flag, `enabled=true` + `rolloutPercent`
   gates on a stable per-`(flag, user)` hash bucket. For a variant flag, a forced
   `variant` wins, else a **`variantWeights`** split picks one deterministically
   (a PostHog-independent A/B/n), else it abstains so PostHog owns the variant.
3. **PostHog** — release conditions / rollout / experiment variant selection,
   `distinctId = userId`. A variant string is narrowed by `isVariantOf` (an
   off-list / renamed variant falls back to `control`); a `holdout-<id>`
   assignment is normalized to `control`; a boolean flag coerces `!== false`.
   Skipped when there's no user id or no configured client.
4. **Static default** from the registry — terminal, never network.

Adding a provider (LaunchDarkly, env-file, …) = implement the interface and slot
it into the array in `server.ts`.

## PostHog integration (`src/lib/posthog/server.ts` + the provider in `server.ts`)

PostHog is touched in exactly one place (`server.ts`), on the **non-deprecated**
`evaluateFlags()` / `getAllFlags()` API — never `getFeatureFlag()`.

- **Local evaluation.** `getPostHogServerClient()` passes `secretKey`
  (`POSTHOG_PERSONAL_API_KEY`, a `phx_` or `phs_` key). With it, flags are
  computed in-process from polled definitions instead of a network call per
  request; the remote `/flags` endpoint is only hit for what can't be evaluated
  locally (e.g. some experiments). Without it, reads still work, just over the
  network.
- **Two read paths, deliberately different on exposure:**
  - `getFlagSnapshot(ctx)` (seeding the whole client snapshot) uses PostHog's
    bulk `getAllFlagsAndPayloads()`, which is **silent** — it does **not** fire
    `$feature_flag_called`. Correct: seeding every flag to hydrate the client is
    not a user exposure. It returns values **and** payloads in one call.
  - `getFlag(key, ctx)` / `getFlagPayload(key, ctx)` (one intentional server
    read) use `evaluateFlags().getFlag(key)`, which **fires**
    `$feature_flag_called` (deduped per user+flag+value) — the exposure PostHog
    experiments need. Only reached when the DB links abstain, so a kill-switch/pin
    decides without a false exposure.
- **Payloads.** `getFlagPayload` reads PostHog's per-flag / per-variant payload
  (`getFlagPayload`) and validates it against the flag's schema; a malformed
  payload is dropped, never trusted.
- **Targeting.** `personProperties` / `groups` / `groupProperties` from
  `FlagContext` are forwarded so a release condition, **cohort**, or experiment
  can target a segment. `ctx.role` is surfaced as the `admin_role` person
  property. Holdout variants (`holdout-<id>`) are normalized to `control`.

## Server + client API

- `src/lib/flags/server.ts`:
  - `getFlag<K>(key, ctx?)` → `ValueOf<K>` (a variant union or boolean).
  - `getFlagPayload<K>(key, ctx?)` → `PayloadOf<K> | undefined`.
  - `getFlagSnapshot(ctx?)` → `{ flags: FlagSnapshot, payloads: PayloadSnapshot }`
    — one DB round trip + one silent PostHog bulk read, `cache()`'d. This is what
    the admin layout seeds the client with. `getAllFlags(ctx?)` returns just the
    value snapshot.
  - The DB read is `cache()`'d (no N+1). `getFlag`/`getFlagPayload` are
    intentionally **not** `cache()`'d — `cache()` erases the generic and would
    collapse `ValueOf<K>` to the whole union, losing per-key inference; use
    `getFlagSnapshot` to read many.
  - `ctx` is the small serializable `{ userId?, role?, personProperties?, groups?,
groupProperties? }` slice — the admin layout builds it from the RBAC
    `AdminContext`, so this module never imports `getAdminContext` and flags stay
    decoupled from RBAC's runtime.
- `src/lib/flags/client.tsx` — `<FeatureFlagProvider flags={…} payloads={…}>`
  seeded from `getFlagSnapshot` in the admin layout (no client waterfall, every
  value decided before hydration).
  - `useFlag(key)` / `<Feature flag="…">` — on/off (a variant flag is "on" for
    any variant, off only on an explicit `false`).
  - `useVariant(key)` / `<Variant flag="…" value="…">` — the **typed variant**;
    `value` is constrained to that flag's union, so an off-list variant is a
    compile error.
  - `useFlagPayload(key)` — the flag's **typed payload** (`PayloadOf<K>`), or
    `undefined` when it has none.

## Admin writes (`src/server/actions/feature-flags.ts`)

Two `validatedAction`s, each gated by `requirePermission('flags.manage')`
(`docs/rules/authorization.md`) and audit-logged through `src/server/lib/logger`;
these are the only sanctioned write paths. Reads are server-side Prisma via
`server.ts`. Never write a flag row from anywhere else.

- `toggleFeatureFlag` — global `FeatureFlag` config: `enabled`, `rolloutPercent`,
  a forced `variant`, a `variantWeights` split, and a global `payload`. Each
  granular field is validated for the key (variant/weights via `isVariantOf`,
  payload via `validatePayload`).
- `setFeatureFlagOverride` — a per-user `FeatureFlagOverride`: pin a user on/off,
  to a specific `variant`, or to a `payload`. Same validation and gate.

## Targeting, recording, and measuring by segment

A "segment" (what you might call a tag) is a **person property** or a **cohort**
in PostHog. One mechanism drives all three of: who sees a feature, whose sessions
get recorded, and how a feature's flow is measured.

**Step 0 — tag people.** `<PostHogIdentify>` (`src/lib/analytics/posthog-identify.tsx`)
calls `identifyUser` (`identify.ts`) with the signed-in person's tags; it's mounted
in the admin layout for staff. `posthog.identify(distinctId, traits)` sets the
person properties PostHog targets on **and** makes posthog-js re-evaluate flags for
them — so the flag values it attaches to events / uses to gate replay match what
the server resolved. For **end-user** surfaces (no auth in this template yet),
render `<PostHogIdentify>` at your authed root with that user's traits:

```tsx
<PostHogIdentify distinctId={user.id} traits={{ plan: 'pro', beta_tester: true }} />
```

Keep traits non-PII and low-cardinality. Same `distinctId` the server uses, so
client + server land on one person. For **local** flag evaluation (secretKey set)
the server only sees properties you pass in `personProperties` — so also pass the
same traits into the flag context (the admin layout shows the seam). Behavioural
/ dynamic cohorts can't be evaluated locally and fall back to the remote endpoint
automatically, where PostHog uses the stored (identify'd) properties.

**Some people see a feature, others don't (default off).** Ship the flag
`default: false`. In PostHog, set the flag's release condition to your segment
(`beta_tester = true`, or a cohort) at 100%, everyone else 0%. `useFlag(key)` /
`getFlag(key)` returns true only for matching people. Force individuals with
`setFeatureFlagOverride({ key, userId, enabled: true })`.

**Record sessions only for tagged people.** The `session_recording` flag ships
`default: false`. Target it to your segment in PostHog, then PostHog → Settings →
Session Replay → **"Enable recordings using a feature flag"** → pick
`session_recording`. Now only matching people are recorded — nobody by default.

**Measure a specific new feature's flow.** Gate the feature with its flag
(default off, targeted). Instrument the flow with the taxonomy's `flow_started` /
`flow_step_started` events (`src/lib/analytics/events.ts`). PostHog attaches the
user's active flags to every event, so in PostHog you build a **Funnel** on those
flow events and **break down by the feature flag** — comparing exposed vs. not,
or variant A vs. B, through the same funnel. (Accurate breakdown needs the user
identified so posthog-js evaluates the same flags the app rendered; bootstrapping
posthog-js from the server snapshot removes any divergence — an optional
precision upgrade.)

## Exposure tracking

Exposure is PostHog-native `$feature_flag_called`, fired by
`evaluateFlags().getFlag()` on intentional single reads (see above) — free, no
taxonomy change, and what experiment analysis reads. A first-class
`feature_flag_evaluated` taxonomy event is optional: if wanted, add a `flag_key`
**enum** property (closed set = the registry keys) to
`src/lib/analytics/events.ts`. Never a free-text flag name
(`docs/rules/analytics.md`).

## RLS — the deny-by-default backstop

`FeatureFlagOverride` targets **app users by id**, so `feature_flag_overrides`
is user-scoped and gets `ENABLE ROW LEVEL SECURITY` (no policy, no `FORCE`) in
the same CI-generated create migration that creates it (`docs/rules/auth.md`,
`docs/rules/authorization.md`). Do NOT hand-write a file under
`prisma/schema/migrations/`; this statement belongs in the CI-generated create
migration:

```sql
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
```

`FeatureFlag` is **global config, not user-scoped** — it gets **no** RLS
statement. Its enforcement is the `flags.manage` admin gate on the write actions,
not a user-owned row. The granular columns (`variant`, `variantWeights`,
`payload` on `feature_flags`; `variant`, `payload` on `feature_flag_overrides`)
are all **nullable and additive** — a plain boolean flag leaves them unset, so
the migration that adds them is a pure column-add with no RLS change (the
overrides table keeps the RLS it already has).
