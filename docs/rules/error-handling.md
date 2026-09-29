# Error handling

Two failure modes get two different responses — don't blend them.

- **A user did something the product doesn't allow** (declined payment,
  plan limit, taken username) — throw `AppError`
  (`src/lib/errors/app-error.ts`) with a message written for the user, not
  the log. This is normal control flow, not a bug: it's never sent to
  Sentry, only counted in PostHog so product can see how often it happens.
- **Something actually broke** (an unexpected null, a downstream timeout, a
  real bug) — let it throw as whatever error the failing code produces.
  `captureError()`/`captureClientError()` report it to Sentry and hand back
  a generic, safe message — never the raw error.

## The one rule

**Never call `Sentry.captureException`, `console.error`, or write a raw
`error.message` into a response/UI directly.** Always go through:

- **`captureError(error, context?)`** — `src/lib/observability/capture-error.ts`,
  server-only (route handlers, server actions, cron jobs).
- **`captureClientError(error, context?)`** — `src/lib/observability/capture-client-error.ts`,
  client components (error boundaries, event handlers).

Both normalize any error and return `{ userMessage, status, isExpected }` —
`userMessage` is always safe to show; nothing else about the error should
reach the user. This implements the rule already stated in
`docs/rules/code-quality.md`'s Logging section (a stack trace or raw DB
error is free reconnaissance for an attacker, not just bad UX) — that's the
_why_, this file is the _how_.

## Throwing a user-facing error

```ts
import { AppError } from '@/lib/errors/app-error'

if (!canAfford) {
	throw new AppError("You've hit your plan's limit — upgrade to add more.", {
		status: 402,
		code: 'plan_limit'
	})
}
```

`createApiRoute` (`src/server/api/route-factory.ts`) already catches this
and responds with the right status + `userMessage` — nothing extra to wire
up in a route handler. `validatedAction`
(`src/server/actions/validated-action.ts`) is the Server Action equivalent
— same Zod input contract, same `captureError` reporting, returns
`{ ok: true, data } | { ok: false, error, status }` instead of a `Response`
since a Server Action's return value goes straight to whatever called it:

```ts
'use server'

import { z } from 'zod'
import { validatedAction } from '@/server/actions/validated-action'

export const createThing = validatedAction({
	input: z.object({ name: z.string().min(1) }),
	handler: async (input) => {
		if (!canAfford) {
			throw new AppError("You've hit your plan's limit — upgrade to add more.", { status: 402 })
		}
		return prisma.thing.create({ data: { name: input.name } })
	}
})
```

On the client, pass the `error`/`userMessage` straight to `toast()`
(`docs/rules/components.md`) — that's the intended path for showing a
specific, per-error message; the route-level error boundaries deliberately
don't (see below).

## Error boundaries

- **`src/app/[locale]/error.tsx`, `src/app/global-error.tsx`,
  `src/app/[locale]/not-found.tsx`** — route-level, already wired, nothing
  to add per-project. Both `error.tsx`/`global-error.tsx` auto-recover from
  a stale-chunk error after a redeploy (reload once, throttled) before
  showing the fallback UI. These show one generic, friendly message — not a
  per-error one — because Next strips custom error properties crossing the
  server→client boundary in production, so an `AppError`'s `userMessage`
  thrown in a Server Component doesn't reliably survive to reach them. For
  a specific user-facing message, handle it where the error is still a real
  object: a Server Action's return value, an API route's JSON body, or an
  error thrown directly in a Client Component (which `captureClientError`
  and `<ErrorBoundary>` below both see intact).
- **`src/components/error-boundary.tsx`** — wrap a smaller subtree (a
  widget that can fail independently of the rest of the page) with
  `<ErrorBoundary>` when you want a smaller blast radius than the whole
  route. Don't wrap something route-level `error.tsx` already covers —
  that's redundant. Its `onError` calls `unstable_rethrow` first so a
  `notFound()`/`redirect()` thrown inside the wrapped subtree still reaches
  Next's own handling instead of being swallowed into a generic fallback —
  keep that call if you ever touch this file.
- **`src/app/[locale]/[...rest]/page.tsx`** — exists purely so
  `[locale]/not-found.tsx` actually gets used. Without it, a URL with no
  matching page (e.g. `/typo`) never resolves into the `[locale]`
  segment at all, so Next falls back to its own built-in default 404
  instead of your custom one — a real Next.js App Router + next-intl
  gotcha, confirmed by testing it in a browser, not just assumed. Leave
  this file alone; it's plumbing, not a page to build on.

`global-error.tsx` uses hardcoded hex values instead of the design tokens —
deliberate, not an oversight: it can render before `globals.css` loads, so
it can't depend on `@theme`. Every other error UI goes through
`src/components/error-page.tsx` and the real tokens.

## Slack alerts

`captureError` also posts to Slack (`src/lib/notifications/slack.ts`) for
every unexpected error, production-only — local/preview noise never pages
anyone. No-ops entirely until `SLACK_ALERT_WEBHOOK_URL` is set (create an
"Incoming Webhook" in Slack's app settings), same "off until configured"
convention as Sentry/PostHog. Fire-and-forget and never throws, same as
every other observability call in this file.

This posts every occurrence with no de-duplication — fine at a template's
starting scale, but a hot error loop will flood the channel until nobody
reads it. If that happens, extend `notifyUnexpectedError` in
`src/lib/notifications/slack.ts` with a fingerprinted digest (track
last-alerted-at per `error.name`, only post on first occurrence and again
after a cooldown) rather than adding a second, uncoordinated alert path —
`8x-payout`'s `lib/observability/alerts.ts` is the org's reference
implementation of that pattern if this project needs it. Swapping the
destination entirely (Discord, PagerDuty, Teams) means changing
`postToSlack`'s body only — `captureError` and everything upstream of it
doesn't know or care what `notifyUnexpectedError` actually does.

`captureClientError` does **not** trigger a Slack alert — a webhook URL is
a secret and can't safely ship in the client bundle. If client-side errors
need to reach Slack too, the org's own pattern (legacy `8x`,
`app/error.tsx`) is to `POST` to a dedicated internal API route from the
error boundary, which then calls `captureError` server-side; that's the
extension point if this project needs it, not a reason to move the webhook
URL to `NEXT_PUBLIC_*`.

## Why `AppError` isn't Sentry-reported

An expected failure happening is not new information for an engineer — it's
confirmation the guard rail works. Reserve Sentry for what nobody predicted;
otherwise it fills with noise until nobody reads it, which is worse than
under-reporting. `8x-payout` and `8x-brands` independently converged on the
same split in production; the legacy `8x` app additionally shares one
`error_category` taxonomy between its Sentry and PostHog reporting so both
tools describe failures the same way — worth adopting here too once this
project has enough real error categories for a taxonomy to be more than one
entry.
