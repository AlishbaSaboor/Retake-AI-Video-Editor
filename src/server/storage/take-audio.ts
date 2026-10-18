import 'server-only'
import { randomUUID } from 'node:crypto'
import { AppError } from '@/lib/errors/app-error'
import { env } from '@/lib/env'
import {
	createStorageOnlyClient,
	type StorageOnlySupabaseClient
} from '@/lib/supabase/storage-only'
import { ProviderNotCalledError } from '@/server/ai/not-charged'
import { AI_UNAVAILABLE } from '@/server/lib/ai-busy'
import { log } from '@/server/lib/logger'

// A long take's audio on its way to Deepgram. A request to a Vercel Function
// carries at most 4.5 MB, and five minutes of the transcript's WAV is about
// 9.6 MB, so a long take's audio doesn't come through the Server Action:
// the browser uploads it to this private bucket with a one-time signed URL,
// then the transcript action reads it here, sends it to Deepgram and
// deletes it. Short takes still go inline (take-audio.ts in the editor).

const BUCKET = 'take-audio'
/** `<user id>/<upload id>.wav`: the first part is whose it is. */
const TAKE_PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.wav$/

/** Storage, or a plain refusal when the server isn't set up for it (the log names the setting). */
function storage(): StorageOnlySupabaseClient['storage'] {
	const url = env.NEXT_PUBLIC_SUPABASE_URL
	const secretKey = env.SUPABASE_SECRET_KEY
	if (!url || !secretKey) {
		log.warn('Take audio storage is not set up', { setting: 'SUPABASE_SECRET_KEY' })
		throw new AppError(AI_UNAVAILABLE, {
			status: 503,
			cause: new ProviderNotCalledError('take audio storage is not set up')
		})
	}
	return createStorageOnlyClient(url, secretKey).storage
}

let bucketReady: Promise<void> | null = null

/**
 * Makes the private bucket the first time it's needed, so a new Supabase
 * project needs no setup step; once per server instance.
 */
function ensureBucket(client: StorageOnlySupabaseClient['storage'], maxBytes: number) {
	bucketReady ??= (async () => {
		if (!(await client.getBucket(BUCKET)).error) return
		const { error } = await client.createBucket(BUCKET, {
			public: false,
			fileSizeLimit: maxBytes,
			allowedMimeTypes: ['audio/wav']
		})
		if (error && !/already exists/i.test(error.message)) throw error
	})().catch((error: unknown) => {
		bucketReady = null
		throw error
	})
	return bucketReady
}

/**
 * Where the browser uploads one take's audio: a signed URL for a new file
 * under the user's own folder, good for one upload. Storage refuses a file
 * over `maxBytes` or that isn't audio/wav.
 */
export async function createTakeUpload(
	userId: string,
	maxBytes: number
): Promise<{ path: string; url: string }> {
	const client = storage()
	await ensureBucket(client, maxBytes)
	const path = `${userId}/${randomUUID()}.wav`
	const { data, error } = await client.from(BUCKET).createSignedUploadUrl(path)
	if (error) throw error
	return { path: data.path, url: data.signedUrl }
}

/**
 * The uploaded audio, only if it's this user's own: a path in anyone else's
 * folder is refused before Storage is asked. Nothing has been sent to
 * Deepgram yet, so a failure here gives the allowance back.
 */
export async function readTakeUpload(userId: string, path: string): Promise<Uint8Array> {
	if (TAKE_PATH.exec(path)?.[1] !== userId) {
		throw new AppError('That audio upload isn’t yours.', {
			status: 403,
			cause: new ProviderNotCalledError('take audio path not owned by the user')
		})
	}
	const { data, error } = await storage().from(BUCKET).download(path)
	if (error || !data) {
		throw new AppError('The audio didn’t finish uploading. Try again.', {
			status: 409,
			cause: new ProviderNotCalledError('take audio could not be read')
		})
	}
	return new Uint8Array(await data.arrayBuffer())
}

/** Deletes the audio once it's been used (or failed). A failure only leaves a file behind: logged, never thrown. */
export async function removeTakeUpload(path: string): Promise<void> {
	try {
		const { error } = await storage().from(BUCKET).remove([path])
		if (error) log.warn('Take audio was not deleted', { reason: error.message })
	} catch (error) {
		log.warn('Take audio was not deleted', {
			reason: error instanceof Error ? error.message : 'unknown'
		})
	}
}
