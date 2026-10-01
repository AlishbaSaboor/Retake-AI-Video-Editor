'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ReplaceIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { Timeline } from './timeline'
import { isKnownDuration } from './timeline-scale'
import { UploadDropzone } from './upload-dropzone'
import { VideoFileInput } from './video-file-input'

type LoadedVideo = { url: string; name: string }

/**
 * Pick a video, watch it, scrub it on the timeline. Everything here is local
 * to the browser: the file is played from an object URL and never leaves the
 * machine. Persisting it (storage + a Prisma row) comes once the database is
 * wired up.
 */
export function VideoEditor() {
	const t = useTranslations('Editor')
	const videoRef = useRef<HTMLVideoElement>(null)
	const [video, setVideo] = useState<LoadedVideo | null>(null)
	const [durationSeconds, setDurationSeconds] = useState(0)
	const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0)
	const [isPlaying, setIsPlaying] = useState(false)
	// Browser recordings (MediaRecorder WebM — what re-recording a take will
	// produce) carry no duration header, so they report Infinity until the
	// whole file has been scanned. Seeking far past the end forces that scan;
	// durationchange then reports the real length and the playhead goes back
	// to the start. True while that probe is in flight.
	const isProbingDurationRef = useRef(false)

	const videoUrl = video?.url
	// An object URL pins the whole file in memory until it's revoked, so each
	// one is released as soon as it's replaced or the editor unmounts.
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter. While playing, follow the video every animation frame instead.
	useEffect(() => {
		if (!isPlaying) return
		let frame = 0
		const follow = () => {
			const element = videoRef.current
			if (element) setCurrentTimeSeconds(element.currentTime)
			frame = requestAnimationFrame(follow)
		}
		frame = requestAnimationFrame(follow)
		return () => cancelAnimationFrame(frame)
	}, [isPlaying])

	function loadFile(file: File) {
		if (!file.type.startsWith('video/')) {
			toast({
				variant: 'destructive',
				title: t('notAVideo.title'),
				description: t('notAVideo.description', { name: file.name })
			})
			return
		}
		isProbingDurationRef.current = false
		setVideo({ url: URL.createObjectURL(file), name: file.name })
		setDurationSeconds(0)
		setCurrentTimeSeconds(0)
		setIsPlaying(false)
	}

	function handleLoadedMetadata(element: HTMLVideoElement) {
		if (isKnownDuration(element.duration)) {
			setDurationSeconds(element.duration)
			return
		}
		isProbingDurationRef.current = true
		element.currentTime = Number.MAX_SAFE_INTEGER
	}

	function handleDurationChange(element: HTMLVideoElement) {
		if (!isKnownDuration(element.duration)) return
		setDurationSeconds(element.duration)
		if (isProbingDurationRef.current) {
			isProbingDurationRef.current = false
			element.currentTime = 0
			setCurrentTimeSeconds(0)
		}
	}

	function seek(seconds: number) {
		const element = videoRef.current
		if (!element) return
		element.currentTime = seconds
		setCurrentTimeSeconds(seconds)
	}

	return (
		<div className="flex flex-col gap-6">
			{video ? (
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-4">
						<p className="text-text truncate text-sm font-medium">{video.name}</p>
						<Button
							asChild
							variant="outline"
							size="sm"
							className="has-[:focus-visible]:outline-accent shrink-0 cursor-pointer has-[:focus-visible]:outline-2"
						>
							<label>
								<ReplaceIcon />
								{t('replace')}
								<VideoFileInput onFile={loadFile} />
							</label>
						</Button>
					</div>
					<video
						key={video.url}
						ref={videoRef}
						src={video.url}
						controls
						playsInline
						className="aspect-video w-full rounded-lg bg-black"
						onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
						onDurationChange={(event) => handleDurationChange(event.currentTarget)}
						onTimeUpdate={(event) => {
							if (isProbingDurationRef.current) return
							setCurrentTimeSeconds(event.currentTarget.currentTime)
						}}
						onPlay={() => setIsPlaying(true)}
						onPause={() => setIsPlaying(false)}
						onError={() => {
							toast({
								variant: 'destructive',
								title: t('unplayable.title'),
								description: t('unplayable.description', { name: video.name })
							})
							setVideo(null)
						}}
					/>
				</div>
			) : (
				<UploadDropzone onFile={loadFile} />
			)}
			<Timeline
				clipName={video?.name ?? null}
				durationSeconds={durationSeconds}
				currentTimeSeconds={currentTimeSeconds}
				onSeek={seek}
			/>
		</div>
	)
}
