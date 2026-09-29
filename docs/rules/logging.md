# Logging

Two tools, two jobs — don't blend them (this is the same split as
`docs/rules/error-handling.md`, from the other side):

- **The Pino logger** (`src/server/lib/logger`) is the _record of what happened_:
  a cron run started, an external call took 900ms, a batch settled 42 of 50
  items. Structured JSON, one object per line, to stdout — Vercel's log drain
  is the transport.
- **Sentry** (via `captureError`, `docs/rules/error-handling.md`) is for
  _what broke and someone should be paged about_: an unexpected exception. It
  is not a log of routine activity, and the logger is not an error reporter.

A handled, expected failure (`AppError`) is neither — it's normal control
flow; count it in PostHog, don't Sentry it and don't log-spam it.

## Using it

Pino is the logging engine. Application code imports the shared wrapper,
never `pino` directly; ESLint permits that import only in
`src/server/lib/logger/logger.ts`. The wrapper preserves our message-first
API, async context, safe value serialization and credential scrubbing.
Pino handles levels, timestamps and JSON output. No worker transport or
file output is needed: the deployment platform collects stdout.

```ts
import { log } from '@/server/lib/logger'

log.info('sync started', { source: 'stripe', batchSize: 50 })
log.warn('rate limited, backing off', { retryInMs: 2000 })
log.error('sync finished with skips', { skipped: 8 }) // still handled — not a page
```

- `log.debug | info | warn | error(message, fields?)` — `message` is a short
  human string; everything structured goes in `fields`.
- `log.child(fields)` returns a logger that stamps those fields on every line
  — bind `{ source }` once at the top of a job instead of repeating it.
- **Correlation without prop-drilling**: `withLogContext({ runId }, fn)` puts
  fields in `AsyncLocalStorage` so every line emitted anywhere inside `fn`
  carries them, even code that knows nothing about logging. `logContext()`
  reads the current scope.
- An `Error` passed in `fields` is serialised in full (name, message, stack,
  own properties, `cause` chain) instead of logging an empty `{}`.

## Levels

`LOG_LEVEL` (`.env.example`) sets the floor: `debug | info | warn | error |
silent`. Defaults to `info`, and to `silent` under `NODE_ENV=test` so suites
stay quiet. The logger reads `process.env.LOG_LEVEL` directly (not through
`src/lib/env.ts`) so it can report a bad boot before the env schema has even
run — a logger that can't describe a broken startup is useless exactly when
it's needed most.

## Two hard rules

1. **No `console.*` in `src/`.** ESLint's `no-console` enforces it (it allows
   `warn`/`error` only in `instrumentation*.ts`, `sentry.*.config.ts`, and
   the shared `src/lib/env.ts` boot validator, which cannot import a
   server-only logger). A `console.log` vanishes
   into an ephemeral serverless log nobody searches; a structured line lands
   in the drain queryable by field.
2. **The logger is server-only.** It uses `node:async_hooks` and
   `process.stdout`, so it can't run in a browser bundle — ESLint blocks a
   `'use client'` file from importing it. A Client Component reports errors
   through `captureClientError` (Sentry), never the logger.

## Redaction is a backstop, not a licence

Every line is run through `redact()` (`src/server/lib/logger/redact.ts`),
which strips values under sensitive key names (`*token*`, `*secret*`,
`*password*`, `authorization`, `cookie`, …) and scrubs credentials out of
string values (connection-string passwords, `?api_key=` query params, `Bearer`
headers, email addresses). This exists so a field someone _forgot_ was
sensitive — a whole request object, a connection string inside an error
message — doesn't leak. It is not permission to log a secret on purpose:
don't put credentials, tokens, or PII in `fields` and lean on the scrubber to
catch them.

Serialization failures emit a fixed message without the original payload.
Synchronous sink failures are swallowed so logging cannot fail the request.

`pnpm test` runs the logger, redaction and async-context contract tests.
The `structured-logger` standard checks the dependency, shared implementation,
import restriction and test wiring; the tests prove the behavior.
