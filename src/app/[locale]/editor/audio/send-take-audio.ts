import { ActionFailure } from '@/lib/ai-failure'
import { startTakeUpload, transcribeTake } from '../actions'
import { MAX_INLINE_AUDIO_BYTES, toBase64 } from './take-audio'

/** How long the browser keeps an uploaded take in its cache: it's read once and deleted. */
const UPLOAD_CACHE_CONTROL = '3600'

/**
 * Uploads a long take's WAV to the signed URL startTakeUpload gave, the way
 * Supabase's own client sends a Blob (uploadToSignedUrl: a multipart body), so the request goes
 * straight to Supabase Storage and never through a Vercel Function.
 */
async function uploadTakeAudio(wav: ArrayBuffer): Promise<string> {
	const upload = await startTakeUpload({ bytes: wav.byteLength })
	if (!upload.ok) throw new ActionFailure(upload.error, upload.status)
	const body = new FormData()
	body.append('cacheControl', UPLOAD_CACHE_CONTROL)
	body.append('', new Blob([wav], { type: 'audio/wav' }))
	// The public project key, as Supabase's client sends with every request;
	// the signed URL's own token is what authorises the upload.
	const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
	const response = await fetch(upload.data.url, {
		method: 'PUT',
		body,
		headers: { 'x-upsert': 'false', ...(apiKey && { apikey: apiKey }) }
	})
	if (!response.ok) throw new Error(`The take's audio upload failed (${response.status})`)
	return upload.data.path
}

/**
 * A take's transcript, from its 16 kHz mono WAV. Short takes go inline in the
 * action's request; a longer one (over MAX_INLINE_TRANSCRIBE_SECONDS) would
 * be over Vercel's 4.5 MB request limit, so it's uploaded to Supabase Storage
 * first and the action is given its path.
 */
export async function transcribeTakeAudio(wav: ArrayBuffer) {
	const input =
		wav.byteLength <= MAX_INLINE_AUDIO_BYTES
			? { audioBase64: toBase64(wav) }
			: { audioPath: await uploadTakeAudio(wav) }
	const result = await transcribeTake(input)
	if (!result.ok) throw new ActionFailure(result.error, result.status)
	return result.data
}
