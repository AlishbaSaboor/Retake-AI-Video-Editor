'use client'

import { useQuery } from '@tanstack/react-query'
import { VideoIcon } from '@/components/ui/icons'
import { projectVideo } from '@/app/[locale]/editor/projects'

// The picture is taken this far in, or half way through a shorter video:
// the very first frame is often black.
const PREVIEW_SECONDS = 1
const PREVIEW_WIDTH = 480

/** A still of the project's video, drawn in the browser from the copy saved with it. */
async function previewOf(id: string): Promise<string | null> {
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
		return canvas.toDataURL('image/jpeg', 0.8)
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
		<div className="bg-surface-inset relative flex aspect-video items-center justify-center overflow-hidden">
			{preview.data ? (
				// A data URL drawn in the browser: next/image has nothing to optimise.
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={preview.data}
					alt=""
					className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
				/>
			) : (
				<VideoIcon
					size={32}
					className={preview.isPending ? 'text-text-faint animate-pulse' : 'text-text-faint'}
				/>
			)}
		</div>
	)
}
