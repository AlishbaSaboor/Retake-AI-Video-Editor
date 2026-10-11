'use client'

import { useQuery } from '@tanstack/react-query'
import { VideoIcon } from '@/components/ui/icons'
import { projectVideo } from '@/app/[locale]/editor/projects/projects'
import { formatTimecode } from '@/app/[locale]/editor/model/timeline-scale'

// The picture is taken this far in, or half way through a shorter video:
// the very first frame is often black.
const PREVIEW_SECONDS = 1
const PREVIEW_WIDTH = 480

/** The project's picture (a data URL) and its video's length, read from the copy saved with it. */
type Preview = { src: string; seconds: number | null }

/** A still of the project's video, drawn in the browser from the copy saved with it. */
async function previewOf(id: string): Promise<Preview | null> {
	const file = await projectVideo(id)
	if (!file) return null
	const url = URL.createObjectURL(file)
	const video = Object.assign(document.createElement('video'), { src: url, muted: true })
	const next = (type: string) =>
		new Promise<void>((resolve, reject) => {
			video.addEventListener(type, () => resolve(), { once: true })
			video.addEventListener('error', () => reject(new Error('preview failed')), { once: true })
		})
	try {
		await next('loadedmetadata')
		const duration = Number.isFinite(video.duration) ? video.duration : PREVIEW_SECONDS * 2
		video.currentTime = Math.min(PREVIEW_SECONDS, duration / 2)
		await next('seeked')
		const width = Math.min(PREVIEW_WIDTH, video.videoWidth)
		const height = Math.round((width / video.videoWidth) * video.videoHeight)
		const canvas = Object.assign(document.createElement('canvas'), { width, height })
		canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
		return {
			src: canvas.toDataURL('image/jpeg', 0.8),
			seconds: Number.isFinite(video.duration) ? video.duration : null
		}
	} catch {
		return null
	} finally {
		URL.revokeObjectURL(url)
	}
}

export function ProjectThumbnail({ id, savedAt }: { id: string; savedAt: number }) {
	// Keyed on the save time too: a project saved again gets a new picture.
	const preview = useQuery({
		queryKey: ['project-preview', id, savedAt],
		queryFn: () => previewOf(id),
		staleTime: Infinity
	})
	return (
		<div className="bg-surface-inset relative flex aspect-[16/10] items-center justify-center overflow-hidden">
			{preview.data ? (
				// A data URL drawn in the browser: next/image has nothing to optimise.
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={preview.data.src}
					alt=""
					className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
				/>
			) : (
				<VideoIcon
					size={32}
					className={preview.isPending ? 'text-text-faint animate-pulse' : 'text-text-faint'}
				/>
			)}
			<span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/55 to-transparent" />
			{preview.data?.seconds != null && (
				<span className="absolute right-3 bottom-3 rounded-[5px] bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
					{formatTimecode(preview.data.seconds)}
				</span>
			)}
		</div>
	)
}
