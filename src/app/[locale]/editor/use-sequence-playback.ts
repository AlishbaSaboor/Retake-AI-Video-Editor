import { useEffect, useRef, type RefObject } from 'react'
import type { ReplacementTake } from './re-record'
import { playbackPosition, type Segment } from './sequence'

// Pressing play this close to the end counts as "at the end" and restarts
// from the beginning, rather than playing a frame and stopping.
const END_TOLERANCE_SECONDS = 0.05
// How far past a segment's end the video may run before the next frame
// catches it — inside this it's the end of the segment, beyond it the user
// has scrubbed somewhere else.
const SEGMENT_END_SLACK_SECONDS = 0.25

/** A re-recorded take playing over the video, and whether the picture is holding for it. */
type VoiceOver = {
	replacement: ReplacementTake
	source: AudioBufferSourceNode
	/** The video's volume before the take muted it. */
	volume: number
	ended: boolean
	holding: boolean
}

/** Starts `replacement` playing from `intoSeconds` into its take, over the video turned down. */
function startVoice(
	audio: AudioContext,
	element: HTMLVideoElement,
	replacement: ReplacementTake,
	intoSeconds: number,
	rate: number
): VoiceOver {
	void audio.resume()
	const level = audio.createGain()
	level.gain.value = replacement.gain
	const source = audio.createBufferSource()
	source.buffer = replacement.audio
	source.playbackRate.value = rate
	source.connect(level).connect(audio.destination)
	const voice: VoiceOver = {
		replacement,
		source,
		volume: element.volume,
		ended: false,
		holding: false
	}
	source.onended = () => {
		voice.ended = true
	}
	source.start(
		0,
		replacement.offsetSeconds + intoSeconds,
		Math.max(0, replacement.takeSeconds - intoSeconds)
	)
	element.volume = 0
	return voice
}

/** Stops whatever take is playing and gives the video its sound back. */
function stopVoice(
	voiceRef: RefObject<VoiceOver | null>,
	videoRef: RefObject<HTMLVideoElement | null>
) {
	const voice = voiceRef.current
	if (!voice) return
	voiceRef.current = null
	voice.source.onended = null
	voice.source.stop()
	if (videoRef.current) videoRef.current.volume = voice.volume
}

/**
 * Plays a video's segments in order, whatever their order in the file:
 * at the end of one, jumps to the start of the next; past the last, stops.
 * Which segment is playing has to be tracked, not inferred from the time —
 * once clips are reordered, the source time just after a segment can belong
 * to one that plays much later.
 *
 * Over a re-recorded segment the video's own sound goes to zero volume and
 * the take plays through Web Audio instead; where the take outlasts the
 * segment, the video pauses on its last frame until the take is done.
 * Volume, not `muted`: unmuting a video without a user gesture can pause it.
 *
 * `rate` is the preview speed. The take plays at the same rate as the
 * video, so it stays in sync and a held frame lasts as long as the take.
 * Web Audio has no pitch correction, so a take sounds higher when sped up,
 * unlike the video's own sound.
 */
