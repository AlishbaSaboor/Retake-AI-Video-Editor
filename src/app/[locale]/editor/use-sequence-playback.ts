import { useEffect, useRef, type RefObject } from 'react'
import { playLane, stretchFrom, type AudioItem } from './audio-lane'
import { clipGainAt } from './clip-audio'
import { scheduleTakeGain, type ReplacementTake } from './re-record'
import {
	editedStarts,
	isInSegment,
	joinsOf,
	playbackPosition,
	SEEK_TOLERANCE_SECONDS,
	type Segment,
	type SourceRange
} from './sequence'
import { crossfadeGains, transitionGainAt } from './transitions'

// Pressing play this close to the end counts as "at the end" and restarts
// from the beginning, rather than playing a frame and stopping.
const END_TOLERANCE_SECONDS = 0.05
// How far past a segment's end the video may run before the next frame
// catches it — inside this it's the end of the segment, beyond it the user
// has scrubbed somewhere else.
const SEGMENT_END_SLACK_SECONDS = 0.25
/** How quickly the preview's clip level follows the fades between frames. */
const LEVEL_SMOOTHING_SECONDS = 0.015
/**
 * At a dissolve's join the main video jumps to where the incoming clip has
 * got to, this far ahead of it (in source seconds at 1×), and takes over
 * once the dissolving player catches up: the seek itself never shows.
 */
const HANDOFF_LEAD_SECONDS = 0.2
/** How far the dissolving player may be from where it should be before it's sought there. */
const DECK_DRIFT_SECONDS = 0.1

/**
 * A dissolve in the preview: the second player, over the main one, plays
 * segment `index` coming in. `handoff` once the main video has jumped
 * ahead into that segment and the second player covers it until it's there.
 */
type Dissolve = { index: number; started: boolean; handoff: boolean }

type Lane = { index: number; items: AudioItem[]; to: number; rate: number; stop: () => void }

/** Stops the Audio lane's sounds, if any are playing. */
function stopLane(laneRef: RefObject<Lane | null>) {
	laneRef.current?.stop()
	laneRef.current = null
}

/** Hides the dissolving player and stops it. */
function hideDeck(deck: HTMLVideoElement | null) {
	if (!deck) return
	deck.pause()
	deck.style.opacity = '0'
	deck.volume = 0
}

/** Where each video plays from: for a dissolve's player to load the clip coming in. */
export type SourceUrls = { added: Readonly<Record<string, string>>; main: string }

/**
 * The players: the main one, the added videos' (over it, by id, each shown
 * only while it plays), and which one is showing ("away" when it isn't the
 * main one).
 */
type Players = {
	videoRef: RefObject<HTMLVideoElement | null>
	sourceElementsRef: RefObject<Map<string, HTMLVideoElement>>
	activeRef: RefObject<HTMLVideoElement | null>
	awayRef: RefObject<boolean>
}

/** The player for a video: an added one's, or the main one. */
function elementFor(players: Players, source: string | undefined): HTMLVideoElement | null {
	return source ? (players.sourceElementsRef.current.get(source) ?? null) : players.videoRef.current
}

/** Shows `element`'s picture: an added player over the main one, or none of them. */
function showActive(players: Players, element: HTMLVideoElement) {
	players.activeRef.current = element
	players.awayRef.current = element !== players.videoRef.current
	for (const added of players.sourceElementsRef.current.values()) {
		added.style.opacity = added === element ? '1' : '0'
	}
}

/** Puts a player at a time. */
function startAt(element: HTMLVideoElement, seconds: number) {
	element.currentTime = seconds
}

/** Hands playback from one player to another: the old one paused, the new one shown. */
function switchTo(players: Players, from: HTMLVideoElement, to: HTMLVideoElement) {
	if (from === to) return
	// Away first: pausing the main player must not read as stopping.
	showActive(players, to)
	from.pause()
}

/** A re-recorded take playing over the video, and whether the picture is holding for it. */
type VoiceOver = {
	replacement: ReplacementTake
	source: AudioBufferSourceNode
	/** The video's volume before the take muted it. */
	volume: number
	ended: boolean
	holding: boolean
}

