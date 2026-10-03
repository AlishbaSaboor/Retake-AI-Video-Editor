// A clip's sound: its volume (0 to 200%), mute, and a fade in from silence
// at its start and out to silence at its end, over the clip's own played
// time (its kept pieces laid end to end, cuts skipped). Part of the clip, so
// every change is one undo step, a split shares it between the halves and
// reset clears it. A re-recorded take keeps its own level matching; the
// clip's volume and fades apply on top of it.

export type ClipAudio = {
	/** Linear gain: 1 is as recorded, 2 is 200%. */
	volume: number
	muted: boolean
	fadeInSeconds: number
	fadeOutSeconds: number
}

export const DEFAULT_CLIP_AUDIO: ClipAudio = {
	volume: 1,
	muted: false,
	fadeInSeconds: 0,
	fadeOutSeconds: 0
}

export const MAX_VOLUME = 2
/** A fade with no length named: one second. */
export const DEFAULT_FADE_SECONDS = 1
/** "Louder" and "quieter" multiply or divide every clip's volume by this. */
export const VOLUME_STEP = 1.5

export function isDefaultAudio(audio: ClipAudio | undefined): boolean {
	return (
		audio === undefined ||
		(audio.volume === 1 && !audio.muted && audio.fadeInSeconds === 0 && audio.fadeOutSeconds === 0)
	)
}

export function clampVolume(volume: number): number {
	return Math.min(MAX_VOLUME, Math.max(0, volume))
}

/** A segment's place in its clip, for the clip's volume and fades. */
export type SegmentAudio = ClipAudio & {
	/** How long the whole clip plays for. */
	clipSeconds: number
	/** How far into the clip this segment starts. */
	offsetSeconds: number
}

/**
 * The clip's gain at `seconds` into its played time: its volume (0 when
 * muted), scaled down along the fade in from its start and the fade out to
 * its end. Fades that overlap meet where their lines cross.
 */
export function clipGainAt(audio: SegmentAudio, seconds: number): number {
	if (audio.muted) return 0
	let shape = 1
	if (audio.fadeInSeconds > 0) shape = Math.min(shape, seconds / audio.fadeInSeconds)
	if (audio.fadeOutSeconds > 0) {
		shape = Math.min(shape, (audio.clipSeconds - seconds) / audio.fadeOutSeconds)
	}
	return audio.volume * Math.min(1, Math.max(0, shape))
}

/** The scheduling half of an AudioParam, so the envelope can be set (and tested) without Web Audio. */
type GainSchedule = {
	setValueAtTime: (value: number, at: number) => unknown
	linearRampToValueAtTime: (value: number, at: number) => unknown
}

/**
 * Sets a segment's clip gain on the audio clock from `at`, as it plays from
 * `intoSeconds` into the segment to `segmentSeconds` at `rate`. The envelope
 * is straight lines between its corners (where a fade ends, where the other
 * begins, where two overlapping fades cross), so ramping between them
 * draws it exactly.
 */
export function scheduleClipGain(
	param: GainSchedule,
	audio: SegmentAudio,
	at: number,
	intoSeconds: number,
	segmentSeconds: number,
	rate: number
) {
	const from = audio.offsetSeconds + intoSeconds
	const to = audio.offsetSeconds + segmentSeconds
	const when = (seconds: number) => at + (seconds - from) / rate
	const { fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut, clipSeconds } = audio
	const corners = [fadeIn, clipSeconds - fadeOut]
	// Overlapping fades peak where their lines cross, short of full volume.
	if (fadeIn > 0 && fadeOut > 0 && fadeIn + fadeOut > clipSeconds) {
		corners.push((fadeIn * clipSeconds) / (fadeIn + fadeOut))
	}
	param.setValueAtTime(clipGainAt(audio, from), at)
	for (const corner of corners.filter((c) => c > from && c < to).sort((a, b) => a - b)) {
		param.linearRampToValueAtTime(clipGainAt(audio, corner), when(corner))
	}
	if (to > from) param.linearRampToValueAtTime(clipGainAt(audio, to), when(to))
}
