import pino from 'pino'
import { logContext } from './context'
import { redact, scrubString } from './redact'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

export type Logger = {
	debug(message: string, fields?: LogFields): void
	info(message: string, fields?: LogFields): void
	warn(message: string, fields?: LogFields): void
	error(message: string, fields?: LogFields): void
	child(fields: LogFields): Logger
}

export type LogSink = (line: string) => void

export type Threshold = LogLevel | 'silent'

const LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error', 'silent']

const DEFAULT_THRESHOLD: Threshold = 'info'
const MAX_DEPTH = 8
const TRUNCATED = '[truncated]'
const CIRCULAR = '[circular]'

function isThreshold(value: string | undefined): value is Threshold {
	return value != null && LEVELS.includes(value)
}

// Read straight from `process.env` rather than through `@/lib/env`: a log line
// has to work while that schema is still being validated, and a logger that
// cannot report a bad boot is the one place logging is needed most.
export function resolveThreshold(source: NodeJS.ProcessEnv): Threshold {
	const configured = source.LOG_LEVEL?.trim().toLowerCase()
	if (isThreshold(configured)) return configured
	return source.NODE_ENV === 'test' ? 'silent' : DEFAULT_THRESHOLD
}

function serializeError(error: Error, seen: WeakSet<object>, depth: number): LogFields {
	const fields: LogFields = { name: error.name, message: error.message, stack: error.stack }
	// Own enumerable properties are how error classes carry their context —
	// e.g. an AppError's `code`, or a fetch wrapper's `.url`/`.status`. Keep
	// them on the line instead of logging an empty `{}`.
	for (const [name, value] of Object.entries(error)) {
		fields[name] = serializeValue(value, seen, depth + 1)
	}
	if (error.cause != null) fields.cause = serializeValue(error.cause, seen, depth + 1)
	return fields
}

function serializeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
	if (value == null || typeof value === 'string' || typeof value === 'boolean') return value
	if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
	if (typeof value === 'bigint') return value.toString()
	if (typeof value === 'function' || typeof value === 'symbol') return undefined
	if (depth >= MAX_DEPTH) return TRUNCATED
	if (typeof value !== 'object') return String(value)
	if (seen.has(value)) return CIRCULAR
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
	}

	seen.add(value)
	try {
		if (value instanceof Error) return serializeError(value, seen, depth)
		if (Array.isArray(value)) return value.map((item) => serializeValue(item, seen, depth + 1))
		if (value instanceof Set) return [...value].map((item) => serializeValue(item, seen, depth + 1))
		const entries = value instanceof Map ? [...value] : Object.entries(value)
		const serialized: LogFields = {}
		for (const [name, item] of entries) {
			serialized[String(name)] = serializeValue(item, seen, depth + 1)
		}
		return serialized
	} finally {
		seen.delete(value)
	}
}

function prepareFields(bound: LogFields, fields?: LogFields): LogFields {
	const record: LogFields = {}
	const seen = new WeakSet<object>()
	// Reserved keys are never overridden: a caller-supplied `level` would make
	// every line about it unfindable in the drain.
	for (const [name, value] of Object.entries({
		...logContext(),
		...bound,
		...fields
	})) {
		if (name !== 'level' && name !== 'time' && name !== 'message') {
			record[name] = serializeValue(value, seen, 0)
		}
	}
	return redact(record) as LogFields
}

function writeToStdout(line: string): void {
	process.stdout.write(`${line}\n`)
}

export type LoggerOptions = {
	threshold?: Threshold
	write?: LogSink
	fields?: LogFields
}

export function createLogger(options: LoggerOptions = {}): Logger {
	const sink = options.write ?? writeToStdout
	const backend = pino(
		{
			level: options.threshold ?? resolveThreshold(process.env),
			base: null,
			messageKey: 'message',
			timestamp: pino.stdTimeFunctions.isoTime,
			// Fields are already normalized and scrubbed, including nested causes.
			// Pino's default err serializer would flatten that cause chain again.
			serializers: { err: (value: unknown) => value },
			formatters: { level: (label) => ({ level: label }) }
		},
		{
			write(line: string) {
				try {
					// Pino owns JSON encoding and framing; LogSink keeps its existing
					// single-record contract without the trailing newline.
					sink(line.slice(0, -1))
				} catch {
					// A failed sink must not fail the request or retry unsafe output.
				}
			}
		}
	)

	function bind(bound: LogFields): Logger {
		const at =
			(level: LogLevel) =>
			(message: string, fields?: LogFields): void => {
				if (!backend.isLevelEnabled(level)) return
				try {
					backend[level](prepareFields(bound, fields), scrubString(message))
				} catch {
					// Never reuse the original message/fields after serialization fails.
					backend[level]('Log entry could not be serialized')
				}
			}

		return {
			debug: at('debug'),
			info: at('info'),
			warn: at('warn'),
			error: at('error'),
			child: (fields) => bind({ ...bound, ...fields })
		}
	}
	return bind(options.fields ?? {})
}

export const log = createLogger()
