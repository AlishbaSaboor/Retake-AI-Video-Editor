import { useEffect, useRef, type RefObject } from 'react'
import { playbackPosition, type SourceRange } from './sequence'

// Pressing play this close to the end counts as "at the end" and restarts
// from the beginning, rather than playing a frame and stopping.
const END_TOLERANCE_SECONDS = 0.05
// How far past a segment's end the video may run before the next frame
// catches it — inside this it's the end of the segment, beyond it the user
// has scrubbed somewhere else.
const SEGMENT_END_SLACK_SECONDS = 0.25

/**
 * Plays a video's segments in order, whatever their order in the file:
 * at the end of one, jumps to the start of the next; past the last, stops.
 * Which segment is playing has to be tracked, not inferred from the time —
 * once clips are reordered, the source time just after a segment can belong
 * to one that plays much later.
 */
export function useSequencePlayback(
	videoRef: RefObject<HTMLVideoElement | null>,
	segments: SourceRange[],
	isPlaying: boolean,
	onTime: (seconds: number) => void
) {
	const playingIndexRef = useRef<number | null>(null)

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter and segment jumps land late, so follow every animation frame.
	useEffect(() => {
		if (!isPlaying) return
		let frame = 0
		const follow = () => {
			const element = videoRef.current
			if (element) {
				const seconds = element.currentTime
				const index = playingIndexRef.current ?? -1
				const current = segments[index]
				if (
					current &&
					seconds >= current.endSeconds &&
					seconds < current.endSeconds + SEGMENT_END_SLACK_SECONDS
				) {
					const next = segments[index + 1]
					if (next) {
						element.currentTime = next.startSeconds
						playingIndexRef.current = index + 1
					} else {
						element.pause()
						element.currentTime = current.endSeconds
					}
				} else if (!current || seconds < current.startSeconds || seconds >= current.endSeconds) {
					const at = playbackPosition(seconds, segments)
					if (at) {
						if (at.seconds !== seconds) element.currentTime = at.seconds
						playingIndexRef.current = at.index
					} else {
						element.pause()
					}
				}
				onTime(element.currentTime)
			}
			frame = requestAnimationFrame(follow)
		}
		frame = requestAnimationFrame(follow)
		return () => cancelAnimationFrame(frame)
	}, [isPlaying, segments, videoRef, onTime])

	/** Moves to a source time, or to what plays next if that time was removed. */
	function seek(seconds: number) {
		const element = videoRef.current
		if (!element) return
		const at = playbackPosition(seconds, segments)
		const target = at?.seconds ?? segments.at(-1)?.endSeconds ?? seconds
		playingIndexRef.current = at?.index ?? null
		element.currentTime = target
		onTime(target)
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
		onTime(element.currentTime)
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

	return { seek, settle, restartIfAtEnd }
}
