'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ReplaceIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { keptSeconds, mergeCuts, planCleanup, skipCuts, type Cut, type Edit } from './cleanup'
import { CleanupBar } from './cleanup-bar'
import { CommandBar } from './command-bar'
import { FillerCutEditor } from './filler-cut-editor'
import { cutEditorWindow, initialCutRange, moveCutEdge, type FillerPlan } from './filler-cuts'
import { Timeline } from './timeline'
import {
	clampToTrim,
	isKnownDuration,
	moveTrimEdge,
	type TrimEdge,
	type TrimRange
} from './timeline-scale'
import { TranscriptPanel } from './transcript-panel'
import { UploadDropzone } from './upload-dropzone'
import { useTakeAnalysis } from './use-take-analysis'
import { VideoFileInput } from './video-file-input'

type LoadedVideo = { file: File; url: string; name: string }

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
	const analysis = useTakeAnalysis(video)
	// Source ranges playback skips, from "Clean up recording". Like trim, a
	// cut never touches the file; `undoEdit` is the edit from just before
	// the last clean-up, restored in one step by Undo.
	const [cuts, setCuts] = useState<Cut[]>([])
	const [undoEdit, setUndoEdit] = useState<Edit | null>(null)
	const edit: Edit = { trim: range, cuts }
	const fillerCuts = analysis.fillerPlans.flatMap((plan) => (plan.kind === 'cut' ? [plan] : []))
	const cleanupPlan = planCleanup(
		edit,
		{ silences: analysis.silences, fillerCuts },
		durationSeconds
	)
	const removableSeconds = keptSeconds(edit) - keptSeconds(cleanupPlan)
	// The filler cut editor: which filler is open and where its handles sit.
	// While "Play with cut" previews, the pending cut is skipped like a real
	// one, and preview playback stops at the end of the editor's window.
	const [cutEditor, setCutEditor] = useState<{ plan: FillerPlan; range: TrimRange } | null>(null)
	const [preview, setPreview] = useState<{ endSeconds: number; withCut: boolean } | null>(null)
	const cutWindow = cutEditor ? cutEditorWindow(cutEditor.plan.filler, durationSeconds) : null
	const playbackCuts = preview?.withCut && cutEditor ? mergeCuts([...cuts, cutEditor.range]) : cuts
	const stopAt = preview ? Math.min(trimEnd, preview.endSeconds) : trimEnd

	const videoUrl = video?.url
	// An object URL pins the whole file in memory until it's revoked, so each
	// one is released as soon as it's replaced or the editor unmounts.
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

	// `timeupdate` only fires a few times a second, which makes the playhead
	// stutter. While playing, follow the video every animation frame instead —
	// which is also where playback jumps over cuts and stops at the trim's
	// out-point.
	useEffect(() => {
		if (!isPlaying) return
		let frame = 0
		const follow = () => {
			const element = videoRef.current
			if (element) {
				const pastCut = skipCuts(element.currentTime, playbackCuts)
				if (pastCut !== element.currentTime) element.currentTime = pastCut
				if (element.currentTime >= stopAt) {
					element.pause()
					element.currentTime = stopAt
				}
				setCurrentTimeSeconds(element.currentTime)
			}
			frame = requestAnimationFrame(follow)
		}
		frame = requestAnimationFrame(follow)
		return () => cancelAnimationFrame(frame)
	}, [isPlaying, stopAt, playbackCuts])

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
		setCuts([])
		setUndoEdit(null)
		setCutEditor(null)
		setPreview(null)
		setVideo({ file, url: URL.createObjectURL(file), name: file.name })
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
		const target = skipCuts(clampToTrim(seconds, range), cuts)
		element.currentTime = target
		setCurrentTimeSeconds(target)
	}

	// Sets a new trim and pauses on the given frame so the preview shows the
	// cut. Not through seek(): that clamps to the range from before this change.
	function applyTrim(next: TrimRange, previewAt: number) {
		setTrim(next)
		const element = videoRef.current
		if (element) {
			element.pause()
			element.currentTime = previewAt
		}
		setCurrentTimeSeconds(previewAt)
	}

	function openCutEditor(plan: FillerPlan) {
		setCutEditor({ plan, range: initialCutRange(plan) })
		setPreview(null)
		videoRef.current?.pause()
		seek(cutEditorWindow(plan.filler, durationSeconds).startSeconds)
	}

	function moveCutEditorEdge(edge: TrimEdge, seconds: number) {
		if (!cutEditor || !cutWindow) return
		setCutEditor({ ...cutEditor, range: moveCutEdge(cutEditor.range, edge, seconds, cutWindow) })
	}

	// Plays just the editor's window — with the pending cut skipped, or as
	// recorded — so the cut can be judged by ear before it's made.
	function playCutPreview(withCut: boolean) {
		const element = videoRef.current
		if (!element || !cutWindow) return
		setPreview({ endSeconds: cutWindow.endSeconds, withCut })
		element.currentTime = cutWindow.startSeconds
		setCurrentTimeSeconds(cutWindow.startSeconds)
		element.play().catch(() => setPreview(null))
	}

	// One step on the same undo as clean-up: Undo restores the edit from
	// just before this cut.
	function applyFillerCut() {
		if (!cutEditor) return
		videoRef.current?.pause()
		setUndoEdit(edit)
		setCuts(mergeCuts([...cuts, cutEditor.range]))
		setCutEditor(null)
		setPreview(null)
	}

	function closeCutEditor() {
		videoRef.current?.pause()
		setCutEditor(null)
		setPreview(null)
	}

	function applyCleanup() {
		setUndoEdit(edit)
		setCuts(cleanupPlan.cuts)
		applyTrim(cleanupPlan.trim, cleanupPlan.trim.startSeconds)
	}

	function undoCleanup() {
		if (!undoEdit) return
		setCuts(undoEdit.cuts)
		applyTrim(undoEdit.trim, undoEdit.trim.startSeconds)
		setUndoEdit(null)
	}

	function handleTrimChange(edge: TrimEdge, seconds: number) {
		const next = moveTrimEdge(range, edge, seconds, durationSeconds)
		applyTrim(next, edge === 'start' ? next.startSeconds : next.endSeconds)
	}

	// Keeps the native controls inside the edit too: scrubbing past a trim
	// edge snaps back to it, landing in a cut skips past it, and pressing play
	// at the out-point starts over.
	function handleTimeUpdate(element: HTMLVideoElement) {
		if (isProbingDurationRef.current) return
		if (hasDuration) {
			const allowed = skipCuts(clampToTrim(element.currentTime, range), playbackCuts)
			if (allowed !== element.currentTime) element.currentTime = allowed
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
		<div className="flex flex-col gap-4">
			{video ? (
				<div className="flex flex-col gap-4">
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
					{hasDuration && (
						<CommandBar
							durationSeconds={durationSeconds}
							onTrim={(next) => applyTrim(next, next.startSeconds)}
						/>
					)}
					<div className="border-border mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border bg-black shadow-2xl">
						<video
							key={video.url}
							ref={videoRef}
							src={video.url}
							controls
							playsInline
							className="block aspect-video w-full bg-black"
							onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
							onDurationChange={(event) => handleDurationChange(event.currentTarget)}
							onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
							onPlay={(event) => handlePlay(event.currentTarget)}
							onPause={() => {
								setIsPlaying(false)
								setPreview(null)
							}}
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
				</div>
			) : (
				<UploadDropzone onFile={loadFile} />
			)}
			{video && hasDuration && (
				<CleanupBar
					removableSeconds={removableSeconds}
					silenceCount={analysis.silences.length}
					fillerCutCount={fillerCuts.length}
					fillerReviewCount={analysis.fillerPlans.length - fillerCuts.length}
					canUndo={undoEdit !== null}
					onApply={applyCleanup}
					onUndo={undoCleanup}
				/>
			)}
			<Timeline
				clipName={video?.name ?? null}
				durationSeconds={durationSeconds}
				currentTimeSeconds={currentTimeSeconds}
				trim={range}
				cuts={cuts}
				silences={analysis.silences}
				fillerPlans={analysis.fillerPlans}
				onSeek={seek}
				onTrimChange={handleTrimChange}
				onEditFiller={openCutEditor}
			/>
			{cutEditor && cutWindow && analysis.loudness && (
				<FillerCutEditor
					plan={cutEditor.plan}
					window={cutWindow}
					range={cutEditor.range}
					loudness={analysis.loudness}
					currentTimeSeconds={currentTimeSeconds}
					onRangeChange={moveCutEditorEdge}
					onPlay={playCutPreview}
					onApply={applyFillerCut}
					onCancel={closeCutEditor}
				/>
			)}
			{video && <TranscriptPanel state={analysis.transcript} onSeek={seek} />}
		</div>
	)
}
