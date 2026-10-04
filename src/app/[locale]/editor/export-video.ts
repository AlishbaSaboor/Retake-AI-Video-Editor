import { scheduleClipGain } from './clip-audio'
import { clipMatrix, mountGradeFilters, type ColorGrade } from './color-grade'
import { drawFrame, type Overlays } from './overlays'
import { scheduleTakeGain, type ReplacementTake } from './re-record'
import { editedLength, editedStarts, joinsOf, segmentSeconds, type Segment } from './sequence'
import { dissolveAt, fadeLevelAt, scheduleTransitionGain } from './transitions'
import { evenPixels, outputSize, type PictureTransform } from './transform'

// Exporting re-records the edit in real time: an offscreen copy of the take
// plays each kept segment in order while a MediaRecorder captures its frames
// (drawn onto a canvas) and its sound (routed through Web Audio, so nothing
// is heard). Recording pauses across the jump between segments, so the file
// holds exactly what plays. Chosen over ffmpeg.wasm (a ~30 MB download) and
// server-side encoding (uploading the whole take): no dependency, and the
// footage never leaves the browser — at the cost of taking as long as the
// edit runs, with the tab in front, since hidden tabs stop drawing frames.
//
// Over a re-recorded segment the source's sound is muted and the take plays
// into the same recording instead; where the take runs longer than the
// segment's picture, recording carries on over the paused last frame.
//
// The annotations, captions, title and watermark are drawn onto each frame
// after the picture, at the edited video's time, so they're in the recording
// itself.

// Best first. WebM is what Chromium and Firefox record; Safari records MP4.
const MIME_TYPES = [
	'video/webm;codecs=vp9,opus',
	'video/webm;codecs=vp8,opus',
	'video/webm',
	'video/mp4'
]
const FRAME_RATE = 30

/** The best format this browser can record, or null if it can't record video. */
export function pickMimeType(isSupported: (mimeType: string) => boolean): string | null {
	return MIME_TYPES.find(isSupported) ?? null
}

/** "take.mov" exported as WebM becomes "take-edited.webm". */
export function exportFileName(sourceName: string, mimeType: string): string {
	const base = sourceName.replace(/\.[^.]*$/, '') || 'video'
	return `${base}-edited.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`
}

/** How long the export plays for: the segments laid end to end, less any dissolves' overlap. */
export function totalSeconds(segments: Segment[]): number {
	return editedLength(segments)
}

// How far an export's length may drift from the edit's before the user is
// told. Under memory pressure a stalled frame loop pauses the recorder late
// (a longer file) or the end never reaches the file (a shorter one):
// PROGRESS_NOTES.md section 4f. Healthy exports measure within ~40 ms.
const LENGTH_TOLERANCE_SECONDS = 0.25

/** How much longer (positive) or shorter (negative) the file is than the edit; null when close enough. */
export function lengthMismatch(fileSeconds: number, editSeconds: number): number | null {
	const off = fileSeconds - editSeconds
	return Math.abs(off) > LENGTH_TOLERANCE_SECONDS ? off : null
}

/**
 * A recorded file's real length. A MediaRecorder WebM has no duration
 * header, so seeking far past the end makes the browser scan for it, as the
 * editor does when it loads one.
 */
export async function fileSeconds(blob: Blob): Promise<number> {
	const url = URL.createObjectURL(blob)
	const video = Object.assign(document.createElement('video'), {
		src: url,
		preload: 'metadata',
		muted: true
	})
	try {
		await nextEvent(video, 'loadedmetadata')
		if (!Number.isFinite(video.duration)) {
			video.currentTime = Number.MAX_SAFE_INTEGER
			while (!Number.isFinite(video.duration)) await nextEvent(video, 'durationchange')
		}
		return video.duration
	} finally {
		video.removeAttribute('src')
		video.load()
		URL.revokeObjectURL(url)
	}
}

/** Whether this browser has what recordEdit needs. */
export function canExport(): boolean {
	return (
		typeof MediaRecorder !== 'undefined' &&
		typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
		pickMimeType((type) => MediaRecorder.isTypeSupported(type)) !== null
	)
}

function nextEvent(target: EventTarget, type: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const onError = () => reject(new Error(`media error while waiting for ${type}`))
		target.addEventListener(
			type,
			() => {
				target.removeEventListener('error', onError)
				resolve()
			},
			{ once: true }
		)
		target.addEventListener('error', onError, { once: true })
	})
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/** Starts a re-recorded take playing into `destination`; `ended` turns true once it has played out. */
function playTake(audio: AudioContext, destination: AudioNode, take: ReplacementTake) {
	const level = audio.createGain()
	const source = audio.createBufferSource()
	source.buffer = take.audio
	source.connect(level).connect(destination)
	const playing = { ended: false }
	source.onended = () => {
		playing.ended = true
	}
	const at = audio.currentTime
	scheduleTakeGain(level.gain, take, at, 0, 1)
	source.start(at, take.offsetSeconds, take.takeSeconds)
	return playing
}

