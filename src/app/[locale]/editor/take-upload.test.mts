import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError } from '@/lib/errors/normalize-error'

// A long take's transcript, as the server runs it: the real startTakeUpload
// and transcribeTake actions, the real storage module
// (src/server/storage/take-audio.ts) driving the real Supabase client, and
// the real Deepgram wrapper. Faked: Supabase Storage's and Deepgram's HTTP
// APIs (a stand-in fetch; anything else is refused), the session, the
// allowance (counted below), Sentry, the usage sink and Next's runtime.

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SUPABASE = 'http://supabase.test'
const STORAGE = `${SUPABASE}/storage/v1`

/** The secret key Storage is reached with; set per test to see what happens without it. */
let secretKey: string | undefined = 'sb_secret_test'
mock.module('next/navigation', { namedExports: { unstable_rethrow: () => {} } })
mock.module(import.meta.resolve('@/lib/supabase/server'), {
	namedExports: {
		createServerSupabaseClient: async () => ({
			auth: { getUser: async () => ({ data: { user: { id: USER, email: 'a@b.c' } }, error: null }) }
		})
	}
})
mock.module(import.meta.resolve('@/lib/env'), {
	namedExports: {
		env: {
			DEEPGRAM_API_KEY: 'test-key',
			NEXT_PUBLIC_SUPABASE_URL: SUPABASE,
			get SUPABASE_SECRET_KEY() {
				return secretKey
			}
		}
	}
})
mock.module(import.meta.resolve('@/lib/observability/capture-error'), {
	namedExports: { captureError: (error: unknown) => normalizeError(error) }
})
mock.module(import.meta.resolve('@/server/lib/ai-usage/sink'), {
	namedExports: { trackAiCall: (_context: unknown, call: () => Promise<unknown>) => call() }
})
mock.module(import.meta.resolve('@/server/lib/logger'), {
	namedExports: { log: { warn: () => {}, info: () => {}, error: () => {} } }
})
/** The transcript allowance: taken and given back, as counts. */
const allowance = { taken: 0, givenBack: 0 }
mock.module(import.meta.resolve('@/server/lib/ai-allowance'), {
	namedExports: {
		takeAllowance: async () => {
			allowance.taken++
			return new Date('2026-10-18T00:00:00Z')
		},
		giveBackAllowance: async () => {
			allowance.givenBack++
		},
		allowanceUsedUp: () => new Error('used up')
	}
})
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'

/** Every request made, by method and URL (without the query). */
const requests: string[] = []
/** The files in the fake bucket, by path; whether the bucket exists yet. */
const files = new Map<string, Uint8Array>()
let bucketExists = false
/** What the bucket was created with. */
let bucketCreatedWith: Record<string, unknown> | undefined
/** The audio Deepgram was sent, and how it answers. */
const toDeepgram: Uint8Array[] = []
let deepgramStatus = 200

const notFound = () =>
	Response.json(
		{ statusCode: '404', error: 'not_found', message: 'Object not found' },
		{ status: 400 }
	)

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const request = new Request(input, init)
	const url = new URL(request.url)
	requests.push(`${request.method} ${url.origin}${url.pathname}`)
	if (url.origin === 'https://api.deepgram.com') {
		toDeepgram.push(new Uint8Array(await request.arrayBuffer()))
		if (deepgramStatus !== 200) return new Response(null, { status: deepgramStatus })
		return Response.json({
			metadata: { request_id: 'dg-1', duration: 90 },
			results: {
				channels: [
					{
						alternatives: [{ words: [{ word: 'hi', punctuated_word: 'Hi.', start: 0, end: 0.4 }] }]
					}
				]
			}
		})
	}
	const path = url.pathname.slice(new URL(STORAGE).pathname.length)
	if (request.method === 'GET' && path === '/bucket/take-audio') {
		return bucketExists
			? Response.json({ id: 'take-audio', name: 'take-audio', public: false })
			: Response.json(
					{ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' },
					{ status: 400 }
				)
	}
	if (request.method === 'POST' && path === '/bucket') {
		bucketCreatedWith = (await request.json()) as Record<string, unknown>
		bucketExists = true
		return Response.json({ name: 'take-audio' })
	}
	const sign = /^\/object\/upload\/sign\/take-audio\/(.+)$/.exec(path)
	if (request.method === 'POST' && sign) {
		return Response.json({ url: `/object/upload/sign/take-audio/${sign[1]}?token=t` })
	}
	const object = /^\/object\/take-audio\/(.+)$/.exec(path)
	if (request.method === 'GET' && object) {
		const file = files.get(decodeURIComponent(object[1] ?? ''))
		return file ? new Response(file) : notFound()
	}
	if (request.method === 'DELETE' && path === '/object/take-audio') {
		const { prefixes } = (await request.json()) as { prefixes: string[] }
		for (const prefix of prefixes) files.delete(prefix)
		return Response.json([])
	}
	throw new Error(`No real network in this test: ${request.method} ${request.url}`)
}) as typeof fetch

const { MAX_AUDIO_BYTES } = await import('./audio/take-audio')
const editor = await import('./actions')

