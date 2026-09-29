// Pino structured JSON to stdout, one object per line — Vercel's log drain is the
// transport. Correlation travels in AsyncLocalStorage, so a `runId` set once
// at the top of a run reaches a line emitted deep inside a call without any
// function between the two knowing about logging. See docs/rules/logging.md
// for the logger's remit vs. Sentry's.
//
// Server-side only: `node:async_hooks` and `process.stdout` are unavailable in
// a browser bundle, and eslint.config.mjs blocks a `'use client'` file from
// importing it. It deliberately does not import `server-only`, which would
// throw in the `node:test` suites that exercise it.
export { log, createLogger, resolveThreshold } from './logger'
export type { LogFields, LogLevel, Logger, LogSink, Threshold, LoggerOptions } from './logger'
export { logContext, withLogContext } from './context'
export { redact } from './redact'