/**
 * Starts `replacement` playing from `intoSeconds` into its take, over the
 * video turned down, into `output` (the clip's level, or the speakers).
 */
function startVoice(
	audio: AudioContext,
	output: AudioNode,
	element: HTMLVideoElement,
	replacement: ReplacementTake,
	intoSeconds: number,
	rate: number
): VoiceOver {
	void audio.resume()
	const level = audio.createGain()
	const source = audio.createBufferSource()
	source.buffer = replacement.audio
	source.playbackRate.value = rate
	source.connect(level).connect(output)
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
	const at = audio.currentTime
	scheduleTakeGain(level.gain, replacement, at, intoSeconds, rate)
	source.start(
		at,
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
 *
 * A clip of an added video plays on that video's own player, shown over the
 * main one; the main player is paused meanwhile ("away"), which isn't
 * stopping. Moving between videos switches players at the join.
 */
export function useSequencePlayback(
	videoRef: RefObject<HTMLVideoElement | null>,
	/** A second player over the first, for dissolves: the clip coming in. */
	deckRef: RefObject<HTMLVideoElement | null>,
	/** The added videos' players, by id. */
	sourceElementsRef: RefObject<Map<string, HTMLVideoElement>>,
	urls: SourceUrls,
	segments: Segment<ReplacementTake>[],
	/** The Audio lane's sounds, in the edited video's time: [] when `segments` aren't the edit's. */
	laneItems: AudioItem[],
	/** Where someone speaks, in edited time: ducked music goes down under it. */
	speech: readonly SourceRange[],
	isPlaying: boolean,
	rate: number,
	/** The playhead's source time, and which segment it's in: a time can end one segment and start another. */
	onTime: (seconds: number, segmentIndex: number | null) => void,
	/** Playback ended while the video was already paused (holding under a take): no `pause` event comes. */
	onStop: () => void,
	/** Playback started on an added video's player: the main one sends no `play` event. */
	onStart: () => void
) {
	const playingIndexRef = useRef<number | null>(null)
	const audioRef = useRef<AudioContext | null>(null)
	const voiceRef = useRef<VoiceOver | null>(null)
	// Clip volume and fades: the video's sound routed through a gain (a
	// <video> can't go above 100%), made the first time a clip needs it.
	// A media element can be routed only once, so it stays routed.
	const clipLevelsRef = useRef(new Map<HTMLVideoElement, GainNode>())
	// The player showing: the main one, or an added video's (then the main one is "away").
	const activeRef = useRef<HTMLVideoElement | null>(null)
	const awayRef = useRef(false)
	const dissolveRef = useRef<Dissolve | null>(null)
	// The Audio lane's sounds playing: from which segment's stretch, of which
	// items, up to where, at what speed, and their stop. Kept across this
	// hook's effect re-running (it does on every render): restarting them
	// would click.
	const laneRef = useRef<Lane | null>(null)

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter and segment jumps land late, so follow every animation frame.
	useEffect(() => {
		if (!isPlaying) {
			stopLane(laneRef)
			stopVoice(voiceRef, videoRef)
			dissolveRef.current = null
			hideDeck(deckRef.current)
			for (const added of sourceElementsRef.current.values()) added.pause()
			return
		}
		const players: Players = { videoRef, sourceElementsRef, activeRef, awayRef }
		const starts = editedStarts(segments)
		const joins = joinsOf(segments)
		/** The edited video's time at the main video's time, in segment `index`. */
		const editedAt = (index: number, seconds: number) => {
			const segment = segments[index]
			if (!segment) return 0
			const into = Math.max(0, Math.min(seconds, segment.endSeconds) - segment.startSeconds)
			return (starts[index] ?? 0) + into / (segment.rate ?? 1)
		}

		/** Moves on from segment `index`: to the start of the next, or stops after the last. */
		const advance = (element: HTMLVideoElement, index: number) => {
			stopVoice(voiceRef, videoRef)
			const current = segments[index]
			const next = segments[index + 1]
			const deck = deckRef.current
			const dissolve = dissolveRef.current
			const nextElement = next ? (elementFor(players, next.source) ?? element) : element
			if (next && deck && dissolve?.started && dissolve.index === index + 1) {
				// The incoming clip is already playing on top: jump ahead of it and
				// let it cover the seek until its own player is there.
				deck.style.opacity = '1'
				nextElement.currentTime = Math.min(
					next.endSeconds,
					deck.currentTime + HANDOFF_LEAD_SECONDS * (next.rate ?? 1)
				)
				switchTo(players, element, nextElement)
				dissolve.handoff = true
				playingIndexRef.current = index + 1
				if (nextElement.paused) void nextElement.play()
			} else if (next && nextElement !== element) {
				// Into another video: its player, from the clip's start.
				nextElement.currentTime = next.startSeconds
				switchTo(players, element, nextElement)
				playingIndexRef.current = index + 1
				void nextElement.play()
			} else if (next) {
				// Where the next segment carries straight on from this one (a
				// re-recorded span's start), the picture plays on: seeking there
				// anyway held it ~0.45 s on an MP4 while the take already spoke.
				const carriesOn =
					current !== undefined &&
					Math.abs(next.startSeconds - current.endSeconds) <= SEEK_TOLERANCE_SECONDS &&
					isInSegment(element.currentTime, next)
				if (!carriesOn) element.currentTime = next.startSeconds
				playingIndexRef.current = index + 1
				if (element.paused) void element.play()
			} else {
				const wasHolding = element.paused || element !== videoRef.current
				element.pause()
				if (current) element.currentTime = current.endSeconds
				if (wasHolding) onStop()
			}
		}

		/**
		 * Sets the clip's level for where playback is: its volume along its
		 * fades, smoothed over ~15 ms between frames. Routes the video through
		 * the gain the first time any segment needs it. The gain, or null
		 * while the video plays straight to the speakers.
		 */
		const followClipLevel = (element: HTMLVideoElement, playing: Segment | undefined) => {
			const levels = clipLevelsRef.current
			if (!levels.has(element) && segments.some((s) => s.audio || s.transition)) {
				const audio = audioRef.current ?? new AudioContext()
				audioRef.current = audio
				void audio.resume()
				const gain = audio.createGain()
				audio.createMediaElementSource(element).connect(gain).connect(audio.destination)
				levels.set(element, gain)
			}
			const level = levels.get(element)
			if (!level) return null
			const audio = playing?.audio
			// Played seconds into the segment: a sped clip's fades are in output time.
			const into = (element.currentTime - (playing?.startSeconds ?? 0)) / (playing?.rate ?? 1)
			const index = playingIndexRef.current ?? -1
			// Silent while the dissolving player covers the jump at a join.
			const transition = dissolveRef.current?.handoff
				? 0
				: transitionGainAt(joins, index, editedAt(index, element.currentTime))
			const target = (audio ? clipGainAt(audio, audio.offsetSeconds + into) : 1) * transition
			level.gain.setTargetAtTime(target, level.context.currentTime, LEVEL_SMOOTHING_SECONDS)
			return level
		}

		/**
		 * Plays a dissolve on the second player: sought to the incoming clip
		 * while the one before plays, started when the overlap begins, faded in
		 * over the main video with its sound crossfading; after the join, hidden
		 * once the main video has caught up with it.
		 */
		const followDissolve = (element: HTMLVideoElement, index: number) => {
			const deck = deckRef.current
			if (!deck) return
			const dissolve = dissolveRef.current
			if (dissolve?.handoff) {
				if (!element.seeking && element.currentTime >= deck.currentTime) {
					dissolveRef.current = null
					hideDeck(deck)
				}
				return
			}
			const next = segments[index + 1]
			if (next?.transition?.kind !== 'dissolve' || element.paused) {
				if (dissolve) {
					dissolveRef.current = null
					hideDeck(deck)
				}
				return
			}
			const current = dissolve?.index === index + 1 ? dissolve : null
			const state: Dissolve = current ?? { index: index + 1, started: false, handoff: false }
			dissolveRef.current = state
			// The dissolving player plays the incoming clip's video.
			const url = next.source ? (urls.added[next.source] ?? urls.main) : urls.main
			if (deck.dataset.url !== url) {
				deck.src = url
				deck.dataset.url = url
			}
			const nextRate = next.rate ?? 1
			const into = editedAt(index, element.currentTime) - (starts[index + 1] ?? 0)
			const wanted = next.startSeconds + Math.max(0, into) * nextRate
			deck.preservesPitch = true
			if (deck.playbackRate !== rate * nextRate) deck.playbackRate = rate * nextRate
			if (into < 0) {
				// Waiting at the incoming clip's start for the overlap.
				if (!current && Math.abs(deck.currentTime - next.startSeconds) > DECK_DRIFT_SECONDS) {
					deck.currentTime = next.startSeconds
				}
				return
			}
			if (!state.started) {
				if (Math.abs(deck.currentTime - wanted) > DECK_DRIFT_SECONDS) deck.currentTime = wanted
				void deck.play()
				state.started = true
			}
			const progress = into / next.transition.seconds
			deck.style.opacity = String(Math.min(1, progress))
			deck.volume = Math.min(1, crossfadeGains(progress).in)
		}

		/**
		 * Plays the Audio lane over the stretch being played: started where
		 * playback is when a stretch begins (a seek ends one; a dissolve carries
		 * on in the same), at the preview's speed; stopped when it ends, on a
		 * seek or a pause.
		 */
		const followLane = (element: HTMLVideoElement, index: number) => {
			if (laneItems.length === 0 || element.paused || index < 0) {
				stopLane(laneRef)
				return
			}
			const current = laneRef.current
			const { to } = stretchFrom(segments, index)
			// The same items over the same stretch at the same speed: carry on.
			const same =
				current !== null &&
				current.items === laneItems &&
				current.to === to &&
				current.rate === rate
			const carriesOn =
				same && index > current.index && segments[index]?.transition?.kind === 'dissolve'
			if (same && (current.index === index || carriesOn)) return
			stopLane(laneRef)
			const audio = audioRef.current ?? new AudioContext()
			audioRef.current = audio
			void audio.resume()
			laneRef.current = {
				index,
				items: laneItems,
				to,
				rate,
				stop: playLane(
					audio,
					audio.destination,
					laneItems,
					editedAt(index, element.currentTime),
					to,
					audio.currentTime,
					rate,
					speech
				)
			}
		}

		let frame = 0
		const follow = () => {
			// The player of the clip playing (the main one before any is known).
			const known = segments[playingIndexRef.current ?? -1]
			const element =
				(known ? elementFor(players, known.source) : activeRef.current) ?? videoRef.current
			if (element && element !== (activeRef.current ?? videoRef.current))
				showActive(players, element)
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
				} else if (!current || !isInSegment(seconds, current)) {
					stopVoice(voiceRef, videoRef)
					const at = playbackPosition(seconds, segments, current?.source)
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
				// The clip's own speed times the preview's, set as each segment begins.
				const wanted = rate * (playing?.rate ?? 1)
				if (element.playbackRate !== wanted) element.playbackRate = wanted
				followDissolve(element, playingIndexRef.current ?? -1)
				followLane(element, playingIndexRef.current ?? -1)
				const clipLevel = followClipLevel(element, playing)
				const replacement = playing?.voiceOver?.replacement
				if (replacement && !element.paused && voiceRef.current?.replacement !== replacement) {
					stopVoice(voiceRef, videoRef)
					const audio = audioRef.current ?? new AudioContext()
					audioRef.current = audio
					voiceRef.current = startVoice(
						audio,
						clipLevel ?? audio.destination,
						element,
						replacement,
						// A hair before the start reads as the start (SEEK_TOLERANCE_SECONDS).
						Math.max(0, element.currentTime - playing.startSeconds),
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
	}, [
		isPlaying,
		segments,
		laneItems,
		speech,
		rate,
		videoRef,
		deckRef,
		sourceElementsRef,
		urls,
		onTime,
		onStop
	])

	// The preview speed (times the playing clip's own) on the video, its pitch
	// kept. After every render, not on change only: a new video element starts
	// at 1×, and the rate must be set before play starts, not on the first
	// frame after it.
	useEffect(() => {
		// A new main player (a new video loaded) is the one showing.
		if (!activeRef.current?.isConnected) activeRef.current = videoRef.current
		const element = activeRef.current ?? videoRef.current
		if (!element) return
		element.preservesPitch = true
		const wanted = rate * (segments[playingIndexRef.current ?? -1]?.rate ?? 1)
		if (element.playbackRate !== wanted) element.playbackRate = wanted
	})

	// The take, the lane and their audio context go with the editor.
	useEffect(
		() => () => {
			stopLane(laneRef)
			stopVoice(voiceRef, videoRef)
			void audioRef.current?.close()
		},
		[videoRef]
	)

	const players: Players = { videoRef, sourceElementsRef, activeRef, awayRef }

	/**
	 * Moves to a time in a video (`source`, absent for the main one), or to
	 * what plays next of it if that time was removed. A move into another
	 * video switches players, playing on if it was.
	 */
	function seek(seconds: number, source?: string) {
		const element = elementFor(players, source)
		if (!element) return
		stopVoice(voiceRef, videoRef)
		dissolveRef.current = null
		hideDeck(deckRef.current)
		stopLane(laneRef)
		const previous = activeRef.current ?? videoRef.current
		if (previous && previous !== element) {
			const wasPlaying = !previous.paused
			switchTo(players, previous, element)
			if (wasPlaying) void element.play()
		}
		const at = playbackPosition(seconds, segments, source)
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
		// Away, the main player's time isn't the playhead's.
		if (awayRef.current) return
		const seconds = element.currentTime
		const onSegment = segments.some(
			(s) => seconds >= s.startSeconds - SEEK_TOLERANCE_SECONDS && seconds <= s.endSeconds
		)
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
		if (
			last &&
			first &&
			!last.source &&
			!first.source &&
			Math.abs(element.currentTime - last.endSeconds) <= END_TOLERANCE_SECONDS
		) {
			playingIndexRef.current = 0
			element.currentTime = first.startSeconds
		}
	}

	/**
	 * Whether the main player is paused on purpose: holding its last frame
	 * under a longer take, or away while an added video plays.
	 */
	function isHolding() {
		return (voiceRef.current?.holding ?? false) || awayRef.current
	}

	/** Plays from where the playhead is, on its video's player; from the start when it's at the end. */
	function play() {
		const current = activeRef.current ?? videoRef.current
		if (!current) return
		const lastIndex = segments.length - 1
		const last = segments[lastIndex]
		const first = segments[0]
		const index = playingIndexRef.current
		const atEnd =
			last !== undefined &&
			(index === null || index === lastIndex) &&
			elementFor(players, last.source) === current &&
			Math.abs(current.currentTime - last.endSeconds) <= END_TOLERANCE_SECONDS
		const element = (atEnd && first && elementFor(players, first.source)) || current
		if (atEnd && first) {
			playingIndexRef.current = 0
			startAt(element, first.startSeconds)
			switchTo(players, current, element)
		}
		void element.play()
		if (element !== videoRef.current) onStart()
	}

	/** Pauses whichever player is playing. */
	function pause() {
		const element = activeRef.current ?? videoRef.current
		if (!element) return
		element.pause()
		if (element !== videoRef.current) onStop()
	}

	/**
	 * Back to the main player, paused, for what plays the main video directly
	 * (a cut, take or join preview, a trim of it).
	 */
	function returnToMain() {
		const main = videoRef.current
		const active = activeRef.current
		if (main && active && active !== main) switchTo(players, active, main)
	}

	return { seek, settle, restartIfAtEnd, isHolding, play, pause, activeRef, returnToMain }
}