function reset() {
	requests.length = 0
	toDeepgram.length = 0
	allowance.taken = 0
	allowance.givenBack = 0
	deepgramStatus = 200
	secretKey = 'sb_secret_test'
}

/** A long take's WAV as the browser would have uploaded it to `path`. */
function uploaded(path: string): Uint8Array {
	const audio = new Uint8Array(4096).map((_, i) => i % 251)
	files.set(path, audio)
	return audio
}

test('startTakeUpload: makes the private bucket once, then a one-time upload URL in the user’s own folder', async () => {
	reset()
	const first = await editor.startTakeUpload({ bytes: 3_000_000 })
	assert.equal(first.ok, true)
	assert.ok(first.ok)
	assert.match(first.data.path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.wav$`))
	assert.equal(
		first.data.url,
		`${STORAGE}/object/upload/sign/take-audio/${first.data.path}?token=t`
	)
	assert.deepEqual(bucketCreatedWith, {
		id: 'take-audio',
		name: 'take-audio',
		public: false,
		file_size_limit: MAX_AUDIO_BYTES,
		allowed_mime_types: ['audio/wav']
	})
	// Taken by transcribeTake, never here.
	assert.equal(allowance.taken, 0)

	requests.length = 0
	const second = await editor.startTakeUpload({ bytes: 3_000_000 })
	assert.equal(second.ok, true)
	assert.deepEqual(
		requests.map((request) => request.split(' ')[0]),
		['POST'],
		'the bucket is checked once per server, not per upload'
	)
})

test('startTakeUpload refuses audio over five minutes before asking Storage', async () => {
	reset()
	const result = await editor.startTakeUpload({ bytes: MAX_AUDIO_BYTES + 1 })
	assert.deepEqual(result, { ok: false, error: 'Invalid request', status: 400 })
	assert.deepEqual(requests, [])
})

test('transcribeTake with an uploaded path: reads the user’s own file, sends it to Deepgram, deletes it', async () => {
	reset()
	const path = `${USER}/33333333-3333-4333-8333-333333333333.wav`
	const audio = uploaded(path)
	const result = await editor.transcribeTake({ audioPath: path })
	assert.equal(result.ok, true)
	assert.deepEqual(result.ok && result.data.words, [
		{ text: 'Hi.', startSeconds: 0, endSeconds: 0.4 }
	])
	assert.deepEqual(toDeepgram, [audio])
	assert.equal(files.has(path), false, 'deleted once used')
	assert.deepEqual(allowance, { taken: 1, givenBack: 0 })
})

test('transcribeTake refuses another user’s upload: nothing read, nothing sent, the allowance given back', async () => {
	reset()
	const path = `${OTHER}/44444444-4444-4444-8444-444444444444.wav`
	uploaded(path)
	const result = await editor.transcribeTake({ audioPath: path })
	assert.deepEqual(result, { ok: false, error: 'That audio upload isn’t yours.', status: 403 })
	assert.deepEqual(requests, [])
	assert.equal(files.has(path), true, 'never touched')
	assert.deepEqual(allowance, { taken: 1, givenBack: 1 })
})

test('transcribeTake when the upload never arrived: a plain message, no Deepgram call, the allowance given back', async () => {
	reset()
	const result = await editor.transcribeTake({
		audioPath: `${USER}/55555555-5555-4555-8555-555555555555.wav`
	})
	assert.deepEqual(result, {
		ok: false,
		error: 'The audio didn’t finish uploading. Try again.',
		status: 409
	})
	assert.deepEqual(toDeepgram, [])
	assert.deepEqual(allowance, { taken: 1, givenBack: 1 })
})

test('transcribeTake when Deepgram is busy: the uploaded file is still deleted', async () => {
	reset()
	deepgramStatus = 503
	const path = `${USER}/66666666-6666-4666-8666-666666666666.wav`
	uploaded(path)
	const result = await editor.transcribeTake({ audioPath: path })
	assert.equal(result.ok, false)
	assert.equal(files.has(path), false)
	assert.deepEqual(allowance, { taken: 1, givenBack: 1 })
})

test('without the secret key, a long take is refused plainly and the allowance given back', async () => {
	reset()
	secretKey = undefined
	const path = `${USER}/77777777-7777-4777-8777-777777777777.wav`
	uploaded(path)
	const result = await editor.transcribeTake({ audioPath: path })
	assert.deepEqual(result, {
		ok: false,
		error: "The AI isn't available right now. Try again later.",
		status: 503
	})
	assert.deepEqual(requests, [])
	assert.deepEqual(allowance, { taken: 1, givenBack: 1 })
})

test('a short take still goes inline: no Storage call at all', async () => {
	reset()
	const audio = Buffer.from('RIFF-short-take')
	const result = await editor.transcribeTake({ audioBase64: audio.toString('base64') })
	assert.equal(result.ok, true)
	assert.deepEqual(toDeepgram, [new Uint8Array(audio)])
	assert.ok(requests.every((request) => request.includes('api.deepgram.com')))
})
