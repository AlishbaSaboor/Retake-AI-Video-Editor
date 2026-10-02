'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ReplaceIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { keptSeconds, mergeCuts, planCleanup, type Cut, type Edit } from './cleanup'
import { CleanupBar } from './cleanup-bar'
import { ClipStrip } from './clip-strip'
import { CommandBar } from './command-bar'
import { FillerCutEditor } from './filler-cut-editor'
import { cutEditorWindow, initialCutRange, moveCutEdge, type FillerPlan } from './filler-cuts'
import { Timeline } from './timeline'
import { canSplitAt, playableSegments, splitClipAt, wholeTake, type Clip } from './sequence'
import { isKnownDuration, moveTrimEdge, type TrimEdge, type TrimRange } from './timeline-scale'
import { TranscriptPanel } from './transcript-panel'
import { UploadDropzone } from './upload-dropzone'
import { useSequencePlayback } from './use-sequence-playback'
import { useTakeAnalysis } from './use-take-analysis'
import { VideoFileInput } from './video-file-input'

type LoadedVideo = { file: File; url: string; name: string }

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
	// Null until the first split, meaning "the whole take as one clip".
	const [clips, setClips] = useState<Clip[] | null>(null)
	const sequence = clips ?? wholeTake(durationSeconds)
	// The filler cut editor: which filler is open and where its handles sit.
	// A preview plays just the editor's window, straight through the source
	// (clip order doesn't apply to it), with the pending cut skipped or not.
	const [cutEditor, setCutEditor] = useState<{ plan: FillerPlan; range: TrimRange } | null>(null)
	const [preview, setPreview] = useState<{ withCut: boolean } | null>(null)
	const cutWindow = cutEditor ? cutEditorWindow(cutEditor.plan.filler, durationSeconds) : null
	const segments =
		preview && cutWindow && cutEditor
			? playableSegments(wholeTake(durationSeconds), {
					trim: cutWindow,
					cuts: preview.withCut ? mergeCuts([...cuts, cutEditor.range]) : cuts
				})
			: playableSegments(sequence, edit)
	const playback = useSequencePlayback(videoRef, segments, isPlaying, setCurrentTimeSeconds)

	const videoUrl = video?.url
	// An object URL pins the whole file in memory until it's revoked, so each
	// one is released as soon as it's replaced or the editor unmounts.
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

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
		setClips(null)
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
		playback.seek(cutEditorWindow(plan.filler, durationSeconds).startSeconds)
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
		setPreview({ withCut })
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

	// Splitting never moves the playhead or changes what plays — it only
	// divides the clip under the playhead into two that can be rearranged.
	function splitAtPlayhead() {
		const next = splitClipAt(sequence, currentTimeSeconds, () => crypto.randomUUID())
		if (next) setClips(next)
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

	function handleTimeUpdate(element: HTMLVideoElement) {
		if (isProbingDurationRef.current) return
		if (hasDuration) playback.settle(element)
		else setCurrentTimeSeconds(element.currentTime)
	}

	function handlePlay(element: HTMLVideoElement) {
		setIsPlaying(true)
		if (hasDuration) playback.restartIfAtEnd(element)
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
				onSeek={playback.seek}
				onTrimChange={handleTrimChange}
				onEditFiller={openCutEditor}
			/>
			{video && hasDuration && (
				<ClipStrip
					clips={sequence}
					edit={edit}
					currentTimeSeconds={currentTimeSeconds}
					canSplit={canSplitAt(sequence, currentTimeSeconds)}
					onSplit={splitAtPlayhead}
				/>
			)}
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
			{video && <TranscriptPanel state={analysis.transcript} onSeek={playback.seek} />}
		</div>
	)
}