export function useSequencePlayback(
	videoRef: RefObject<HTMLVideoElement | null>,
	segments: Segment<ReplacementTake>[],
	isPlaying: boolean,
	rate: number,
	/** The playhead's source time, and which segment it's in: a time can end one segment and start another. */
	onTime: (seconds: number, segmentIndex: number | null) => void,
	/** Playback ended while the video was already paused (holding under a take): no `pause` event comes. */
	onStop: () => void
) {
	const playingIndexRef = useRef<number | null>(null)
	const audioRef = useRef<AudioContext | null>(null)
	const voiceRef = useRef<VoiceOver | null>(null)

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter and segment jumps land late, so follow every animation frame.
	useEffect(() => {
		if (!isPlaying) {
			stopVoice(voiceRef, videoRef)
			return
		}

		/** Moves on from segment `index`: to the start of the next, or stops after the last. */
		const advance = (element: HTMLVideoElement, index: number) => {
			stopVoice(voiceRef, videoRef)
			const current = segments[index]
			const next = segments[index + 1]
			if (next) {
				element.currentTime = next.startSeconds
				playingIndexRef.current = index + 1
				if (element.paused) void element.play()
			} else {
				const wasHolding = element.paused
				element.pause()
				if (current) element.currentTime = current.endSeconds
				if (wasHolding) onStop()
			}
		}

		let frame = 0
		const follow = () => {
			const element = videoRef.current
			if (element) {
				// A take keeps the video's rate when the speed changes while it plays.
				const voicing = voiceRef.current?.source.playbackRate
				if (voicing && voicing.value !== rate) voicing.value = rate
				const seconds = element.currentTime
				const index = playingIndexRef.current ?? -1
				const current = segments[index]
				const voice = voiceRef.current
				if (voice?.holding) {
					// Holding the last frame: on once the take is done, or the user pressed play.
					if (voice.ended || !element.paused) advance(element, index)
				} else if (
					current &&
					seconds >= current.endSeconds &&
					seconds < current.endSeconds + SEGMENT_END_SLACK_SECONDS
				) {
					if (voice && !voice.ended && current.voiceOver) {
						voice.holding = true
						element.pause()
						element.currentTime = current.endSeconds
					} else {
						advance(element, index)
					}
				} else if (!current || seconds < current.startSeconds || seconds >= current.endSeconds) {
					stopVoice(voiceRef, videoRef)
					const at = playbackPosition(seconds, segments)
					if (at) {
						if (at.seconds !== seconds) element.currentTime = at.seconds
						playingIndexRef.current = at.index
					} else {
						element.pause()
					}
				}
				// Entering (or resuming inside) a re-recorded segment starts its take
				// from the matching point; anywhere else, no take plays.
				const playing = segments[playingIndexRef.current ?? -1]
				const replacement = playing?.voiceOver?.replacement
				if (replacement && !element.paused && voiceRef.current?.replacement !== replacement) {
					stopVoice(voiceRef, videoRef)
					const audio = audioRef.current ?? new AudioContext()
					audioRef.current = audio
					voiceRef.current = startVoice(
						audio,
						element,
						replacement,
						element.currentTime - playing.startSeconds,
						rate
					)
				} else if (!replacement && voiceRef.current) {
					stopVoice(voiceRef, videoRef)
				}
				onTime(element.currentTime, playingIndexRef.current)
			}
			frame = requestAnimationFrame(follow)
		}
		frame = requestAnimationFrame(follow)
		return () => cancelAnimationFrame(frame)
	}, [isPlaying, segments, rate, videoRef, onTime, onStop])

	// The preview speed on the video. After every render, not on change only:
	// a new video element starts at 1×, and the rate must be set before play
	// starts, not on the first frame after it.
	useEffect(() => {
		const element = videoRef.current
		if (element && element.playbackRate !== rate) element.playbackRate = rate
	})

	// The take and its audio context go with the editor.
	useEffect(
		() => () => {
			stopVoice(voiceRef, videoRef)
			void audioRef.current?.close()
		},
		[videoRef]
	)

	/** Moves to a source time, or to what plays next if that time was removed. */
	function seek(seconds: number) {
		const element = videoRef.current
		if (!element) return
		stopVoice(voiceRef, videoRef)
		const at = playbackPosition(seconds, segments)
		const target = at?.seconds ?? segments.at(-1)?.endSeconds ?? seconds
		playingIndexRef.current = at?.index ?? null
		element.currentTime = target
		onTime(target, at?.index ?? null)
	}

	/**
	 * For `timeupdate`: keeps the native controls on playable time while
	 * paused — scrubbing into something removed lands on what plays next. A
	 * segment's own end counts as on it, so stopping at the end stays put.
	 * While playing, the frame loop above owns this, in sequence order.
	 */
	function settle(element: HTMLVideoElement) {
		const seconds = element.currentTime
		const onSegment = segments.some((s) => seconds >= s.startSeconds && seconds <= s.endSeconds)
		if (element.paused && !onSegment) {
			const target = playbackPosition(seconds, segments)?.seconds ?? segments.at(-1)?.endSeconds
			if (target !== undefined) element.currentTime = target
		}
		onTime(element.currentTime, playingIndexRef.current)
	}

	/** For `play`: pressing play at the end of the sequence starts it over. */
	function restartIfAtEnd(element: HTMLVideoElement) {
		const last = segments.at(-1)
		const first = segments[0]
		if (last && first && Math.abs(element.currentTime - last.endSeconds) <= END_TOLERANCE_SECONDS) {
			playingIndexRef.current = 0
			element.currentTime = first.startSeconds
		}
	}

	/** Whether the video is paused on purpose, holding its last frame under a longer take. */
	function isHolding() {
		return voiceRef.current?.holding ?? false
	}

	return { seek, settle, restartIfAtEnd, isHolding }
}
