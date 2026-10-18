import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

// How the page sends a take's audio for its transcript: inline up to
// MAX_INLINE_AUDIO_BYTES, otherwise uploaded straight to Supabase Storage
// (never through a Vercel Function) and sent as its path. The two Server
// Actions are swapped for ones that record what they're given; fetch is the
// upload.

type Calls = { started: unknown[]; transcribed: unknown[] }
const calls: Calls = { started: [], transcribed: [] }
let startResult: unknown = {
	ok: true,
	data: {
		path: 'u1/take.wav',
		url: 'https://ref.supabase.co/storage/v1/object/upload/sign/take-audio/u1/take.wav?token=t'
	}
}
mock.module(import.meta.resolve('../actions'), {
	namedExports: {
		startTakeUpload: async (input: unknown) => {
			calls.started.push(input)
			return startResult
		},
		transcribeTake: async (input: unknown) => {
			calls.transcribed.push(input)
			return { ok: true, data: { segments: [], words: [] } }
		}
	}
})

/** The upload requests the page made, and how Storage answers. */
const uploads: Request[] = []
let uploadStatus = 200
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	uploads.push(new Request(input, init))
	return new Response(null, { status: uploadStatus })
}) as typeof fetch
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'

const { MAX_INLINE_AUDIO_BYTES } = await import('./take-audio')
const { transcribeTakeAudio } = await import('./send-take-audio')

function reset() {
	calls.started.length = 0
	calls.transcribed.length = 0
	uploads.length = 0
	uploadStatus = 200
}

test('a take up to the inline limit goes inline, as base64, with no upload', async () => {
	reset()
	const wav = new Uint8Array(MAX_INLINE_AUDIO_BYTES).fill(7).buffer
	await transcribeTakeAudio(wav)
	assert.deepEqual(calls.started, [])
	assert.equal(uploads.length, 0)
	assert.equal(calls.transcribed.length, 1)
	const [sent] = calls.transcribed as Array<{ audioBase64: string }>
	assert.equal(Buffer.from(sent?.audioBase64 ?? '', 'base64').length, MAX_INLINE_AUDIO_BYTES)
})

test('a longer take is uploaded to the signed URL as Supabase’s client would, then sent as its path', async () => {
	reset()
	const wav = new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1).fill(9).buffer
	await transcribeTakeAudio(wav)
	assert.deepEqual(calls.started, [{ bytes: MAX_INLINE_AUDIO_BYTES + 1 }])
	assert.equal(uploads.length, 1)
	const [upload] = uploads
	assert.ok(upload)
	assert.equal(upload.method, 'PUT')
	assert.equal(
		upload.url,
		'https://ref.supabase.co/storage/v1/object/upload/sign/take-audio/u1/take.wav?token=t'
	)
	assert.equal(upload.headers.get('x-upsert'), 'false')
	assert.equal(upload.headers.get('apikey'), 'sb_publishable_test')
	const form = await upload.formData()
	assert.equal(form.get('cacheControl'), '3600')
	const file = form.get('')
	assert.ok(file instanceof Blob)
	assert.equal(file.type, 'audio/wav')
	assert.equal(file.size, MAX_INLINE_AUDIO_BYTES + 1)
	assert.deepEqual(calls.transcribed, [{ audioPath: 'u1/take.wav' }])
})

test('a failed upload stops there: no transcript is asked for', async () => {
	reset()
	uploadStatus = 413
	const wav = new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1).buffer
	await assert.rejects(transcribeTakeAudio(wav), /upload failed \(413\)/)
	assert.deepEqual(calls.transcribed, [])
})

test('a refused upload URL (signed out, say) is reported as the action’s own failure', async () => {
	reset()
	startResult = { ok: false, error: 'Sign in to use this.', status: 401 }
	const wav = new Uint8Array(MAX_INLINE_AUDIO_BYTES + 1).buffer
	await assert.rejects(transcribeTakeAudio(wav), { message: 'Sign in to use this.', status: 401 })
	assert.equal(uploads.length, 0)
	assert.deepEqual(calls.transcribed, [])
})
