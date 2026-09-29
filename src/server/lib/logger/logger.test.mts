import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLogger, resolveThreshold, type LogFields, type Threshold } from './logger'
import { withLogContext } from './context'

function capture(threshold: Threshold = 'debug') {
	const lines: LogFields[] = []
	const log = createLogger({ threshold, write: (line) => lines.push(JSON.parse(line)) })
	return { log, lines, last: () => lines.at(-1) }
}

test('every line carries level, an ISO time and the message', () => {
	const { log, last } = capture()
	log.info('nightly run started')
	assert.equal(last()?.level, 'info')
	assert.equal(last()?.message, 'nightly run started')
	assert.match(String(last()?.time), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
})

test('drops everything below the threshold', () => {
	const { log, lines } = capture('warn')
	log.debug('a')
	log.info('b')
	log.warn('c')
	log.error('d')
	assert.deepEqual(
		lines.map((line) => line.message),
		['c', 'd']
	)
})

test('silent emits nothing at all', () => {
	const { log, lines } = capture('silent')
	log.error('not even this')
	assert.equal(lines.length, 0)
})

test('assembles no fields at all below the threshold', () => {
	const { log, lines } = capture('error')
	let reads = 0
	const fields: LogFields = {}
	Object.defineProperty(fields, 'expensive', {
		enumerable: true,
		get: () => {
			reads++
			return 'value'
		}
	})

	log.info('skipped', fields)
	assert.equal(reads, 0)

	log.error('emitted', fields)
	assert.equal(reads, 1)
	assert.equal(lines.at(-1)?.expensive, 'value')
})

test('merges ambient context, child fields and call-site fields in that precedence', async () => {
	const { log, last } = capture()
	await withLogContext({ runId: 'run-1', stage: 'ambient' }, async () => {
		const child = log.child({ source: 'apple', stage: 'child' })
		child.info('gathered', { stage: 'call-site', apps: 3 })
	})
	assert.deepEqual(last(), {
		level: 'info',
		time: last()?.time,
		message: 'gathered',
		runId: 'run-1',
		source: 'apple',
		stage: 'call-site',
		apps: 3
	})
})

test('reaches ambient context set by a caller that knows nothing about it', async () => {
	const { log, last } = capture()
	async function deep(): Promise<void> {
		log.info('deep')
	}
	await withLogContext({ runId: 'run-1' }, deep)
	assert.equal(last()?.runId, 'run-1')
})

test('a child does not leak fields back into its parent', () => {
	const { log, last } = capture()
	log.child({ source: 'apple' }).info('child')
	log.info('parent')
	assert.equal(last()?.source, undefined)
})

test('never lets a caller field overwrite a reserved key', () => {
	const { log, last } = capture()
	log.warn('real message', { level: 'debug', message: 'fake', time: 'yesterday' })
	assert.equal(last()?.level, 'warn')
	assert.equal(last()?.message, 'real message')
	assert.notEqual(last()?.time, 'yesterday')
})

class TestHttpError extends Error {
	readonly service: string
	readonly url: string
	readonly status: number

	constructor(input: { service: string; url: string; status: number; cause?: unknown }) {
		super(`${input.service} responded ${input.status}`, { cause: input.cause })
		this.name = new.target.name
		this.service = input.service
		this.url = input.url
		this.status = input.status
	}
}

test('serialises an Error instead of printing an empty object', () => {
	const { log, last } = capture()
	log.error('vendor call failed', {
		err: new TestHttpError({ service: 'store-apps', url: 'https://x.test/a', status: 429 })
	})

	const err = last()?.err as LogFields
	assert.equal(err.name, 'TestHttpError')
	assert.equal(err.message, 'store-apps responded 429')
	assert.match(String(err.stack), /TestHttpError/)
	assert.equal(err.service, 'store-apps')
	assert.equal(err.url, 'https://x.test/a')
	assert.equal(err.status, 429)
})

test('follows a cause chain', () => {
	const { log, last } = capture()
	const root = new Error('socket hang up')
	log.error('failed', {
		err: new TestHttpError({
			service: 'apple',
			url: 'https://x.test/b',
			status: 500,
			cause: root
		})
	})

	const cause = (last()?.err as LogFields).cause as LogFields
	assert.equal(cause.name, 'Error')
	assert.equal(cause.message, 'socket hang up')
})

test('handles a thrown value that is not an Error', () => {
	const { log, last } = capture()
	log.error('failed', { err: 'just a string' })
	assert.equal(last()?.err, 'just a string')

	log.error('failed', { err: { code: 42 } })
	assert.deepEqual(last()?.err, { code: 42 })
})

test('does not throw on a BigInt, a Date, a Map or a cycle', () => {
	const { log, last } = capture()
	const node: LogFields = { name: 'root' }
	node.self = node

	log.info('odd values', {
		count: 10n,
		at: new Date('2026-08-18T00:00:00.000Z'),
		byGeo: new Map([['us', 1]]),
		tags: new Set(['a']),
		node,
		missing: undefined,
		ratio: Number.NaN
	})

	assert.equal(last()?.count, '10')
	assert.equal(last()?.at, '2026-08-18T00:00:00.000Z')
	assert.deepEqual(last()?.byGeo, { us: 1 })
	assert.deepEqual(last()?.tags, ['a'])
	assert.deepEqual(last()?.node, { name: 'root', self: '[circular]' })
	assert.equal(last()?.ratio, 'NaN')
	assert.equal('missing' in (last() ?? {}), false)
})

test('redacts a secret before it reaches the sink', async () => {
	const { log, last } = capture()
	await withLogContext({ apiKey: 'live-key' }, async () => {
		log.info('configured', {
			databaseUrl: 'postgresql://postgres:s3cr3t@db.test:6543/postgres'
		})
	})
	assert.equal(last()?.apiKey, '[redacted]')
	assert.equal(last()?.databaseUrl, 'postgresql://postgres:[redacted]@db.test:6543/postgres')
})

test('writes one newline-terminated line to stdout by default', () => {
	const written: string[] = []
	const original = process.stdout.write.bind(process.stdout)
	process.stdout.write = ((chunk: string) => {
		written.push(chunk)
		return true
	}) as typeof process.stdout.write

	try {
		createLogger({ threshold: 'info' }).info('to stdout', { source: 'apple' })
	} finally {
		process.stdout.write = original
	}

	assert.equal(written.length, 1)
	assert.equal(written[0]?.endsWith('\n'), true)
	assert.equal(JSON.parse(String(written[0])).source, 'apple')
})

test('resolves the threshold from LOG_LEVEL, defaulting to info', () => {
	assert.equal(resolveThreshold({}), 'info')
	assert.equal(resolveThreshold({ LOG_LEVEL: 'debug' }), 'debug')
	assert.equal(resolveThreshold({ LOG_LEVEL: ' WARN ' }), 'warn')
	assert.equal(resolveThreshold({ LOG_LEVEL: 'chatty' }), 'info')
	assert.equal(resolveThreshold({ LOG_LEVEL: 'toString' }), 'info')
})

test('is silent under NODE_ENV=test unless LOG_LEVEL says otherwise', () => {
	assert.equal(resolveThreshold({ NODE_ENV: 'test' }), 'silent')
	assert.equal(resolveThreshold({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }), 'debug')
	assert.equal(resolveThreshold({ NODE_ENV: 'production' }), 'info')
})

test('scrubs messages and nested errors before Pino writes them', () => {
	const { log, lines, last } = capture()
	log.child({ apiKey: 'child-secret' }).error('Rejected Bearer message-secret', {
		err: new Error('https://vendor.test/?api_key=error-secret', {
			cause: new Error('postgresql://user:cause-secret@db.test/app')
		})
	})
	const output = JSON.stringify(lines)
	for (const secret of ['child-secret', 'message-secret', 'error-secret', 'cause-secret']) {
		assert.equal(output.includes(secret), false)
	}
	assert.equal(last()?.message, 'Rejected Bearer [redacted]')
})

test('serialization failure emits a fixed safe message without the original payload', () => {
	const { log, last } = capture()
	const fields = Object.defineProperty({}, 'broken', {
		enumerable: true,
		get() {
			throw new Error('sensitive getter failure')
		}
	})
	assert.doesNotThrow(() => log.error('Bearer original-secret', fields))
	assert.equal(last()?.message, 'Log entry could not be serialized')
	assert.equal(last()?.broken, undefined)
})

test('a failed sink never throws or retries the entry', () => {
	let writes = 0
	const log = createLogger({
		threshold: 'debug',
		write: () => {
			writes++
			throw new Error('sink unavailable')
		}
	})
	assert.doesNotThrow(() => log.info('entry'))
	assert.equal(writes, 1)
})