/** Loads a watermark's image, ready to draw. */
async function loadLogo(overlays: Overlays): Promise<HTMLImageElement | null> {
	if (!overlays.watermark) return null
	const logo = new Image()
	logo.src = overlays.watermark.image
	await logo.decode()
	return logo
}

/** One player of the take, and its sound's way into the recording. */
type Deck = {
	video: HTMLVideoElement
	/** Turned to 0 under a re-recorded take. */
	sourceSound: GainNode
	/** The clip's volume and fades, over the source's sound and any take alike. */
	clipLevel: GainNode
	/** The transitions: a fade's dip, a dissolve's crossfade. */
	mix: GainNode
}

async function openDeck(url: string, audio: AudioContext, destination: AudioNode): Promise<Deck> {
	const video = Object.assign(document.createElement('video'), {
		src: url,
		preload: 'auto',
		playsInline: true,
		// A sped-up or slowed clip keeps its pitch (measured: 440 Hz stays
		// 434–445 Hz from 0.25x to 4x).
		preservesPitch: true
	})
	await nextEvent(video, 'loadeddata')
	const mix = audio.createGain()
	const clipLevel = audio.createGain()
	const sourceSound = audio.createGain()
	audio.createMediaElementSource(video).connect(sourceSound).connect(clipLevel)
	clipLevel.connect(mix).connect(destination)
	return { video, sourceSound, clipLevel, mix }
}

function closeDeck(deck: Deck) {
	deck.video.pause()
	deck.video.removeAttribute('src')
	deck.video.load()
}

/**
 * Plays `segments` of the video at `url` in order and records them into one
 * file, its picture through `transform` (flipped, turned, cropped) and with
 * `overlays` drawn over it. Only call where canExport() is true.
 * `onProgress` gets the fraction done; aborting `signal` stops early and
 * rejects with its reason.
 *
 * Two players ("decks") of the take take turns. A dissolve needs both
 * clips at once: the other deck is sought to the clip coming in while the
 * one before plays, starts when the overlap does, is drawn over it fading
 * in while the sounds crossfade, and carries on alone from the join, the
 * recorder never pausing. Every other join pauses the recorder across the
 * seek, as a single deck would.
 */
