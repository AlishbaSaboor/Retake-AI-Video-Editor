import type { Loudness } from './take-audio'

// Flags for audio that may be hard to listen to, found in the audio itself
// (no API call): clipping, speech much quieter than the rest of the
// recording, and a background loud enough to compete with the speech. They
// say what was measured and where; they change nothing. Every threshold was
// set from real recordings, so that clean ones raise no flags at all:
// PROGRESS_NOTES.md section 3i has the measurements.

export const AUDIO_ISSUE_KINDS = ['clipping', 'quiet', 'noise'] as const
export type AudioIssueKind = (typeof AUDIO_ISSUE_KINDS)[number]
export type AudioIssue = { kind: AudioIssueKind; startSeconds: number; endSeconds: number }

// --- Clipping: measured on the decoded audio at full quality, channel by
// channel. Mixing to mono or resampling would smear the peaks it looks for.
const CLIP_WINDOW_SECONDS = 0.05
/** A sample this close to full scale counts as at the ceiling. */
const CLIP_LEVEL = 0.9
/**
 * A window is clipped when this share of a channel's samples is at the
 * ceiling. Clean speech never reached 1.0% in any window of eight real
 * recordings; Cap.mp4 pushed 6 dB into clipping reached 10%, and AAC or
 * Opus encoding moved these shares by under 3%.
 */
const CLIP_SHARE = 0.02
/** Clipped windows closer than this are one stretch: one flag for a clipped sentence, not one per syllable. */
const CLIP_JOIN_SECONDS = 1

// --- Quiet speech and loud background: on the 10 ms loudness the editor
// already measures (take-audio.ts), mono at 16 kHz. Speech is what's above
// the recording's own gap threshold.
/** Speech level is judged over windows this long, a step apart. */
const LEVEL_WINDOW_SECONDS = 2
const LEVEL_STEP_SECONDS = 0.5
/** A level window counts as speech when at least this share of it is above the gap threshold. */
const MIN_SPEECH_SHARE = 0.3
/** Below this many speech windows there's no "rest of the recording" to compare with. */
const MIN_SPEECH_WINDOWS = 6
/** A level: the 90th percentile of the speech in it, its louder syllables. */
const LEVEL_PERCENTILE = 0.9
/**
 * Flagged this far below the recording's typical speech level. In eight
 * real recordings the deepest dip of real speech was 12.8 dB (the one
 * deeper window, 25 dB, was a word fading into a pause: MIN_QUIET_SECONDS
 * rules it out); speech turned down 15 to 25 dB for 10 s was found every time.
 */
const QUIET_BELOW_DB = 15
/**
 * The shortest quiet stretch flagged. A single 2 s window can be a word
 * fading into a pause: in one clean recording it was, and raised a false
 * flag. Quiet stretches of ~3 s were found only some of the time, so these
 * flags are for sustained quiet speech.
 */
const MIN_QUIET_SECONDS = 2.5
/** The background is judged over windows this long, a step apart. */
const NOISE_WINDOW_SECONDS = 10
const NOISE_STEP_SECONDS = 1
/** Background is the 10th percentile of a window's loudness, speech the 90th. */
const BACKGROUND_PERCENTILE = 0.1
/**
 * Flagged when speech stands less than this far above the background. The
 * clean real recordings measured at least 22.7 dB; speech with noise mixed
 * in 10 dB under it measures ~10.
 */
const NOISE_SPREAD_DB = 15
/** A window counts only if it has speech in it: its loud end within this of the recording's speech. */
const SPEECH_PRESENT_DB = 10
/**
 * A 10 s window that's 80% noise still reads as noisy, so a stretch's edges
 * are walked in a second at a time while that second's background is this
 * much quieter than the stretch's own: clean speech beside the noise.
 */
const EDGE_STEP_SECONDS = 1
const EDGE_QUIETER_DB = 6

type Span = { startSeconds: number; endSeconds: number }

/** Joins spans (in time order) closer than `gapSeconds` into one. */
function joinSpans(spans: Span[], gapSeconds: number): Span[] {
	const joined: Span[] = []
	for (const span of spans) {
		const last = joined.at(-1)
		if (last && span.startSeconds - last.endSeconds < gapSeconds) {
			last.endSeconds = Math.max(last.endSeconds, span.endSeconds)
		} else joined.push({ ...span })
	}
	return joined
}

function percentile(values: ArrayLike<number>, fraction: number): number {
	const sorted = Float32Array.from(values).sort()
	return sorted[Math.floor(fraction * (sorted.length - 1))] ?? 0
}

