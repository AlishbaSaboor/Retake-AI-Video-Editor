import { scheduleClipGain } from './clip-audio'
import { drawFrame, type Overlays } from './overlays'
import { scheduleTakeGain, type ReplacementTake } from './re-record'
import { segmentSeconds, type Segment } from './sequence'
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

/** How long the export plays for: the segments laid end to end. */
export function totalSeconds(segments: Segment[]): number {
	return segments.reduce((sum, s) => sum + segmentSeconds(s), 0)
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

/**
 * Plays `segments` of the video at `url` in order and records them into one
 * file, its picture through `transform` (flipped, turned, cropped) and with
 * `overlays` drawn over it. Only call where canExport() is true.
 * `onProgress` gets the fraction done; aborting `signal` stops early and
 * rejects with its reason.
 */
export async function recordEdit(
	url: string,
	segments: Segment<ReplacementTake>[],
	overlays: Overlays,
	transform: PictureTransform,
	{ onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal }
): Promise<{ blob: Blob; mimeType: string }> {
	const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
	if (!mimeType) throw new Error('no recordable video format')
	const video = Object.assign(document.createElement('video'), {
		src: url,
		preload: 'auto',
		playsInline: true,
		// A sped-up or slowed clip keeps its pitch (measured: 440 Hz stays
		// 434–445 Hz from 0.25x to 4x).
		preservesPitch: true
	})
	const audio = new AudioContext()
	let recorder: MediaRecorder | null = null
	let drawing = true
	try {
		await nextEvent(video, 'loadeddata')
		const logo = await loadLogo(overlays)
		const picture = { width: video.videoWidth, height: video.videoHeight }
		const canvas = Object.assign(
			document.createElement('canvas'),
			evenPixels(outputSize(picture, transform))
		)
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d canvas context')
		const blurScratch = document.createElement('canvas')
		// Where the frame being drawn is in the edited video; set per segment below.
		let editedSeconds = () => 0
		const paint = () => {
			drawFrame(context, video, picture, transform, overlays, editedSeconds(), logo, blurScratch)
		}
		const draw = () => {
			paint()
			if (drawing) requestAnimationFrame(draw)
		}
		draw()
		const destination = audio.createMediaStreamDestination()
		// The clip's volume and fades, over the source's sound and any take alike.
		const clipLevel = audio.createGain()
		clipLevel.connect(destination)
		const sourceSound = audio.createGain()
		audio.createMediaElementSource(video).connect(sourceSound).connect(clipLevel)
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

		const total = totalSeconds(segments)
		let done = 0
		for (const segment of segments) {
			const segmentStart = done
			const span = segment.endSeconds - segment.startSeconds
			const rate = segment.rate ?? 1
			editedSeconds = () =>
				segmentStart + Math.min(span, Math.max(0, video.currentTime - segment.startSeconds)) / rate
			video.currentTime = segment.startSeconds
			await nextEvent(video, 'seeked')
			// The first frame of the segment, before the recorder sees anything.
			paint()
			if (recorder.state === 'inactive') recorder.start()
			else recorder.resume()
			sourceSound.gain.value = segment.voiceOver ? 0 : 1
			video.playbackRate = rate
			await video.play()
			const at = audio.currentTime
			clipLevel.gain.cancelScheduledValues(at)
			if (segment.audio) {
				scheduleClipGain(clipLevel.gain, segment.audio, at, 0, segmentSeconds(segment), 1)
			} else {
				clipLevel.gain.setValueAtTime(1, at)
			}
			// Started with the picture, so the two run together from here.
			const take = segment.voiceOver && playTake(audio, clipLevel, segment.voiceOver.replacement)
			while (video.currentTime < segment.endSeconds && !video.ended) {
				signal.throwIfAborted()
				onProgress((done + (video.currentTime - segment.startSeconds) / rate) / total)
				await nextFrame()
			}
			video.pause()
			if (take) {
				// The picture holds its last frame while the rest of the take plays.
				const holdStart = performance.now()
				editedSeconds = () => segmentStart + span + (performance.now() - holdStart) / 1000
				while (!take.ended) {
					signal.throwIfAborted()
					await nextFrame()
				}
			}
			recorder.pause()
			done += segmentSeconds(segment)
		}
		recorder.stop()
		await stopped
		onProgress(1)
		return { blob: new Blob(chunks, { type: mimeType }), mimeType }
	} finally {
		drawing = false
		if (recorder && recorder.state !== 'inactive') recorder.stop()
		video.pause()
		video.removeAttribute('src')
		video.load()
		void audio.close()
	}
}
