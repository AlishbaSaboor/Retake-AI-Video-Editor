// A take's audio, analysed in the browser: decoded once on upload, mixed to
// mono at a speech-friendly rate, scanned for silences, and packaged as WAV
// for the transcript. Silences come from the audio itself rather than the
// transcript: model-written timestamps drift by a second or more, measured
// loudness doesn't.

/** 16 kHz mono — what speech models sample at anyway, and 4× smaller than 44.1 kHz stereo. */
export const ANALYSIS_SAMPLE_RATE = 16_000

/**
 * Longest take sent for transcription. Gemini takes at most ~20 MB inline
 * per request; 5 minutes of 16 kHz 16-bit WAV is ~9.6 MB (~12.8 MB as
 * base64). next.config.ts's serverActions.bodySizeLimit is sized to match.
 */
export const MAX_TRANSCRIBE_SECONDS = 300

const WAV_HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

/** Upper bound on a transcript request's base64 audio, for input validation. */
export const MAX_AUDIO_BASE64_LENGTH =
	4 *
	Math.ceil(
		(WAV_HEADER_BYTES + MAX_TRANSCRIBE_SECONDS * ANALYSIS_SAMPLE_RATE * BYTES_PER_SAMPLE) / 3
	)

export type Silence = { startSeconds: number; endSeconds: number }

// Loudness is measured over 50 ms windows; anything under -40 dBFS counts as
// silent. Room tone typically sits at -50 to -60 dBFS and speech at -30 to
// -10, so -40 separates them without tuning per recording.
const WINDOW_SECONDS = 0.05
const SILENCE_THRESHOLD_DB = -40
const SILENCE_THRESHOLD_RMS = 10 ** (SILENCE_THRESHOLD_DB / 20)

/**
 * Shortest quiet stretch worth flagging: genuinely dead air, not the natural
 * pauses of someone thinking mid-take, which routinely run a few seconds.
 */
export const MIN_SILENCE_SECONDS = 7

/** Every stretch of at least MIN_SILENCE_SECONDS quieter than the threshold. */
export function detectSilences(samples: Float32Array, sampleRate: number): Silence[] {
	const windowSize = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS))
	const silences: Silence[] = []
	let quietSince: number | null = null

	const close = (endSeconds: number) => {
		if (quietSince !== null && endSeconds - quietSince >= MIN_SILENCE_SECONDS) {
			silences.push({ startSeconds: quietSince, endSeconds })
		}
		quietSince = null
	}

	for (let offset = 0; offset < samples.length; offset += windowSize) {
		const end = Math.min(offset + windowSize, samples.length)
		let sumOfSquares = 0
		for (let i = offset; i < end; i++) sumOfSquares += (samples[i] ?? 0) ** 2
		const isQuiet = Math.sqrt(sumOfSquares / (end - offset)) < SILENCE_THRESHOLD_RMS
		const atSeconds = offset / sampleRate
		if (isQuiet && quietSince === null) quietSince = atSeconds
		if (!isQuiet) close(atSeconds)
	}
	close(samples.length / sampleRate)
	return silences
}

/** Mono 16-bit PCM WAV, the plainest audio format Gemini accepts. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
	const dataBytes = samples.length * BYTES_PER_SAMPLE
	const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes))
	const writeText = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
	}
	writeText(0, 'RIFF')
	view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
	writeText(8, 'WAVE')
	writeText(12, 'fmt ')
	view.setUint32(16, 16, true) // fmt chunk size
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true) // byte rate
	view.setUint16(32, BYTES_PER_SAMPLE, true) // block align
	view.setUint16(34, BYTES_PER_SAMPLE * 8, true) // bits per sample
	writeText(36, 'data')
	view.setUint32(40, dataBytes, true)
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0))
		view.setInt16(WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE, clamped * 0x7fff, true)
	}
	return view.buffer
}

// btoa takes a binary string; building it in chunks keeps
// String.fromCharCode under the engine's argument limit.
const BASE64_CHUNK_BYTES = 0x8000

export function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.length; i += BASE64_CHUNK_BYTES) {
		binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_BYTES))
	}
	return btoa(binary)
}

/**
 * Decodes a video file's audio track to mono samples at ANALYSIS_SAMPLE_RATE.
 * Null when there's no audio to analyse — no audio track, or a codec this
 * browser can't decode — which is an expected outcome, not an error.
 * Browser-only.
 */
export async function decodeTakeAudio(file: File): Promise<Float32Array | null> {
	const context = new AudioContext()
	let decoded: AudioBuffer
	try {
		decoded = await context.decodeAudioData(await file.arrayBuffer())
	} catch {
		return null
	} finally {
		void context.close()
	}
	const frames = Math.max(1, Math.ceil(decoded.duration * ANALYSIS_SAMPLE_RATE))
	const offline = new OfflineAudioContext(1, frames, ANALYSIS_SAMPLE_RATE)
	const source = offline.createBufferSource()
	source.buffer = decoded
	source.connect(offline.destination)
	source.start()
	return (await offline.startRendering()).getChannelData(0)
}
