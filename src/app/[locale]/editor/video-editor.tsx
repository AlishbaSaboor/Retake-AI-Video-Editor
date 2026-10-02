'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ReplaceIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { keptSeconds, mergeCuts, planCleanup, type Cut, type Edit } from './cleanup'
import { CleanupBar } from './cleanup-bar'
import { ClipStrip } from './clip-strip'
import { CompareToggle } from './compare-toggle'
import { CommandBar } from './command-bar'
import { ExportButton } from './export-button'
import { FillerCutEditor } from './filler-cut-editor'
import { cutEditorWindow, initialCutRange, moveCutEdge, type FillerPlan } from './filler-cuts'
import { previewWindow, reRecordBlocker, type ReplacementTake } from './re-record'
import { ReRecordPanel } from './re-record-panel'
import { planSentenceSplice, type SplicePlan } from './sentence-splice'
import { Timeline } from './timeline'
import {
	canSplitAt,
	mergeClips,
	moveClip,
	playableSegments,
	splitClipAt,
	wholeTake,
	type Clip,
	type SourceRange
} from './sequence'
import { isKnownDuration, moveTrimEdge, type TrimEdge, type TrimRange } from './timeline-scale'
import type { TranscriptSegment } from './transcript'
import { TranscriptPanel } from './transcript-panel'
import { UploadDropzone } from './upload-dropzone'
import { useSequencePlayback } from './use-sequence-playback'
import { useTakeAnalysis } from './use-take-analysis'
import { VideoFileInput } from './video-file-input'

type LoadedVideo = { file: File; url: string; name: string }

/** Everything Undo restores: what's removed, and what's re-recorded. */
type UndoState = { edit: Edit; replacements: ReplacementTake[] }

