import type { Size } from './transform'

// More videos than the first in one project. The first video uploaded is the
// main one: the transcript, captions, clean-up, re-recording and the audio
// checks are its own (transcribing more would cost an API call each). Added
// videos come in as clips after the others, each with a trim of its own, and
// play through the same clip tools: split, reorder, speed, color,
// transitions. A clip's `source` names its video; absent is the main one.
// A video of another shape is fitted whole into the main one's frame
// (letterboxed), in the preview and the export alike.

/** A video added to the project: its file, a URL to play it from, and its length and picture. */
export type AddedVideo = {
	id: string
	name: string
	file: File
	url: string
	durationSeconds: number
	width: number
	height: number
}

/**
 * Where a `source`-sized picture sits fitted whole inside a `frame`-sized
 * one, centred: what a <video>'s default `object-fit: contain` does.
 */
export function fitRect(source: Size, frame: Size) {
	const scale = Math.min(frame.width / source.width, frame.height / source.height)
	const width = source.width * scale
	const height = source.height * scale
	return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height }
}

/**
 * Reads a picked video's length and picture size from a throwaway player.
 * A MediaRecorder file reports Infinity until the whole file has been
 * scanned, which seeking far past the end forces (as the editor does for the
 * main video). Null when it isn't a playable video.
 */
export async function probeVideo(
	file: File
): Promise<Omit<AddedVideo, 'id' | 'name' | 'file'> | null> {
	const url = URL.createObjectURL(file)
	const video = Object.assign(document.createElement('video'), {
		src: url,
		preload: 'metadata',
		muted: true
	})
	const next = (type: string) =>
		new Promise<boolean>((resolve) => {
			video.addEventListener(type, () => resolve(true), { once: true })
			video.addEventListener('error', () => resolve(false), { once: true })
		})
	try {
		if (!(await next('loadedmetadata'))) {
			URL.revokeObjectURL(url)
			return null
		}
		if (!Number.isFinite(video.duration)) {
			video.currentTime = Number.MAX_SAFE_INTEGER
			while (!Number.isFinite(video.duration)) {
				if (!(await next('durationchange'))) break
			}
		}
		if (!Number.isFinite(video.duration) || video.videoWidth === 0) {
			URL.revokeObjectURL(url)
			return null
		}
		return {
			url,
			durationSeconds: video.duration,
			width: video.videoWidth,
			height: video.videoHeight
		}
	} finally {
		video.removeAttribute('src')
		video.load()
	}
}
