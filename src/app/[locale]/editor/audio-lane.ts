import { clampVolume } from './clip-audio'
import {
	clipHasTake,
	editedStarts,
	overlapSeconds,
	segmentSeconds,
	type Clip,
	type Replacement,
	type Segment,
	type SourceRange
} from './sequence'

// The Audio lane: sounds of their own, laid on the edited video's timeline
// and mixed over it. An item is an added audio file (music, a voice-over),
// or a clip's own sound taken out of it ("extracted"), which then stays where
// it's put while the clip goes silent: so it can be moved, trimmed and
// turned down on its own. Items may overlap; they're mixed.
//
// An item plays its source's `pieces` back to back (a file is one piece; an
// extracted clip is its kept pieces, cuts skipped), from `skipSeconds` into
// them for `seconds`, starting at `atSeconds` of the edited video. Trimming
// its start skips more of the source; moving it changes only `atSeconds`.

export type AudioItem<Sound = AudioBuffer> = {
	id: string
	/** Shown in the lane: the file's name, or "Clip 2 sound". */
	name: string
	/** The decoded sound it plays from: a file's own, or the take's. */
	buffer: Sound
	/** The parts of `buffer` it plays, back to back, in the buffer's seconds. */
	pieces: SourceRange[]
	skipSeconds: number
	seconds: number
	atSeconds: number
	/** 0 to 2, like a clip's. */
	volume: number
	muted: boolean
}

/** The shortest an item may be trimmed to: the same floor as a clip. */
export const MIN_ITEM_SECONDS = 0.1

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** How much sound an item's pieces hold, before any trim. */
export function availableSeconds(item: Pick<AudioItem, 'pieces'>): number {
	return item.pieces.reduce((sum, p) => sum + p.endSeconds - p.startSeconds, 0)
}

export function itemEnd(item: Pick<AudioItem, 'atSeconds' | 'seconds'>): number {
	return item.atSeconds + item.seconds
}

/** Where an item sits and what it plays: all but its sound itself. */
type Placed = Omit<AudioItem<unknown>, 'buffer'>

/** Moved to start at `seconds` of the edited video (not before its start). */
export function moveItem<T extends Placed>(item: T, seconds: number): T {
	return { ...item, atSeconds: Math.max(0, seconds) }
}

/**
 * One edge moved to `seconds` of the edited video. The start skips more or
 * less of the source (never before its beginning, never past the end
 * minus the minimum); the end plays more or less of it (never past what
 * there is).
 */
export function trimItem<T extends Placed>(item: T, edge: 'start' | 'end', seconds: number): T {
	const end = itemEnd(item)
	if (edge === 'end') {
		const most = availableSeconds(item) - item.skipSeconds
		return { ...item, seconds: clamp(seconds - item.atSeconds, MIN_ITEM_SECONDS, most) }
	}
	// The start can go back as far as the source allows, and not before 0.
	const earliest = Math.max(0, item.atSeconds - item.skipSeconds)
	const atSeconds = clamp(seconds, earliest, end - MIN_ITEM_SECONDS)
	const shift = atSeconds - item.atSeconds
	return {
		...item,
		atSeconds,
		skipSeconds: item.skipSeconds + shift,
		seconds: item.seconds - shift
	}
}

export function withVolume<T extends Placed>(item: T, volume: number): T {
	return { ...item, volume: clampVolume(volume) }
}

/** A part of the buffer to play: from `offsetSeconds` into it, for `seconds`, starting `atSeconds` into the edit. */
export type Playing = { atSeconds: number; offsetSeconds: number; seconds: number }

/**
 * What of an item sounds between `from` and `to` seconds of the edited
 * video: each stretch of its buffer, where in the edit it starts, and for
 * how long. Empty when it's outside them.
 */
export function playingBetween(item: Placed, from: number, to: number): Playing[] {
	const out: Playing[] = []
	let played = -item.skipSeconds
	for (const piece of item.pieces) {
		const length = piece.endSeconds - piece.startSeconds
		// This piece's part of the item, after the skip and within its length, in edit seconds.
		const start = Math.max(played, 0)
		const end = Math.min(played + length, item.seconds)
		const editStart = Math.max(item.atSeconds + start, from)
		const editEnd = Math.min(item.atSeconds + end, to)
		if (editEnd > editStart) {
			out.push({
				atSeconds: editStart,
				offsetSeconds: piece.startSeconds + (editStart - item.atSeconds - played),
				seconds: editEnd - editStart
			})
		}
		played += length
		if (played >= item.seconds) break
	}
	return out
}

/**
 * A clip's sound as a lane item: the clip's kept pieces of the take, where
 * the clip starts in the edit. `segments` are the clip's own, from the
 * edit's segments (`first` is the index of its first), at 1× with no take:
 * the caller has checked.
 */
export function extractedItem<Sound>(
	segments: Segment[],
	first: number,
	count: number,
	buffer: Sound,
	name: string,
	id: string
): AudioItem<Sound> {
	const own = segments.slice(first, first + count)
	const pieces = own.map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds }))
	return {
		id,
		name,
		buffer,
		pieces,
		skipSeconds: 0,
		seconds: availableSeconds({ pieces }),
		atSeconds: editedStarts(segments)[first] ?? 0,
		volume: 1,
		muted: false
	}
}

/**
 * The stretches of the edited video that play without a seek: a segment
 * and any dissolving straight on from it. The export's recorder runs
 * through each, pausing between them; lane sound is scheduled per stretch.
 * `[from, to)` in edited seconds, starting at segment `index`.
 */
export function stretchFrom(segments: Segment[], index: number): { from: number; to: number } {
	const starts = editedStarts(segments)
	let last = index
	while (segments[last + 1] && overlapSeconds(segments[last + 1] as Segment) > 0) last++
	const lastSegment = segments[last]
	return {
		from: starts[index] ?? 0,
		to: (starts[last] ?? 0) + (lastSegment ? segmentSeconds(lastSegment) : 0)
	}
}

/**
 * Starts every lane item's sound between `from` and `to` seconds of the
 * edit, `from` being audio time `at`, into `destination`, at `rate` (the
 * preview's speed; 1 in the export). Returns a stop for all of them.
 */
export function playLane(
	audio: BaseAudioContext,
	destination: AudioNode,
	items: AudioItem[],
	from: number,
	to: number,
	at: number,
	rate = 1
): () => void {
	const sources: AudioBufferSourceNode[] = []
	for (const item of items) {
		if (item.muted || item.volume === 0) continue
		for (const part of playingBetween(item, from, to)) {
			const level = audio.createGain()
			level.gain.value = item.volume
			const source = audio.createBufferSource()
			source.buffer = item.buffer
			source.playbackRate.value = rate
			source.connect(level).connect(destination)
			source.start(at + (part.atSeconds - from) / rate, part.offsetSeconds, part.seconds)
			sources.push(source)
		}
	}
	return () => {
		for (const source of sources) {
			try {
				source.stop()
			} catch {
				// Never started, or already stopped: nothing to stop.
			}
		}
	}
}

/** Why a clip's sound can't be taken out into the lane. */
export type ExtractBlocker = 'sped' | 'take' | 'already'

/**
 * Only a clip at 1× with no re-recorded take, not already taken out: its
 * lane item is then exactly the take's own sound under it.
 */
export function extractBlocker(
	clip: Clip,
	replacements: readonly Replacement[]
): ExtractBlocker | null {
	if (clip.soundInLane) return 'already'
	if ((clip.speed ?? 1) !== 1) return 'sped'
	return clipHasTake(clip, replacements) ? 'take' : null
}
