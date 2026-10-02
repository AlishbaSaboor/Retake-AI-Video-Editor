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

/**
 * Request size the transcript action must be allowed: the longest audio
 * plus headroom for the action's own encoding. next.config.ts applies it to
 * BOTH limits a request to /editor passes through — the Server Action body
 * limit and the proxy's body buffer. The proxy one is easy to miss: it
 * silently keeps only the first 10 MB by default, so a take over ~4 minutes
 * arrived cut off mid-string and failed as an unterminated-JSON error.
 */
export const TRANSCRIBE_REQUEST_LIMIT_BYTES = MAX_AUDIO_BASE64_LENGTH + 1024 * 1024

export type Silence = { startSeconds: number; endSeconds: number }

// Loudness is measured over 50 ms windows; anything under -40 dBFS counts as
// silent. Room tone typically sits at -50 to -60 dBFS and speech at -30 to
// -10, so -40 separates them without tuning per recording.
const WINDOW_SECONDS = 0.05
export const SILENCE_THRESHOLD_DB = -40
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

/** Loudness over time, for finding the gaps around filler words. */
export type Loudness = {
	/** dBFS per window, floored at FLOOR_DB (digital silence). */
	db: Float32Array
	windowSeconds: number
	/** Below this a window counts as a gap — see gapThresholdDb. */
	gapThresholdDb: number
}

const LOUDNESS_WINDOW_SECONDS = 0.01
const FLOOR_DB = -120
// A gap is quieter than the recording's noise floor plus GAP_ABOVE_FLOOR_DB,
// and always at least GAP_BELOW_SPEECH_DB under typical speech. Relative to
// the recording rather than fixed, because a laptop mic in a room and a
// clean studio file have floors 50 dB apart.
const GAP_ABOVE_FLOOR_DB = 10
const GAP_BELOW_SPEECH_DB = 15
const FLOOR_PERCENTILE = 0.1
const SPEECH_PERCENTILE = 0.9

/** Loudness in 10 ms windows, with a gap threshold fitted to this recording. */
export function measureLoudness(samples: Float32Array, sampleRate: number): Loudness {
	const windowSize = Math.max(1, Math.round(sampleRate * LOUDNESS_WINDOW_SECONDS))
	const db = new Float32Array(Math.ceil(samples.length / windowSize))
	for (let w = 0; w < db.length; w++) {
		const start = w * windowSize
		const end = Math.min(start + windowSize, samples.length)
		let sumOfSquares = 0
		for (let i = start; i < end; i++) sumOfSquares += (samples[i] ?? 0) ** 2
		const rms = Math.sqrt(sumOfSquares / Math.max(1, end - start))
		db[w] = rms > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(rms)) : FLOOR_DB
	}
	return { db, windowSeconds: windowSize / sampleRate, gapThresholdDb: gapThresholdDb(db) }
}

function gapThresholdDb(db: Float32Array): number {
	if (db.length === 0) return FLOOR_DB
	const sorted = Float32Array.from(db).sort()
	const at = (fraction: number) => sorted[Math.floor(fraction * (sorted.length - 1))] ?? FLOOR_DB
	return Math.min(
		at(FLOOR_PERCENTILE) + GAP_ABOVE_FLOOR_DB,
		at(SPEECH_PERCENTILE) - GAP_BELOW_SPEECH_DB
	)
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
 * Decodes a file's audio track at full quality. Null when there's no audio
 * to decode — no audio track, or a codec this browser can't decode — which
 * is an expected outcome, not an error. Browser-only.
 */
export async function decodeAudio(file: Blob): Promise<AudioBuffer | null> {
	const context = new AudioContext()
	try {
		return await context.decodeAudioData(await file.arrayBuffer())
	} catch {
		return null
	} finally {
		void context.close()
	}
}

/**
 * Decodes a video file's audio track to mono samples at ANALYSIS_SAMPLE_RATE,
 * or null when it has none (see decodeAudio). Browser-only.
 */
export async function decodeTakeAudio(file: File): Promise<Float32Array | null> {
	const decoded = await decodeAudio(file)
	return decoded && analysisSamples(decoded)
}

/** Mixes decoded audio to mono at ANALYSIS_SAMPLE_RATE, for measuring. Browser-only. */
export async function analysisSamples(decoded: AudioBuffer): Promise<Float32Array> {
	const frames = Math.max(1, Math.ceil(decoded.duration * ANALYSIS_SAMPLE_RATE))
	const offline = new OfflineAudioContext(1, frames, ANALYSIS_SAMPLE_RATE)
	const source = offline.createBufferSource()
	source.buffer = decoded
	source.connect(offline.destination)
	source.start()
	return (await offline.startRendering()).getChannelData(0)
}
