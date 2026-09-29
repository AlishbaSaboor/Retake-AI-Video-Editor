# Analytics & instrumentation

Product analytics is PostHog. Every event this app sends goes through the
typed taxonomy in `src/lib/analytics/` — never call `posthog.capture`
directly from feature code. The taxonomy is one source of truth
(`src/lib/analytics/events.ts`) shared by client and server, so a name or a
property shape is defined in exactly one place and can't drift.

## The six rules

Every event obeys these — the types in `events.ts` enforce them, this
section is the _why_:

1. **`object_action`** — a noun plus a past-tense verb: `element_clicked`,
   `flow_started`, `payment_succeeded`. Not `click_element`, not `clicking`.
2. **`snake_case`** — event names and every property key, always.
3. **Past tense** — the action already happened when we record it
   (`page_viewed`, not `page_view`).
4. **No variables in the name** — names are fixed string literals, never
   interpolated from runtime values (`track('page_' + name + '_view')` is
   banned — it makes an unbounded, un-queryable event set). The only
   assembled names are the process and notification ones, and those are
   built from **closed enums** (`payment_succeeded`, `notification_sent`),
   so the full set stays finite and typed.
5. **No PII, no free text** — property values are ids, enums, or booleans,
   linked to an entity id. A human-typed value (a name, an email, a search
   string, an error message) never becomes a property. There is
   deliberately no free-text `string` field in the event contracts; record
   _that_ a field changed, not _what_ was typed.
6. **Common attributes are defined once** — session/page attributes and
   entity ids in `events.ts`, common user attributes in `attribution.ts` /
   `identify.ts`. Don't re-declare them per event.

## Where each piece lives

| File                                       | Job                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/analytics/events.ts`              | The catalog: event names, per-event prop contracts, the enums (element/field/permission types), entity ids, and the process/notification name builders. Edit this first to add an event. |
| `src/lib/analytics/track.ts`               | Client `track(event, props)` (strict, typed) + convenience wrappers + `capture()` escape hatch. Auto-attaches `session_id`, `page_name`, `timestamp_utc`.                                |
| `src/lib/analytics/server.ts`              | Server `trackServer(event, ctx, props)` + `trackRequestFailed` / `trackJob` / `trackProcess` / `trackNotification`. posthog-node, `server-only`.                                         |
| `src/lib/analytics/attribution.ts`         | First-touch UTM capture, `user_source`, `app_version`. Run once on load.                                                                                                                 |
| `src/lib/analytics/identify.ts`            | `identifyUser` (post-login) / `resetAnalytics` (logout).                                                                                                                                 |
| `src/lib/analytics/analytics-provider.tsx` | Mounted in the root layout. Fires `app_opened` once/session, runs attribution, emits `$pageview` + `page_viewed` on route change.                                                        |
| `src/lib/analytics/permissions.ts`         | `permission_prompted/approved/denied` wrappers + a `requestNotificationPermission` example.                                                                                              |
| `src/lib/analytics/use-tracked-field.ts`   | `useTrackedField` — spreads onto an input, emits `field_changed` once per edit.                                                                                                          |
| `src/components/track-impression.tsx`      | `<TrackImpression>` — `element_viewed` via IntersectionObserver.                                                                                                                         |

## Common attributes

**Page/event** (attached by `track()` automatically): `session_id`,
`page_name`, `timestamp_utc`, plus any entity ids you pass —
`creator_id`, `brand_id`, `campaign_id`, `payment_id` (ids, never names).

**User** — set by attribution/identify, then attached by PostHog to every
event without you passing them:

- `os`, `device`, `country` — PostHog autocapture already provides these as
  `$os`, `$device_type`, `$geoip_country_code`. Don't re-implement them.
- `user_source` — `internal` (direct/in-app nav) vs `external` (arrived
  with UTM params or from another origin).
- `user_utm_source`, `user_utm_campaign`, … — **first-touch**, set-once, so
  the original acquisition source is never overwritten by a later visit.
- `app_version` — from `NEXT_PUBLIC_APP_VERSION`; wire it to your build's
  commit/version in CI.
- `user_id` — set via `identifyUser`. `person_profiles: 'identified_only'`
  is on, so events stay anonymous until you identify. Use the **same**
  stable id on client (`identifyUser`) and server (`trackServer` distinctId)
  so both land on one person.

## Adding an event

1. Add the name to `ANALYTICS_EVENTS` and its prop contract to `EventProps`
   in `events.ts` (or extend `ANALYTICS_PROCESSES` for a new backend flow).
   Keep every property an id, enum, or boolean — widen an enum rather than
   accepting an off-list string.
2. Call it: `track('the_event', { … })` on the client, or
   `trackServer('the_event', { distinctId }, { … })` on the server. TypeScript
   rejects an unknown name or a wrong property shape.
3. Only reach for `capture()` (client) for a genuinely throwaway experiment.
   Anything that outlives the experiment graduates into the catalog — a
   string-literal event with no type is exactly what this system exists to
   prevent.

## The event catalog

**Client / UX flow**

- `app_opened` — start of a session, once, regardless of entry page.
- `page_viewed` — every route change (alongside PostHog's native `$pageview`).
- `element_viewed` — impression on a section/CTA (`<TrackImpression>`).
- `element_clicked` — click on an element (`trackElementClicked`).
- `field_changed` — a field was edited (`useTrackedField`); records the
  field, its type, and a state — never the value.
- `flow_started` / `flow_step_started` — any sequential funnel (onboarding,
  KYC, campaign apply): start once, then one step event per step.
- `filter_applied` / `filter_removed` — list/search filters.
- `toggle_changed` — a boolean toggle.

**Backend / server-side**

- `request_failed` — a backend service failed (DB, cache, third party);
  `service_name` + a `failure_reason` **code**. Call it at the failing
  boundary — `captureError` can't know which service it was.
- `error_shown` — an error actually reached the user. Emitted
  **automatically** by `captureClientError` (always) and by `captureError`
  when you pass a `distinctId`/`userId` in its context. `error_type` is a
  category (an `AppError.code` or the error class name), never the message.
  Don't fire it by hand.
- `permission_prompted` / `permission_approved` / `permission_denied` —
  device/browser permission funnel.
- `<process>_initiated` / `_succeeded` / `_failed` — a backend process or
  third-party dependency, one enumerated `process` per real flow
  (`ANALYTICS_PROCESSES`). Fixed enums for status; `failure_reason` code on
  the failed phase.
- `job_started` / `job_completed` / `job_failed` — async jobs (platform data
  refresh, account link); `job_id`, optional `platform`, `failure_reason`.
- `notification_sent` / `_delivered` / `_clicked` / `_bounced` — comms /
  push lifecycle; `comms_id` + `comms_name`.

## Relationship to error handling

`error_shown` is the analytics half of the error system in
`docs/rules/error-handling.md`; the same `captureError`/`captureClientError`
call reports the error to Sentry (if unexpected) and emits `error_shown` to
PostHog (always). That mirrors the split already documented there —
`AppError` is counted in PostHog, not sent to Sentry — and keeps one
`error_type` category describing a failure the same way in both tools.