export async function recordEdit(
	url: string,
	segments: Segment<ReplacementTake>[],
	overlays: Overlays,
	transform: PictureTransform,
	color: ColorGrade,
	{ onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal }
): Promise<{ blob: Blob; mimeType: string }> {
	const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
	if (!mimeType) throw new Error('no recordable video format')
	// Each segment's grade as a canvas filter, from filters of the export's own.
	const matrices = segments.map((segment) => clipMatrix(color, segment.color))
	const grades = mountGradeFilters(
		'export-grade',
		matrices.flatMap((matrix) => (matrix ? [matrix] : []))
	)
	const filters = matrices.map((matrix) => grades.filterFor(matrix))
	const audio = new AudioContext()
	const destination = audio.createMediaStreamDestination()
	const decks: Deck[] = []
	let recorder: MediaRecorder | null = null
	let drawing = true
	try {
		const hasDissolve = segments.some((s) => s.transition?.kind === 'dissolve')
		decks.push(await openDeck(url, audio, destination))
		if (hasDissolve) decks.push(await openDeck(url, audio, destination))
		let [deck, spare] = decks
		if (!deck) throw new Error('no video')
		const logo = await loadLogo(overlays)
		const picture = { width: deck.video.videoWidth, height: deck.video.videoHeight }
		const canvas = Object.assign(
			document.createElement('canvas'),
			evenPixels(outputSize(picture, transform))
		)
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d canvas context')
		const blurScratch = document.createElement('canvas')
		const starts = editedStarts(segments)
		const joins = joinsOf(segments)
		// Where the frame being drawn is in the edited video; set per segment below.
		let editedSeconds = () => 0
		// The deck dissolving in over this one, while it does.
		let incoming: Deck | null = null
		// Which segment the deck playing shows: its grade.
		let showing = 0
		const paint = () => {
			if (!deck) return
			const seconds = editedSeconds()
			const dissolve = incoming ? dissolveAt(joins, seconds) : null
			drawFrame(context, deck.video, picture, transform, overlays, seconds, logo, blurScratch, {
				incoming: dissolve && incoming ? incoming.video : null,
				incomingAlpha: dissolve?.progress ?? 0,
				light: fadeLevelAt(joins, seconds),
				filter: filters[showing] ?? null,
				incomingFilter: filters[showing + 1] ?? null
			})
		}
		const draw = () => {
			paint()
			if (drawing) requestAnimationFrame(draw)
		}
		draw()
		await audio.resume()
		recorder = new MediaRecorder(
			new MediaStream([
				...canvas.captureStream(FRAME_RATE).getVideoTracks(),
				...destination.stream.getAudioTracks()
			]),
			{ mimeType }
		)
		const chunks: Blob[] = []
		recorder.ondataavailable = (event) => chunks.push(event.data)
		const stopped = nextEvent(recorder, 'stop')

		/** Segment `index`'s sound from now on `on`: its clip's level and its transitions. */
		const scheduleSound = (on: Deck, index: number) => {
			const segment = segments[index]
			if (!segment) return
			const at = audio.currentTime
			const from = starts[index] ?? 0
			on.clipLevel.gain.cancelScheduledValues(at)
			if (segment.audio) {
				scheduleClipGain(on.clipLevel.gain, segment.audio, at, 0, segmentSeconds(segment), 1)
			} else {
				on.clipLevel.gain.setValueAtTime(1, at)
			}
			on.mix.gain.cancelScheduledValues(at)
			scheduleTransitionGain(on.mix.gain, joins, index, at, from, from + segmentSeconds(segment))
		}

		const total = totalSeconds(segments)
		// Whether the segment about to start is already playing, dissolved in.
		let carried = false
		for (const [index, segment] of segments.entries()) {
			if (!deck) break
			showing = index
			const playing: Deck = deck
			const segmentStart = starts[index] ?? 0
			const span = segment.endSeconds - segment.startSeconds
			const rate = segment.rate ?? 1
			editedSeconds = () =>
				segmentStart +
				Math.min(span, Math.max(0, playing.video.currentTime - segment.startSeconds)) / rate
			if (!carried) {
				playing.video.currentTime = segment.startSeconds
				await nextEvent(playing.video, 'seeked')
				// The first frame of the segment, before the recorder sees anything.
				paint()
				if (recorder.state === 'inactive') recorder.start()
				else recorder.resume()
				playing.sourceSound.gain.value = segment.voiceOver ? 0 : 1
				playing.video.playbackRate = rate
				await playing.video.play()
				scheduleSound(playing, index)
			}
			carried = false
			// A dissolve into the next segment: the other deck waits at its start.
			const next = segments[index + 1]
			const dissolving = next?.transition?.kind === 'dissolve' && spare ? spare : null
			let ready: Promise<void> | null = null
			if (dissolving && next) {
				dissolving.video.currentTime = next.startSeconds
				dissolving.video.playbackRate = next.rate ?? 1
				dissolving.sourceSound.gain.value = 1
				ready = nextEvent(dissolving.video, 'seeked')
			}
			const overlapAt = starts[index + 1] ?? Infinity
			// Started with the picture, so the two run together from here.
			const take =
				segment.voiceOver && playTake(audio, playing.clipLevel, segment.voiceOver.replacement)
			while (playing.video.currentTime < segment.endSeconds && !playing.video.ended) {
				signal.throwIfAborted()
				onProgress(Math.min(1, editedSeconds() / total))
				if (dissolving && ready && !incoming && editedSeconds() >= overlapAt) {
					await ready
					await dissolving.video.play()
					scheduleSound(dissolving, index + 1)
					incoming = dissolving
				}
				await nextFrame()
			}
			playing.video.pause()
			if (take) {
				// The picture holds its last frame while the rest of the take plays.
				const holdStart = performance.now()
				editedSeconds = () => segmentStart + span + (performance.now() - holdStart) / 1000
				while (!take.ended) {
					signal.throwIfAborted()
					await nextFrame()
				}
			}
			if (incoming) {
				// The next clip is already playing: it takes over, still recording.
				;[deck, spare] = [incoming, playing]
				incoming = null
				carried = true
			} else {
				recorder.pause()
			}
		}
		recorder.stop()
		await stopped
		onProgress(1)
		return { blob: new Blob(chunks, { type: mimeType }), mimeType }
	} finally {
		drawing = false
		if (recorder && recorder.state !== 'inactive') recorder.stop()
		for (const deck of decks) closeDeck(deck)
		void audio.close()
		grades.remove()
	}
}
