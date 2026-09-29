import { AsyncLocalStorage } from 'node:async_hooks'
import type { LogFields } from './logger'

const STORAGE_KEY = Symbol.for('8x.logger.context')

// Pinned to the realm (via a global Symbol) rather than to this module, so a
// `runId` set once at the top of a request survives even if the module graph
// ends up loading this file more than once — which a test runner mixing
// loaders, or a mixed CJS/ESM boundary, can do.
const realm = globalThis as unknown as Record<symbol, AsyncLocalStorage<LogFields> | undefined>
const storage = (realm[STORAGE_KEY] ??= new AsyncLocalStorage<LogFields>())

export function logContext(): LogFields {
	return storage.getStore() ?? {}
}

// Merges onto the enclosing scope rather than replacing it, so a `runId` set
// once at the top of a run survives every nested scope beneath it.
export function withLogContext<T>(fields: LogFields, fn: () => Promise<T>): Promise<T> {
	return storage.run({ ...logContext(), ...fields }, fn)
}