/** Stretches where a channel's samples pile up at full scale. */
export function detectClipping(channels: Float32Array[], sampleRate: number): Span[] {
	const window = Math.max(1, Math.round(sampleRate * CLIP_WINDOW_SECONDS))
	const frames = Math.max(0, ...channels.map((c) => c.length))
	const clipped: Span[] = []
	for (let start = 0; start < frames; start += window) {
		const end = Math.min(start + window, frames)
		const isClipped = channels.some((samples) => {
			let atCeiling = 0
			for (let i = start; i < end; i++) {
				if (Math.abs(samples[i] ?? 0) >= CLIP_LEVEL) atCeiling++
			}
			return atCeiling >= CLIP_SHARE * (end - start)
		})
		if (isClipped) clipped.push({ startSeconds: start / sampleRate, endSeconds: end / sampleRate })
	}
	return joinSpans(clipped, CLIP_JOIN_SECONDS)
}

/**
 * Every LEVEL_WINDOW_SECONDS window with speech in it, and its speech level;
 * and the recording's typical level, the median of those.
 */
export function speechLevels(loudness: Loudness) {
	const { db, windowSeconds, gapThresholdDb } = loudness
	const size = Math.round(LEVEL_WINDOW_SECONDS / windowSeconds)
	const step = Math.round(LEVEL_STEP_SECONDS / windowSeconds)
	const windows: Array<Span & { levelDb: number }> = []
	for (let from = 0; from + size <= db.length; from += step) {
		const speech = Array.from(db.subarray(from, from + size)).filter((d) => d > gapThresholdDb)
		if (speech.length < MIN_SPEECH_SHARE * size) continue
		windows.push({
			startSeconds: from * windowSeconds,
			endSeconds: (from + size) * windowSeconds,
			levelDb: percentile(speech, LEVEL_PERCENTILE)
		})
	}
	const typicalDb = percentile(
		windows.map((w) => w.levelDb),
		0.5
	)
	return { windows, typicalDb }
}

/** Speech far quieter than the recording's typical speech. */
export function detectQuietSpeech(loudness: Loudness): Span[] {
	const { windows, typicalDb } = speechLevels(loudness)
	if (windows.length < MIN_SPEECH_WINDOWS) return []
	return joinSpans(
		windows
			.filter((w) => w.levelDb <= typicalDb - QUIET_BELOW_DB)
			.map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds })),
		0
	).filter((span) => span.endSeconds - span.startSeconds >= MIN_QUIET_SECONDS)
}

/** Stretches where speech stands too little above the background. */
export function detectNoise(loudness: Loudness): Span[] {
	const { db, windowSeconds } = loudness
	const speechDb = percentile(db, LEVEL_PERCENTILE)
	const size = Math.round(NOISE_WINDOW_SECONDS / windowSeconds)
	const step = Math.round(NOISE_STEP_SECONDS / windowSeconds)
	const noisy: Span[] = []
	// A recording shorter than one window is judged whole.
	for (let from = 0; from === 0 || from + size <= db.length; from += step) {
		const slice = db.subarray(from, Math.min(db.length, from + size))
		if (slice.length === 0) break
		const loud = percentile(slice, LEVEL_PERCENTILE)
		const background = percentile(slice, BACKGROUND_PERCENTILE)
		if (loud >= speechDb - SPEECH_PRESENT_DB && loud - background < NOISE_SPREAD_DB) {
			noisy.push({
				startSeconds: from * windowSeconds,
				endSeconds: (from + slice.length) * windowSeconds
			})
		}
	}
	return joinSpans(noisy, 0).map((span) => trimToNoise(span, loudness))
}

/** `span` with its edges moved in past seconds whose background is clearly quieter than its own. */
function trimToNoise(span: Span, { db, windowSeconds }: Loudness): Span {
	const index = (seconds: number) => Math.round(seconds / windowSeconds)
	const backgroundOf = (from: number, to: number) =>
		percentile(db.subarray(index(from), index(to)), BACKGROUND_PERCENTILE)
	const background = backgroundOf(span.startSeconds, span.endSeconds)
	const isClean = (from: number) =>
		backgroundOf(from, from + EDGE_STEP_SECONDS) < background - EDGE_QUIETER_DB
	let { startSeconds, endSeconds } = span
	while (endSeconds - startSeconds > EDGE_STEP_SECONDS && isClean(startSeconds)) {
		startSeconds += EDGE_STEP_SECONDS
	}
	while (endSeconds - startSeconds > EDGE_STEP_SECONDS && isClean(endSeconds - EDGE_STEP_SECONDS)) {
		endSeconds -= EDGE_STEP_SECONDS
	}
	return { startSeconds, endSeconds }
}

/** All three, in time order. */
export function detectAudioIssues(
	channels: Float32Array[],
	sampleRate: number,
	loudness: Loudness
): AudioIssue[] {
	const tag = (kind: AudioIssueKind) => (span: Span) => ({ kind, ...span })
	return [
		...detectClipping(channels, sampleRate).map(tag('clipping')),
		...detectQuietSpeech(loudness).map(tag('quiet')),
		...detectNoise(loudness).map(tag('noise'))
	].sort((a, b) => a.startSeconds - b.startSeconds)
}
