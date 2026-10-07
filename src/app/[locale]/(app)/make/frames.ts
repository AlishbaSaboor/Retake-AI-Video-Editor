// The small pictures Make it sends to Gemini with the transcript: one every
// 2 seconds, taken in the browser from the picked file by seeking a hidden
// <video> and drawing it on a canvas. Small on purpose: enough to see what
// is on screen and where a face is, at a few kilobytes and a fixed token
// cost each.

/** The longer side of each picture, in pixels. */
const FRAME_SIDE = 256
const JPEG_QUALITY = 0.7

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
			frames.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY).replace(/^data:[^,]*,/, ''))
		}
		return frames
	} finally {
		video.removeAttribute('src')
		video.load()
	}
}
