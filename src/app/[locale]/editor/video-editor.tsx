'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ReplaceIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { Timeline } from './timeline'
import {
	clampToTrim,
	isKnownDuration,
	moveTrimEdge,
	type TrimEdge,
	type TrimRange
} from './timeline-scale'
import { UploadDropzone } from './upload-dropzone'
import { VideoFileInput } from './video-file-input'

type LoadedVideo = { url: string; name: string }

// Pressing play this close to the out-point counts as "at the end" and
// restarts from the in-point, rather than playing a frame and stopping.
const END_TOLERANCE_SECONDS = 0.05

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
	// Null until the user first drags a handle, meaning "the whole clip".
	const [trim, setTrim] = useState<TrimRange | null>(null)
	const hasDuration = isKnownDuration(durationSeconds)
	const range: TrimRange = trim ?? { startSeconds: 0, endSeconds: durationSeconds }
	const trimEnd = hasDuration ? range.endSeconds : Infinity

	const videoUrl = video?.url
	// An object URL pins the whole file in memory until it's revoked, so each
	// one is released as soon as it's replaced or the editor unmounts.
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter. While playing, follow the video every animation frame instead —
	// which is also where playback stops at the trim's out-point.
	useEffect(() => {
		if (!isPlaying) return
		let frame = 0
		const follow = () => {
			const element = videoRef.current
			if (element) {
				if (element.currentTime >= trimEnd) {
					element.pause()
					element.currentTime = trimEnd
				}
				setCurrentTimeSeconds(element.currentTime)
			}
			frame = requestAnimationFrame(follow)
		}
		frame = requestAnimationFrame(follow)
		return () => cancelAnimationFrame(frame)
	}, [isPlaying, trimEnd])

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
		setTrim(null)
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
		const target = clampToTrim(seconds, range)
		element.currentTime = target
		setCurrentTimeSeconds(target)
	}

	// Pauses on the moved edge so the preview shows the new cut frame.
	function handleTrimChange(edge: TrimEdge, seconds: number) {
		const next = moveTrimEdge(range, edge, seconds, durationSeconds)
		const previewAt = edge === 'start' ? next.startSeconds : next.endSeconds
		setTrim(next)
		// Not through seek(): that clamps to the range from before this move.
		const element = videoRef.current
		if (element) {
			element.pause()
			element.currentTime = previewAt
		}
		setCurrentTimeSeconds(previewAt)
	}

	// Keeps the native controls inside the trim too: scrubbing past an edge
	// snaps back to it, and pressing play at the out-point starts over.
	function handleTimeUpdate(element: HTMLVideoElement) {
		if (isProbingDurationRef.current) return
		if (hasDuration) {
			const clamped = clampToTrim(element.currentTime, range)
			if (clamped !== element.currentTime) element.currentTime = clamped
		}
		setCurrentTimeSeconds(element.currentTime)
	}

	function handlePlay(element: HTMLVideoElement) {
		setIsPlaying(true)
		if (hasDuration && element.currentTime >= range.endSeconds - END_TOLERANCE_SECONDS) {
			element.currentTime = range.startSeconds
		}
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
						onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
						onPlay={(event) => handlePlay(event.currentTarget)}
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
				trim={range}
				onSeek={seek}
				onTrimChange={handleTrimChange}
			/>
		</div>
	)
}
