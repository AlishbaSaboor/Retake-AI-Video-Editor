import type { SourceRange } from './sequence'

// Exporting re-records the edit in real time: an offscreen copy of the take
// plays each kept segment in order while a MediaRecorder captures its frames
// (drawn onto a canvas) and its sound (routed through Web Audio, so nothing
// is heard). Recording pauses across the jump between segments, so the file
// holds exactly what plays. Chosen over ffmpeg.wasm (a ~30 MB download) and
// server-side encoding (uploading the whole take): no dependency, and the
// footage never leaves the browser — at the cost of taking as long as the
// edit runs, with the tab in front, since hidden tabs stop drawing frames.

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
export function totalSeconds(segments: SourceRange[]): number {
	return segments.reduce((sum, s) => sum + s.endSeconds - s.startSeconds, 0)
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

/**
 * Plays `segments` of the video at `url` in order and records them into one
 * file. Only call where canExport() is true. `onProgress` gets the fraction
 * done; aborting `signal` stops early and rejects with its reason.
 */
export async function recordEdit(
	url: string,
	segments: SourceRange[],
	{ onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal }
): Promise<{ blob: Blob; mimeType: string }> {
	const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
	if (!mimeType) throw new Error('no recordable video format')
	const video = Object.assign(document.createElement('video'), {
		src: url,
		preload: 'auto',
		playsInline: true
	})
	const audio = new AudioContext()
	let recorder: MediaRecorder | null = null
	let drawing = true
	try {
		await nextEvent(video, 'loadeddata')
		const canvas = Object.assign(document.createElement('canvas'), {
			width: video.videoWidth,
			height: video.videoHeight
		})
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d canvas context')
		const draw = () => {
			context.drawImage(video, 0, 0, canvas.width, canvas.height)
			if (drawing) requestAnimationFrame(draw)
		}
		draw()
		const destination = audio.createMediaStreamDestination()
		audio.createMediaElementSource(video).connect(destination)
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
			video.currentTime = segment.startSeconds
			await nextEvent(video, 'seeked')
			// The first frame of the segment, before the recorder sees anything.
			context.drawImage(video, 0, 0, canvas.width, canvas.height)
			if (recorder.state === 'inactive') recorder.start()
			else recorder.resume()
			await video.play()
			while (video.currentTime < segment.endSeconds && !video.ended) {
				signal.throwIfAborted()
				onProgress((done + video.currentTime - segment.startSeconds) / total)
				await nextFrame()
			}
			video.pause()
			recorder.pause()
			done += segment.endSeconds - segment.startSeconds
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
