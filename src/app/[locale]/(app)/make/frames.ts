// The small pictures Make it sends to Gemini with the transcript: one every
// 2 seconds, taken in the browser from the picked file by seeking a hidden
// <video> and drawing it on a canvas. Small on purpose: enough to see what
// is on screen and where a face is, at a few kilobytes and a fixed token
// cost each.

import { MAX_FRAME_BASE64_LENGTH } from './make-plan'

/** The longer side of each picture, in pixels. */
const FRAME_SIDE = 256
/**
 * JPEG qualities tried in turn until a picture fits MAX_FRAME_BASE64_LENGTH:
 * the first nearly always does; a very busy picture needs a lower one.
 */
const JPEG_QUALITIES = [0.7, 0.5, 0.35, 0.2, 0.1]

/** The canvas as a JPEG, base64 without its data: prefix, at the best quality that fits. */
function encodeFrame(canvas: HTMLCanvasElement): string {
	let frame = ''
	for (const quality of JPEG_QUALITIES) {
		frame = canvas.toDataURL('image/jpeg', quality).replace(/^data:[^,]*,/, '')
		if (frame.length <= MAX_FRAME_BASE64_LENGTH) break
	}
	return frame
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
	return new Promise((resolve, reject) => {
		video.addEventListener('seeked', () => resolve(), { once: true })
		video.addEventListener('error', () => reject(new Error('the video could not be read')), {
			once: true
		})
		video.currentTime = seconds
	})
}

/** A JPEG of the video at each of `times`, base64 without its data: prefix. */
export async function captureFrames(url: string, times: readonly number[]): Promise<string[]> {
	const video = Object.assign(document.createElement('video'), {
		src: url,
		muted: true,
		preload: 'auto'
	})
	try {
		await seek(video, times[0] ?? 0)
		const scale = FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight)
		const canvas = Object.assign(document.createElement('canvas'), {
			width: Math.max(2, Math.round(video.videoWidth * scale)),
			height: Math.max(2, Math.round(video.videoHeight * scale))
		})
		const context = canvas.getContext('2d')
		if (!context) throw new Error('no 2d canvas context')
		const frames: string[] = []
		for (const [index, seconds] of times.entries()) {
			if (index > 0) await seek(video, seconds)
			context.drawImage(video, 0, 0, canvas.width, canvas.height)
			frames.push(encodeFrame(canvas))
		}
		return frames
	} finally {
		video.removeAttribute('src')
		video.load()
	}
}

/** The pixels (RGBA) of each picture captureFrames took, for reading the video's colours. */
export async function framePixels(frames: readonly string[]): Promise<Uint8ClampedArray[]> {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d', { willReadFrequently: true })
	if (!context) return []
	const pixels: Uint8ClampedArray[] = []
	for (const frame of frames) {
		const image = new Image()
		image.src = `data:image/jpeg;base64,${frame}`
		await image.decode()
		canvas.width = image.naturalWidth
		canvas.height = image.naturalHeight
		context.drawImage(image, 0, 0)
		pixels.push(context.getImageData(0, 0, canvas.width, canvas.height).data)
	}
	return pixels
}
