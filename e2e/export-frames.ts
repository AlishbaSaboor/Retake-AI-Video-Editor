import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

// Reading an exported file, the one way every spec does it.
//
// The export records the edit in real time. On a starved machine (a slow CI
// runner, a laptop low on memory) it drops frames, and two things follow:
// seeking the file to a time lands on the nearest earlier frame that exists,
// up to ~0.3 s early (CI runs 61 and 75), and a frame's picture can be older
// than its timestamp. So no spec may assume the frame it asked for is the one
// it got: each reading carries the time of the frame actually shown
// (`shown`), and checks of something that moves are made against that time,
// over the lag window below.

/**
 * How much older than its timestamp an exported frame's picture can be, in
 * seconds. Measured: up to 0.16 s with the CPU throttled 8×, at least 0.105 s
 * on CI run 61, ~0.18 s on CI run 75; a quarter second leaves margin.
 */
export const FRAME_LAG_SECONDS = 0.25
/**
 * And how much newer: measured ~0.12 s with the CPU throttled 4× (a frame
 * stamped 0.106 s showing a title slide as at ~0.23 s).
 */
export const FRAME_LEAD_SECONDS = 0.15

/** Exports the edit and returns the file, once the download has started and the button is back. */
export async function exportVideo(page: Page): Promise<Buffer> {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	return bytes
}

/** What a reader gets: the canvas holding the frame, its size, and the times asked and shown. */
export type FrameContext = {
	context: CanvasRenderingContext2D
	width: number
	height: number
	/** The time asked for. */
	at: number
	/** The time of the frame actually shown: `at`, or earlier when frames were dropped. */
	shown: number
}

export type ExportFrame<T> = { at: number; shown: number } & T

export type ExportFrames<T> = {
	/** The file's length, in seconds. */
	seconds: number
	/** The file's own picture size. */
	videoWidth: number
	videoHeight: number
	frames: ExportFrame<T>[]
}

/**
 * Reads the frames of an exported file at `times`, in the page. For each
 * time it seeks, waits for the frame the browser actually presents and its
 * time, draws it on a canvas (`size`, or the video's own size) and runs
 * `read` on it. `read` runs in the page, sent as source: it must use nothing
 * from outside its own body but `args`, passed in alongside. Its result is
 * spread into the frame's reading.
 */
export async function readExportFrames<T extends Record<string, unknown>, A = undefined>(
	page: Page,
	bytes: Buffer,
	times: number[],
	read: (frame: FrameContext, args: A) => T,
	{ size, args }: { size?: { width: number; height: number }; args?: A } = {}
): Promise<ExportFrames<T>> {
	return page.evaluate(
		async ({ bytes, times, readSource, size, args }) => {
			const read = new Function(`return (${readSource})`)() as (
				frame: unknown,
				args: unknown
			) => unknown
			const video = Object.assign(document.createElement('video'), {
				src: URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' })),
				muted: true
			})
			// In the page (tiny, nearly invisible), so frames are presented and reported.
			video.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;opacity:0.01'
			document.body.append(video)
			const next = (type: string) =>
				new Promise((resolve) => video.addEventListener(type, resolve, { once: true }))
			await next('loadedmetadata')
			// A recorder's WebM has no duration until the whole file is scanned.
			if (!Number.isFinite(video.duration)) {
				video.currentTime = 1e9
				while (!Number.isFinite(video.duration)) await next('durationchange')
			}
			const width = size?.width ?? video.videoWidth
			const height = size?.height ?? video.videoHeight
			const canvas = Object.assign(document.createElement('canvas'), { width, height })
			const context = canvas.getContext('2d', { willReadFrequently: true })
			if (!context) throw new Error('no 2d context')
			const frames = []
			for (const at of times) {
				// The frame presented for this seek, and its own time: not always `at`.
				const presented = new Promise<number>((resolve) => {
					video.requestVideoFrameCallback((_, frame) => resolve(frame.mediaTime))
					setTimeout(() => resolve(Number.NaN), 3000)
				})
				video.currentTime = at
				await next('seeked')
				const reported = await presented
				const shown = Number.isFinite(reported) ? +reported.toFixed(3) : video.currentTime
				context.drawImage(video, 0, 0, width, height)
				frames.push({ at, shown, ...(read({ context, width, height, at, shown }, args) as object) })
			}
			video.remove()
			URL.revokeObjectURL(video.src)
			return {
				seconds: +video.duration.toFixed(2),
				videoWidth: video.videoWidth,
				videoHeight: video.videoHeight,
				frames
			}
		},
		{ bytes: [...bytes], times, readSource: read.toString(), size, args }
	) as Promise<ExportFrames<T>>
}

/**
 * Reads an exported file's sound: at each of `times`, the level of each of
 * `tones` (name → Hz) over `window` seconds around it (0.1 s unless given),
 * as a share of `amplitude`.
 * The sound doesn't drop like frames do, so it's read at the times asked.
 */
export async function readToneLevels<K extends string>(
	page: Page,
	bytes: Buffer,
	times: number[],
	tones: Record<K, number>,
	amplitude: number,
	window = 0.1
): Promise<Record<K, number>[]> {
	const named: Record<string, number> = tones
	return page.evaluate(
		async ({ bytes, times, tones, amplitude, half }) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			const level = (at: number, hz: number) => {
				const from = Math.max(0, Math.floor((at - half) * audio.sampleRate))
				const to = Math.min(samples.length, Math.floor((at + half) * audio.sampleRate))
				const w = (2 * Math.PI * hz) / audio.sampleRate
				let re = 0
				let im = 0
				for (let i = from; i < to; i++) {
					re += (samples[i] ?? 0) * Math.cos(w * i)
					im += (samples[i] ?? 0) * Math.sin(w * i)
				}
				return (2 * Math.hypot(re, im)) / Math.max(1, to - from) / amplitude
			}
			return times.map((at) =>
				Object.fromEntries(
					Object.entries(tones).map(([name, hz]) => [name, +level(at, hz).toFixed(3)])
				)
			)
		},
		{ bytes: [...bytes], times, tones: named, amplitude, half: window / 2 }
	) as Promise<Record<K, number>[]>
}

/**
 * The range a value that changes over time can show in a frame shown at
 * `shown`: its smallest and largest over the frame's window, from
 * FRAME_LAG_SECONDS before that time to FRAME_LEAD_SECONDS after, in 10 ms steps.
 */
export function rangeOverLag(shown: number, valueAt: (seconds: number) => number) {
	const steps = Math.round((FRAME_LAG_SECONDS + FRAME_LEAD_SECONDS) * 100)
	const values = Array.from({ length: steps + 1 }, (_, i) =>
		valueAt(shown - FRAME_LAG_SECONDS + i * 0.01)
	)
	return { min: Math.min(...values), max: Math.max(...values) }
}

/** Whether every moment a frame shown at `shown` could hold is at or after `seconds`. */
export const surelyAfter = (shown: number, seconds: number) => shown - FRAME_LAG_SECONDS >= seconds
/** Whether every moment it could hold is before `seconds`. */
export const surelyBefore = (shown: number, seconds: number) => shown + FRAME_LEAD_SECONDS < seconds
