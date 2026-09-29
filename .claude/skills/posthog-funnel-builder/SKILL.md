---
name: posthog-funnel-builder
description: Build a PostHog funnel from a described user journey. Use when the user describes a flow they want to track as a funnel (e.g. "funnel from signup to first project created", "track from the pricing page to checkout") and wants it created in PostHog. Maps the journey to the events the code actually fires, shows which event fires from which route or handler, gets confirmation, then creates the funnel via the PostHog MCP.
---

# PostHog funnel builder

Turn a plain-English user journey into a real PostHog funnel, grounded in the
events the code actually fires. The whole point is to **not guess event
names**: find them in the codebase, confirm they exist in PostHog, confirm the
list with the user, then build.

## Hard rules

1. **Never invent an event name.** Every step must be an event you found in
   the code _and_ confirmed is arriving in PostHog. If the user wants a step
   that isn't instrumented, say so plainly — it needs a code change first, it
   cannot be funneled today.
2. **Get explicit confirmation of the event list before creating anything**
   (step 5 is a hard gate).
3. **Confirm which PostHog project to build in** before the first query. Run
   the MCP's project listing and, if there's more than one, ask. Never assume.

## How this repo is instrumented

- **Client** — `posthog-js`, wired in `src/lib/posthog/client.tsx`. Events
  fire from Client Components under `src/app/[locale]/**` and
  `src/components/**`. Client events carry `$lib = web`.
- **Server** — `posthog-node`, via `getPostHogServerClient()` in
  `src/lib/posthog/server.ts`. Events fire from server actions in
  `src/server/actions/**` and from API handlers in `src/server/api/**` — note
  the files under `src/app/api/**/route.ts` are thin `createApiRoute` wiring,
  so the capture call lives in the handler, not the route. Server events carry
  `$lib = posthog-node`.

Find capture sites with:

```bash
rg -n "posthog\.capture|\.capture\(|getPostHogServerClient" src
```

If the project has grown an event-name catalog (a constants module rather than
inline string literals), resolve every constant to its literal value before
querying PostHog — a funnel step needs the string that actually ships.

## Workflow

### 1. Understand the journey

Identify the **start** and **end** points and the intermediate
pages/routes. If there's no clear start or end, ask one clarifying question;
otherwise proceed.

### 2. Locate the code for each stage

Map each stage to its route or component: `src/app/[locale]/…/page.tsx` for
pages, `src/app/api/**/route.ts` and `src/server/actions/**` for the server
side of a submit/complete action.

### 3. Find the tracked events

Grep the located files _and the handlers they call_ for capture sites. For a
server-side step, trace the button through its server action or route handler
and grep there. For each event record:

- **event name** (the literal string)
- **source** — client or server
- **trigger** — route + button/handler, with `file:line`

### 4. Cross-check against PostHog

Via the PostHog MCP, in the confirmed project. Follow the MCP's own discovery
rules (inspect a tool before calling it; read the data schema before
querying). For each candidate event:

- confirm it exists,
- confirm it's actually arriving, and roughly how much and how recently — a
  count grouped by `$lib` over the last 14 days is ideal.

Flag anything defined in code but not arriving, anything server-only, and
anything obviously over- or under-firing.

### 5. Present the mapping, then stop

| Step | Event                  | Source | Fires from                                | In PostHog (14d) |
| ---- | ---------------------- | ------ | ----------------------------------------- | ---------------- |
| 1    | `pricing_viewed`       | client | `src/app/[locale]/pricing/page.tsx:NN`    | ✅ 4.4k          |
| 2    | `checkout_started`     | client | Checkout button — `src/components/…:NN`   | ✅ 310           |
| 3    | `subscription_created` | server | `src/app/api/billing/webhook/route.ts:NN` | ✅ 95            |

Then state the proposal explicitly — _"the funnel will use A → B → C, in
project X, over the last 14 days"_ — and list anything you deliberately
excluded and why.

**Wait for the user.** Handle the reply:

- Approve → step 6.
- "Add event X" that you found → add it.
- "You missed X" → grep again, add it.
- "Add X" where X isn't instrumented anywhere → tell them it needs a code
  change first, and point at the exact handler where it would go. Do not put
  a non-existent event in the funnel.
- Reorder or remove → adjust and re-present.

### 6. Build it

1. **Query the funnel first** to validate the steps and get real numbers,
   before creating any saved insight.
2. Apply the gotchas below (attribution, date range, conversion window).
3. Create the insight, wrapping the funnel query in the viz node shape the MCP
   expects. Give it a clear name and a description that records the steps and
   any caveat.
4. Return the insight URL plus a one-paragraph read of the conversion and the
   biggest drop-off.

### 7. Offer follow-ups

Adding it to a dashboard, sibling funnels, or fixing an instrumentation gap
you found — pointing at the exact file and handler.

## Gotchas

- **Client and server steps don't mix cleanly.** A "completion" event fired
  server-side has none of the client's super-properties. Breaking such a
  funnel down by a client-only property drops the server step into an unset
  bucket. Put the breakdown filter on **step 1 only** and use **first-touch
  attribution** so completions still count under the bucket the user started
  in.
- **Event age matters.** An event only exists from the day its PR shipped.
  Don't compare a new client event against an old server event over "all
  time" — default to a recent window and tell the user the launch date. Find
  it with `git log -S'<event_name>' --format='%ad %h %s' --date=short -1`.
- **Over-firing.** A `*_viewed` event on a component that re-renders fires
  many times per person. Funnels dedupe by person so it's usually harmless,
  but flag it when event counts wildly exceed person counts.
- **Capture can be silently off.** `getPostHogServerClient()` returns
  `undefined` when `NEXT_PUBLIC_POSTHOG_KEY` is unset, and the client
  provider no-ops the same way. An event that looks instrumented in code may
  simply never have fired in an environment missing the key — check the
  environment before concluding the instrumentation is broken.
- **Feature-flag and session-replay traffic** shows up alongside events;
  don't count it as a funnel step.

## Notes

- If the user names a different project, build there instead.
- Hand over commands to run rather than executing them when the user has asked
  for that.