const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds

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
	// cut never touches the file; `undoState` is the edit (and re-recorded
	// takes) from just before the last clean-up, filler cut or re-record,
	// restored in one step by Undo.
	const [cuts, setCuts] = useState<Cut[]>([])
	const [undoState, setUndoState] = useState<UndoState | null>(null)
	const edit: Edit = { trim: range, cuts }
	// Re-recorded sentences, each heard over its span instead of the source.
	const [replacements, setReplacements] = useState<ReplacementTake[]>([])
	const replacedSpans = replacements.map((r) => r.span)
	// Clean-up leaves re-recorded sentences alone: the take already replaced them.
	const outsideReplaced = (range: SourceRange) =>
		!replacedSpans.some((span) => overlaps(span, range))
	const fillerCuts = analysis.fillerPlans.flatMap((plan) => (plan.kind === 'cut' ? [plan] : []))
	const cleanupPlan = planCleanup(
		edit,
		{
			silences: analysis.silences.filter(outsideReplaced),
			fillerCuts: fillerCuts.filter(outsideReplaced)
		},
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
	// Re-recording a sentence: which one, where its take would go, and the
	// take recorded so far. Its preview plays the sentence with some context,
	// with the new take or as recorded.
	const [reRecord, setReRecord] = useState<{
		sentence: TranscriptSegment
		plan: SplicePlan
		take: ReplacementTake | null
	} | null>(null)
	const [takePreview, setTakePreview] = useState<{ withTake: boolean } | null>(null)
	const otherReplacements = replacements.filter(
		(r) =>
			reRecord?.plan.kind !== 'splice' ||
			r.span.startSeconds !== reRecord.plan.startSeconds ||
			r.span.endSeconds !== reRecord.plan.endSeconds
	)
	// Before/after comparison: the untouched take, start to end. Both views
	// play in source time, so switching leaves the playhead where it is.
	const [showOriginal, setShowOriginal] = useState(false)
	const editedSegments = playableSegments(sequence, edit, replacements)
	const segments =
		preview && cutWindow && cutEditor
			? playableSegments(
					wholeTake(durationSeconds),
					{
						trim: cutWindow,
						cuts: preview.withCut ? mergeCuts([...cuts, cutEditor.range]) : cuts
					},
					replacements
				)
			: takePreview && reRecord?.plan.kind === 'splice'
				? playableSegments(
						wholeTake(durationSeconds),
						{ trim: previewWindow(reRecord.plan, durationSeconds), cuts },
						takePreview.withTake && reRecord.take
							? [...otherReplacements, reRecord.take]
							: otherReplacements
					)
				: showOriginal
					? [{ startSeconds: 0, endSeconds: durationSeconds }]
					: editedSegments
	const playback = useSequencePlayback(
		videoRef,
		segments,
		isPlaying,
		setCurrentTimeSeconds,
		stopPlaying
	)

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
		setReplacements([])
		setUndoState(null)
		setCutEditor(null)
		setPreview(null)
		setReRecord(null)
		setTakePreview(null)
		setShowOriginal(false)
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
		setUndoState({ edit, replacements })
		setCuts(mergeCuts([...cuts, cutEditor.range]))
		setCutEditor(null)
		setPreview(null)
	}

	function closeCutEditor() {
		videoRef.current?.pause()
		setCutEditor(null)
		setPreview(null)
	}

	function openReRecord(sentence: TranscriptSegment) {
		if (!analysis.loudness) return
		const plan = planSentenceSplice(sentence, analysis.loudness)
		const existing =
			plan.kind === 'splice'
				? replacements.find(
						(r) =>
							r.span.startSeconds === plan.startSeconds && r.span.endSeconds === plan.endSeconds
					)
				: undefined
		setReRecord({ sentence, plan, take: existing ?? null })
		setTakePreview(null)
		videoRef.current?.pause()
		playback.seek(sentence.startSeconds)
	}

	// Plays the sentence with context — with the new take, or as recorded —
	// so the take can be judged in place before it's used.
	function playTakePreview(withTake: boolean) {
		const element = videoRef.current
		if (!element || reRecord?.plan.kind !== 'splice') return
		const start = previewWindow(reRecord.plan, durationSeconds).startSeconds
		setPreview(null)
		setTakePreview({ withTake })
		element.currentTime = start
		setCurrentTimeSeconds(start)
		element.play().catch(() => setTakePreview(null))
	}

	// One step on the same undo as clean-up. A take for a sentence that
	// already has one replaces it.
	function applyReRecord() {
		const take = reRecord?.take
		if (!take) return
		videoRef.current?.pause()
		setUndoState({ edit, replacements })
		setReplacements([...otherReplacements, take])
		setReRecord(null)
		setTakePreview(null)
	}

	function closeReRecord() {
		videoRef.current?.pause()
		setReRecord(null)
		setTakePreview(null)
	}

	// Splitting never moves the playhead or changes what plays — it only
	// divides the clip under the playhead into two that can be rearranged.
	function splitAtPlayhead() {
		const next = splitClipAt(sequence, currentTimeSeconds, () => crypto.randomUUID(), replacements)
		if (next) setClips(next)
	}

	function applyCleanup() {
		setUndoState({ edit, replacements })
		setCuts(cleanupPlan.cuts)
		applyTrim(cleanupPlan.trim, cleanupPlan.trim.startSeconds)
	}

	function undo() {
		if (!undoState) return
		setCuts(undoState.edit.cuts)
		setReplacements(undoState.replacements)
		applyTrim(undoState.edit.trim, undoState.edit.trim.startSeconds)
		setUndoState(null)
	}

	function stopPlaying() {
		setIsPlaying(false)
		setPreview(null)
		setTakePreview(null)
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
					<div className="flex flex-wrap items-center justify-between gap-4">
						<p className="text-text truncate text-sm font-medium">{video.name}</p>
						{hasDuration && (
							<CompareToggle showOriginal={showOriginal} onChange={setShowOriginal} />
						)}
						<div className="flex gap-2">
							{hasDuration && (
								<ExportButton
									videoUrl={video.url}
									videoName={video.name}
									segments={editedSegments}
								/>
							)}
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
								// Pausing on purpose to hold a frame under a longer take isn't stopping.
								if (!playback.isHolding()) stopPlaying()
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
					canUndo={undoState !== null}
					onApply={applyCleanup}
					onUndo={undo}
				/>
			)}
			<Timeline
				clipName={video?.name ?? null}
				durationSeconds={durationSeconds}
				currentTimeSeconds={currentTimeSeconds}
				trim={range}
				cuts={cuts}
				replacedSpans={replacedSpans}
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
					replacements={replacements}
					currentTimeSeconds={currentTimeSeconds}
					canSplit={canSplitAt(sequence, currentTimeSeconds, replacements)}
					onSplit={splitAtPlayhead}
					onMove={(from, to) => setClips(moveClip(sequence, from, to))}
					onMerge={(from, to) => setClips(mergeClips(sequence, from, to))}
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
			{reRecord && analysis.loudness && (
				<ReRecordPanel
					key={reRecord.sentence.startSeconds}
					sentence={reRecord.sentence}
					plan={reRecord.plan}
					blocker={reRecordBlocker(reRecord.plan, edit, sequence, otherReplacements)}
					loudness={analysis.loudness}
					take={reRecord.take}
					onTake={(take) => setReRecord({ ...reRecord, take })}
					onPlay={playTakePreview}
					onApply={applyReRecord}
					onCancel={closeReRecord}
				/>
			)}
			{video && (
				<TranscriptPanel
					state={analysis.transcript}
					onSeek={playback.seek}
					onReRecord={analysis.loudness ? openReRecord : undefined}
					replacedSpans={replacedSpans}
				/>
			)}
		</div>
	)
}
