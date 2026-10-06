'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { Button } from '@/components/ui/button'
import {
	CaptionsIcon,
	CleanupIcon,
	ColourIcon,
	CropIcon,
	DrawIcon,
	MusicIcon,
	PauseIcon,
	PlayIcon,
	ProjectsIcon,
	SelectIcon,
	SpeedIcon,
	TextIcon,
	TransitionIcon,
	VideoIcon
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { AnnotationLayer } from './annotation-layer'
import { AnnotationPanel, useAnnotationTools } from './annotation-panel'
import { newSpan, type Annotation, type NewAnnotation, type Rect } from './annotations'
import { keptSeconds, mergeCuts, planCleanup, type Cut, type Edit } from './cleanup'
import { DEFAULT_CLIP_AUDIO, type ClipAudio } from './clip-audio'
import { ClipAudioPanel } from './clip-audio-panel'
import { CleanupBar } from './cleanup-bar'
import type { ClipSelection } from './clip-selection'
import { CompareToggle } from './compare-toggle'
import { editedCaptions } from './captions'
import { CommandBar, type AttachedAs } from './command-bar'
import { setSideOpen, useSideOpen } from './editor-layout-store'
import { EditorShell } from './editor-shell'
import { EditorTimeline, type LaneItem } from './editor-timeline'
import { JobProgress, type Job } from './editor-status'
import { HistoryControls } from './history-controls'
import { ItemToolbar, type Timing } from './item-toolbar'
import { LeaveGuard } from './leave-guard'
import { AnnotatePanel, TextLogoPanel, type MarkKind, type Picked } from './on-video-panels'
import { SideTabs } from './side-tabs'
import { TitleBox } from './title-box'
import { ToolRail, type Tool } from './tool-rail'
import { ProjectTitle } from './project-title'
import { takeStart } from './editor-start'
import type { CommandContext, CommandPlan, TextTarget } from './edit-command'
import { isOriginalEdit, ORIGINAL_EDIT, type EditSnapshot } from './edit-snapshot'
import { ExportButton, useVideoExport } from './export-button'
import { totalSeconds } from './export-video'
import { FillerCutEditor } from './filler-cut-editor'
import { CaptionsPanel, GraphicsPanel } from './graphics-panel'
import { cutEditorWindow, initialCutRange, moveCutEdge, type FillerPlan } from './filler-cuts'
import { emptyHistory, record, redo, reset, undo, type Step } from './history'
import { OverlayPreview } from './overlay-preview'
import { PictureFrame, PLAYER_WIDTH } from './picture-frame'
import {
	IDENTITY_TRANSFORM,
	outputSize,
	outputToPicture,
	rotatedFrame,
	withRotation,
	type PictureTransform
} from './transform'
import { CropBox, RotateHandle, TransformPanel, type TransformMode } from './transform-panel'
import {
	editedSecondsAt,
	readLogo,
	titleShownAt,
	type Corner,
	type Overlays,
	type TitleCard,
	type Watermark
} from './overlays'
import { previewWindow, reRecordBlocker, type ReplacementTake } from './re-record'
import { ReRecordPanel } from './re-record-panel'
import { JoinEditor } from './join-editor'
import {
	byEarPlan,
	initialJoins,
	joinBounds,
	joinViews,
	moveJoin,
	planSentenceSplice,
	type SplicePlan
} from './sentence-splice'
import { SpeedToggle } from './speed-toggle'
import { TransitionPanel } from './transition-panel'
import {
	clipMatrix,
	gradeFilterId,
	matrixValues,
	NEUTRAL_GRADE,
	type ColorGrade,
	type ColorMatrix
} from './color-grade'
import { ColorPanel, GradeFilters } from './color-panel'
import { DEFAULT_TEXT_STYLE, type TextStyle } from './text-style'
import {
	NO_ANIMATION,
	NO_ZOOM,
	unzoomedPoint,
	zoomViewAt,
	type Animation,
	type LowerThird,
	type Motion,
	type Zoom
} from './motion'
import { inCorner, LOGO_TYPES, resizedLogo } from './logo'
import { LogoBox } from './logo-box'
import { ZoomPanel } from './motion-panels'
import { ZoomBox } from './zoom-box'
import { ProjectList, ProjectPanel, RelinkPanel, type SaveStatus } from './project-panel'
import {
	deleteProject,
	listProjects,
	missingMedia,
	openProject,
	relinkMedia,
	saveProject,
	type MediaRef
} from './projects'
import type { Transcript } from './transcript'
import { fadeLevelAt, type TransitionKind } from './transitions'
import {
	canSplitAt,
	clampSpeed,
	editedStarts,
	clipHasTake,
	clipIndexAt,
	deleteClips,
	isInSegment,
	duplicateClips,
	joinLimit,
	joinsOf,
	playbackPosition,
	segmentClips,
	type SourceEdits,
	withClipColor,
	setTransition,
	transitionInto,
	mergeClips,
	moveClip,
	playableSegments,
	splitClipAt,
	wholeTake,
	withClipSettings,
	type Clip,
	type SourceRange
} from './sequence'
import { isKnownDuration, moveTrimEdge, type TrimEdge, type TrimRange } from './timeline-scale'
import type { TranscriptSegment } from './transcript'
import { TranscriptPanel } from './transcript-panel'
import { UploadDropzone } from './upload-dropzone'
import { useSequencePlayback, type SourceUrls } from './use-sequence-playback'
import { useTakeAnalysis } from './use-take-analysis'
import { extractBlocker, extractedItem, type AudioItem } from './audio-lane'
import { AudioLanePanel } from './audio-lane-panel'
import { probeVideo, type AddedVideo } from './sources'
import { decodeAudio } from './take-audio'
import { VideoFileInput } from './video-file-input'
import { formatTimecode } from './timeline-scale'

/** The main video; a reopened project brings its saved transcript. */
type LoadedVideo = { file: File; url: string; name: string; transcript?: Transcript | null }

/** Once saved, a project saves itself this long after the last change. */
const AUTOSAVE_DELAY_MS = 1500
const PROJECTS_KEY = ['projects']

/** The preview's grade filters' id prefix. */
const PREVIEW_GRADE = 'preview-grade'
/** No lane sound: what playback gets outside the Edited view (one array, so it never looks changed). */
const NO_LANE: AudioItem[] = []
/** A title added by its button shows this long, from the playhead. */
const NEW_ITEM_SECONDS = 3
/** Where new text and a new box, blur or pixelate go: the middle of the picture. */
const NEW_TEXT_RECT = { x: 0.3, y: 0.66, width: 0.4, height: 0.14 }
const NEW_MARK_RECT = { x: 0.35, y: 0.3, width: 0.3, height: 0.4 }
/** How far into a clip a seek to its start goes when that moment also ends another clip. */
const BOUNDARY_NUDGE_SECONDS = 0.01
/** An added video's timeline has no cuts, takes, silences, fillers or audio flags: the main one's. */

const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds

/**
 * Pick a video, watch it, scrub it on the timeline. Everything here is local
 * to the browser: the file is played from an object URL and never leaves the
 * machine. Persisting it (storage + a Prisma row) comes once the database is
 * wired up.
 */
/**
 * `openProjectId`: a saved project to open (from the Projects page). Otherwise a
 * video handed over from the home page, with its command, is loaded.
 */
export function VideoEditor({ openProjectId = null }: { openProjectId?: string | null }) {
	const t = useTranslations('Editor')
	const videoRef = useRef<HTMLVideoElement>(null)
	// The second player, over the first: the clip dissolving in.
	const deckRef = useRef<HTMLVideoElement>(null)
	const [video, setVideo] = useState<LoadedVideo | null>(null)
	// The command brought from the home page, asked once the video is ready.
	const [startCommand, setStartCommand] = useState<string | null>(null)
	const [durationSeconds, setDurationSeconds] = useState(0)
	const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0)
	// Which segment playback is in: a source time can end one and start another.
	const [segmentIndex, setSegmentIndex] = useState<number | null>(null)
	const [picture, setPicture] = useState<{ width: number; height: number } | null>(null)
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
	// The project being edited once saved, and how its saving stands.
	const [project, setProject] = useState<{ id: string; name: string } | null>(null)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('unsaved')
	const [savedAt, setSavedAt] = useState<number | null>(null)
	// A project to open whose media the browser no longer holds: what to find.
	const [relink, setRelink] = useState<{ id: string; missing: MediaRef[] } | null>(null)
	const queryClient = useQueryClient()
	const projects = useQuery({ queryKey: PROJECTS_KEY, queryFn: listProjects })
	// Source ranges playback skips, from "Clean up recording". Like trim, a
	// cut never touches the file.
	const [cuts, setCuts] = useState<Cut[]>([])
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
	// The title card and watermark over the edited video (overlays.ts).
	const [title, setTitle] = useState<TitleCard | null>(null)
	const [watermark, setWatermark] = useState<Watermark | null>(null)
	// Captions come from the transcript; whether they show is the edit's.
	const [captionsOn, setCaptionsOn] = useState(false)
	// Boxes, blurs and text over the edited video (annotations.ts).
	const [annotations, setAnnotations] = useState<Annotation[]>([])
	// The whole video's color adjustments (a clip's own are on the clip), and the captions' look.
	const [color, setColor] = useState<ColorGrade>(NEUTRAL_GRADE)
	const [captionStyle, setCaptionStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE)
	// The lower third and the zoom (motion.ts), in the edited video's time.
	const [lowerThird, setLowerThird] = useState<LowerThird | null>(null)
	/** The logo while it's being dragged on the preview; not an edit until it's let go. */
	const [logoDraft, setLogoDraft] = useState<Watermark | null>(null)
	const [zoom, setZoom] = useState<Zoom | null>(null)
	// The Audio lane (audio-lane.ts), and the take's own sound, decoded the
	// first time a clip's sound is taken out into it.
	const [audioItems, setAudioItems] = useState<AudioItem[]>([])
	// Each video's own sound, decoded the first time one of its clips' sound is
	// taken out ('' is the main video).
	const soundsRef = useRef(new Map<string, Promise<AudioBuffer | null>>())
	// Videos added after the main one (sources.ts), each one's trim, their
	// players over the main one, and every URL made for them (released with the
	// editor: undo can bring a removed one back).
	const [addedVideos, setAddedVideos] = useState<AddedVideo[]>([])
	const [sourceTrims, setSourceTrims] = useState<Readonly<Record<string, TrimRange>>>({})
	const sourceElementsRef = useRef(new Map<string, HTMLVideoElement>())
	const addedUrlsRef = useRef<string[]>([])
	const videoInputRef = useRef<HTMLInputElement>(null)
	const audioInputRef = useRef<HTMLInputElement>(null)
	const audioAtRef = useRef(0)
	const annotationTools = useAnnotationTools()
	// Flip, rotation and crop of the whole picture (transform.ts), and the
	// on-picture tool setting it by hand, if any. While the rotation handle is
	// dragged, the preview follows a draft that becomes one change on release.
	const [transform, setTransform] = useState<PictureTransform>(IDENTITY_TRANSFORM)
	const [transformMode, setTransformMode] = useState<TransformMode | null>(null)
	// The side panels, shown or hidden; remembered in this browser. The open
	// tool on the rail; what's picked on the video; the title while it's dragged.
	const panelsShown = useSideOpen('panels')
	const [openTool, setOpenTool] = useState<string | null>(null)
	const [picked, setPicked] = useState<Picked | null>(null)
	const [titleDraft, setTitleDraft] = useState<TitleCard | null>(null)
	const [sideTab, setSideTab] = useState<'assistant' | 'transcript'>('assistant')
	const [clipSelection, setClipSelection] = useState<ClipSelection | null>(null)
	// Aiming the zoom on the video: the whole frame shows, with the zoom's area on it.
	const [zoomAreaMode, setZoomAreaMode] = useState(false)
	const [rotationDraft, setRotationDraft] = useState<number | null>(null)
	const frameRef = useRef<HTMLDivElement>(null)
	const logoInputRef = useRef<HTMLInputElement>(null)
	const logoCornerRef = useRef<Corner>('bottom-right')
	// Every edit records the snapshot from just before it, so Undo and Redo
	// step through them (history.ts). A trim drag records once, at its first
	// real move; each arrow-key nudge is a step of its own.
	const [history, setHistory] = useState(emptyHistory<EditSnapshot>)
	// The history as last saved (or as loaded). Every edit, undo and redo makes
	// a new history, so any other one holds changes not saved yet; autosave
	// catches up 1.5 s later, so this, not the save status, says what's at risk.
	const [savedHistory, setSavedHistory] = useState<typeof history | null>(null)
	const snapshot: EditSnapshot = {
		trim,
		cuts,
		clips,
		replacements,
		title,
		watermark,
		captionsOn,
		annotations,
		transform,
		color,
		captionStyle,
		audioItems,
		addedVideos,
		sourceTrims,
		lowerThird,
		zoom
	}
	const trimDragRef = useRef<{ recorded: boolean } | null>(null)
	// The filler cut editor: which filler is open and where its handles sit.
	// A preview plays just the editor's window, straight through the source
	// (clip order doesn't apply to it), with the pending cut skipped or not.
	const [cutEditor, setCutEditor] = useState<{ plan: FillerPlan; range: TrimRange } | null>(null)
	const [preview, setPreview] = useState<{ withCut: boolean } | null>(null)
	const cutWindow = cutEditor ? cutEditorWindow(cutEditor.plan.filler, durationSeconds) : null
	// Re-recording a sentence: which one, where its take would go (the
	// planner's answer, or joins set by ear within `bounds`), the take it
	// already has (replaced on apply), and the take recorded so far. Its
	// preview plays the sentence with some context, with the new take or as
	// recorded; a join preview plays the original around one join.
	const [reRecord, setReRecord] = useState<{
		sentence: TranscriptSegment
		plan: SplicePlan
		/** Set while the joins are set by ear: how far they may go. */
		bounds: SourceRange | null
		replacing: string | null
		take: ReplacementTake | null
	} | null>(null)
	const [takePreview, setTakePreview] = useState<{ withTake: boolean } | null>(null)
	const [joinPreview, setJoinPreview] = useState<SourceRange | null>(null)
	const otherReplacements = replacements.filter((r) => r.id !== reRecord?.replacing)
	// Before/after comparison: the untouched take, start to end. Both views
	// play in source time, so switching leaves the playhead where it is.
	const [showOriginal, setShowOriginal] = useState(false)
	// How fast the editor plays, for previewing only: never part of the edit,
	// its history or the export.
	const [previewRate, setPreviewRate] = useState(1)
	// Each added video's trim (the whole of it until one is set); no cuts of its own.
	const sourceEdits: SourceEdits = Object.fromEntries(
		addedVideos.map((added) => [
			added.id,
			{
				trim: sourceTrims[added.id] ?? { startSeconds: 0, endSeconds: added.durationSeconds },
				cuts: []
			}
		])
	)
	const addedUrls = Object.fromEntries(addedVideos.map((added) => [added.id, added.url]))
	const editedSegments = playableSegments(sequence, edit, replacements, sourceEdits)
	const editedSeconds = totalSeconds(editedSegments)
	const overlays: Overlays = {
		title,
		watermark,
		annotations,
		captionStyle,
		lowerThird,
		zoom,
		captions:
			captionsOn && analysis.transcript.status === 'ready'
				? editedCaptions(analysis.transcript.transcript.words, editedSegments)
				: []
	}
	const exporter = useVideoExport({
		videoUrl: video?.url ?? '',
		videoName: video?.name ?? '',
		segments: editedSegments,
		overlays,
		transform,
		color,
		laneItems: audioItems,
		addedUrls
	})
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
			: joinPreview
				? [joinPreview]
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
	const sourceUrls: SourceUrls = { added: addedUrls, main: video?.url ?? '' }
	const playback = useSequencePlayback(
		videoRef,
		deckRef,
		sourceElementsRef,
		sourceUrls,
		segments,
		segments === editedSegments ? audioItems : NO_LANE,
		isPlaying,
		previewRate,
		followPlayhead,
		stopPlaying,
		() => setIsPlaying(true)
	)
	// The video the playhead is in: the timeline shows it, its trim and its time.
	const timelineSource =
		segments === editedSegments ? editedSegments[segmentIndex ?? -1]?.source : undefined
	const timelineVideo = addedVideos.find((added) => added.id === timelineSource) ?? null
	// Overlays show in the edited view only: not over the original, nor a
	// cut or take preview, which play other segments.
	const editedNow =
		segments === editedSegments
			? editedSecondsAt(currentTimeSeconds, editedSegments, segmentIndex, timelineSource)
			: null
	// Which clip is playing, from the segment: a duplicated clip shares its source times.
	const editedClips = segmentClips(sequence, edit, replacements, sourceEdits)
	// Only while that segment holds the playhead: an edit (a split) can leave
	// the index pointing at a segment that has since changed.
	const playingSegment = segmentIndex === null ? undefined : editedSegments[segmentIndex]
	// The grade of the clip showing (and of the one a dissolve brings in), as
	// the export applies it: in the Edited view only.
	const gradeMatrices = editedSegments.map((segment) => clipMatrix(color, segment.color))
	const gradeIndex =
		segments !== editedSegments
			? null
			: segmentIndex !== null && playingSegment && isInSegment(currentTimeSeconds, playingSegment)
				? segmentIndex
				: (playbackPosition(currentTimeSeconds, editedSegments)?.index ?? null)
	const gradeFilter = (matrix: ColorMatrix | null | undefined) =>
		matrix ? `url(#${gradeFilterId(PREVIEW_GRADE, matrixValues(matrix))})` : undefined
	const pictureFilter = gradeIndex === null ? undefined : gradeFilter(gradeMatrices[gradeIndex])
	const incomingFilter =
		gradeIndex === null ? undefined : gradeFilter(gradeMatrices[gradeIndex + 1])
	const currentClip =
		segments === editedSegments &&
		segmentIndex !== null &&
		playingSegment &&
		isInSegment(currentTimeSeconds, playingSegment)
			? (editedClips[segmentIndex] ?? clipIndexAt(sequence, currentTimeSeconds, timelineSource))
			: clipIndexAt(sequence, currentTimeSeconds, timelineSource)
	const hasDissolve = editedSegments.some((s) => s.transition?.kind === 'dissolve')
	// Through a fade, the picture goes to black (the captions and title stay).
	const fadeLight = editedNow === null ? 1 : fadeLevelAt(joinsOf(editedSegments), editedNow)
	// The preview's picture size, a 16:9 stand-in until the video's metadata is in.
	const pictureSize = picture ?? { width: 16, height: 9 }
	// The Original view is the untouched take. Setting a crop or a rotation by
	// hand shows the whole rotated frame, so the crop box has room to move.
	const shownTransform: PictureTransform = showOriginal
		? IDENTITY_TRANSFORM
		: {
				...transform,
				rotation: rotationDraft ?? transform.rotation,
				crop: transformMode ? null : transform.crop
			}
	// The zoom at the playhead, in the Edited view only.
	const shownZoom = editedNow === null || zoomAreaMode ? NO_ZOOM : zoomViewAt(zoom, editedNow)

	const videoUrl = video?.url
	// The added videos' URLs go with the editor.
	useEffect(
		() => () => {
			for (const url of addedUrlsRef.current) URL.revokeObjectURL(url)
		},
		[]
	)

	// An object URL pins the whole file in memory until it's revoked, so each
	// one is released as soon as it's replaced or the editor unmounts.
	useEffect(() => {
		if (!videoUrl) return
		return () => URL.revokeObjectURL(videoUrl)
	}, [videoUrl])

	function loadFile(file: File, transcript: Transcript | null = null) {
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
		setTitle(null)
		setWatermark(null)
		setCaptionsOn(false)
		setAnnotations([])
		setTransform(IDENTITY_TRANSFORM)
		setColor(NEUTRAL_GRADE)
		setCaptionStyle(DEFAULT_TEXT_STYLE)
		setAudioItems([])
		soundsRef.current.clear()
		setAddedVideos([])
		setSourceTrims({})
		setLowerThird(null)
		setZoom(null)
		releaseAddedUrls()
		setTransformMode(null)
		setZoomAreaMode(false)
		setPicture(null)
		// A new video starts with nothing unsaved.
		const fresh = emptyHistory<EditSnapshot>()
		setHistory(fresh)
		setSavedHistory(fresh)
		setCutEditor(null)
		setPreview(null)
		setReRecord(null)
		setTakePreview(null)
		setShowOriginal(false)
		setVideo({ file, url: URL.createObjectURL(file), name: file.name, transcript })
		setDurationSeconds(0)
		setCurrentTimeSeconds(0)
		setIsPlaying(false)
		// A new video is a new, unsaved project.
		setProject(null)
		setSaveStatus('unsaved')
	}

	/** A saved edit put back in place, with no history: what reopening a project does. */
	function applySnapshot(saved: EditSnapshot) {
		setTrim(saved.trim)
		setCuts(saved.cuts)
		setClips(saved.clips)
		setReplacements(saved.replacements)
		setTitle(saved.title)
		setWatermark(saved.watermark)
		setCaptionsOn(saved.captionsOn)
		setAnnotations(saved.annotations)
		setTransform(saved.transform)
		setColor(saved.color)
		setCaptionStyle(saved.captionStyle)
		setAudioItems(saved.audioItems)
		setAddedVideos(saved.addedVideos)
		setSourceTrims(saved.sourceTrims)
		// Saved before these existed: none.
		setLowerThird(saved.lowerThird ?? null)
		setZoom(saved.zoom ?? null)
	}

	/** Saves the project under `name` (a new one the first time): its media once, its edit each time. */
	async function save(name: string) {
		if (!video) return
		const id = project?.id ?? crypto.randomUUID()
		// Outside the try: the React Compiler can't compile a `? :` inside one.
		const transcript =
			analysis.transcript.status === 'ready' ? analysis.transcript.transcript : null
		setSaveStatus('saving')
		// What this save holds: a change made while it runs is still unsaved.
		const saving = history
		try {
			const at = await saveProject({
				id,
				name,
				main: video.file,
				transcript,
				edit: snapshot
			})
			setProject({ id, name })
			setSaveStatus('saved')
			setSavedAt(at)
			setSavedHistory(saving)
			void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 'save_project' })
			setSaveStatus('failed')
			toast({ variant: 'destructive', title: t('projects.saveFailed'), description: userMessage })
		}
	}

	/**
	 * Opens a saved project in place of this edit: its media found first (or
	 * asked for, when the browser no longer holds it), then its video, its
	 * transcript and its edit, with no history.
	 */
	async function openSaved(id: string) {
		try {
			const missing = await missingMedia(id)
			if (missing.length > 0) {
				setRelink({ id, missing })
				return
			}
			const opened = await openProject(id, decodeAudio)
			if (!opened) {
				toast({ variant: 'destructive', title: t('projects.cantOpen') })
				return
			}
			playback.pause()
			setRelink(null)
			loadFile(opened.main, opened.transcript)
			applySnapshot(opened.edit)
			addedUrlsRef.current.push(...opened.urls)
			setProject({ id: opened.id, name: opened.name })
			setSaveStatus('saved')
			setSavedAt(opened.savedAt)
		} catch (error) {
			const { userMessage } = captureClientError(error, { feature: 'open_project' })
			toast({ variant: 'destructive', title: t('projects.cantOpen'), description: userMessage })
		}
	}

	/** A file picked for missing media: kept if it's the same file, then opening goes on. */
	async function relinkFile(ref: MediaRef, file: File) {
		if (!relink) return
		if (!(await relinkMedia(ref, file))) {
			toast({
				variant: 'destructive',
				title: t('projects.wrongFile', { name: file.name, wanted: ref.name })
			})
			return
		}
		const missing = relink.missing.filter((m) => m.key !== ref.key)
		if (missing.length > 0) setRelink({ ...relink, missing })
		else void openSaved(relink.id)
	}

	async function removeProject(id: string) {
		await deleteProject(id)
		if (project?.id === id) {
			setProject(null)
			setSaveStatus('unsaved')
		}
		void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
	}

	function handleLoadedMetadata(element: HTMLVideoElement) {
		setPicture({ width: element.videoWidth, height: element.videoHeight })
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
	function applyTrim(next: TrimRange | null, previewAt: number) {
		setTrim(next)
		playback.returnToMain()
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
		playback.pause()
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
		playback.returnToMain()
		setPreview({ withCut })
		element.currentTime = cutWindow.startSeconds
		setCurrentTimeSeconds(cutWindow.startSeconds)
		element.play().catch(() => setPreview(null))
	}

	function applyFillerCut() {
		if (!cutEditor) return
		playback.pause()
		recordEdit()
		setCuts(mergeCuts([...cuts, cutEditor.range]))
		setCutEditor(null)
		setPreview(null)
	}

	function closeCutEditor() {
		playback.pause()
		setCutEditor(null)
		setPreview(null)
	}

	// A sentence's take is the one over its middle, whether its joins were
	// found or set by ear; re-opening a by-ear sentence brings its joins back.
	function openReRecord(sentence: TranscriptSegment) {
		if (!analysis.loudness) return
		const middle = (sentence.startSeconds + sentence.endSeconds) / 2
		const existing = replacements.find(
			(r) => r.span.startSeconds <= middle && r.span.endSeconds >= middle
		)
		const planned = planSentenceSplice(sentence, analysis.loudness)
		const byEar = planned.kind === 'review' && existing !== undefined
		setReRecord({
			sentence,
			plan: byEar ? byEarPlan(existing.span) : planned,
			bounds: byEar ? byEarBounds(sentence, existing.id) : null,
			replacing: existing?.id ?? null,
			take: existing ?? null
		})
		setTakePreview(null)
		setJoinPreview(null)
		playback.pause()
		playback.seek(sentence.startSeconds)
	}

	/**
	 * How far a by-ear join may go: inside the part of the take the edit
	 * plays around the sentence, clear of cuts and other re-recorded spans.
	 */
	function byEarBounds(sentence: TranscriptSegment, replacing: string | null): SourceRange {
		const middle = (sentence.startSeconds + sentence.endSeconds) / 2
		const range = sequence
			.flatMap((clip) => clip.ranges)
			.find((r) => r.startSeconds <= middle && r.endSeconds >= middle)
		const playing = {
			startSeconds: Math.max(range?.startSeconds ?? 0, edit.trim.startSeconds),
			endSeconds: Math.min(range?.endSeconds ?? durationSeconds, edit.trim.endSeconds)
		}
		const obstacles = [
			...cuts,
			...replacements.filter((r) => r.id !== replacing).map((r) => r.span)
		]
		return joinBounds(sentence, playing, obstacles)
	}

	function setJoinsByEar() {
		if (!reRecord || !analysis.loudness) return
		const bounds = byEarBounds(reRecord.sentence, reRecord.replacing)
		const joins = initialJoins(reRecord.sentence, analysis.loudness, bounds)
		setReRecord({ ...reRecord, plan: byEarPlan(joins), bounds, take: null })
	}

	// A take already recorded moves with its joins: what plays is its own
	// speech, which doesn't depend on where they are.
	function moveByEarJoin(edge: 'start' | 'end', seconds: number) {
		if (!reRecord?.bounds || reRecord.plan.kind !== 'splice') return
		const joins = moveJoin(reRecord.plan, edge, seconds, reRecord.bounds)
		const span = { startSeconds: joins.startSeconds, endSeconds: joins.endSeconds }
		setReRecord({
			...reRecord,
			plan: byEarPlan(span),
			take: reRecord.take && { ...reRecord.take, span }
		})
	}

	// Plays the original across one join's view, to hear where it falls.
	function playJoinPreview(view: SourceRange) {
		const element = videoRef.current
		if (!element) return
		playback.returnToMain()
		setPreview(null)
		setTakePreview(null)
		setJoinPreview(view)
		element.currentTime = view.startSeconds
		setCurrentTimeSeconds(view.startSeconds)
		element.play().catch(() => setJoinPreview(null))
	}

	// Plays the sentence with context — with the new take, or as recorded —
	// so the take can be judged in place before it's used.
	function playTakePreview(withTake: boolean) {
		const element = videoRef.current
		if (!element || reRecord?.plan.kind !== 'splice') return
		playback.returnToMain()
		const start = previewWindow(reRecord.plan, durationSeconds).startSeconds
		setPreview(null)
		setJoinPreview(null)
		setTakePreview({ withTake })
		element.currentTime = start
		setCurrentTimeSeconds(start)
		element.play().catch(() => setTakePreview(null))
	}

	// A take for a sentence that already has one replaces it.
	function applyReRecord() {
		const take = reRecord?.take
		if (!take) return
		playback.pause()
		recordEdit()
		setReplacements([...otherReplacements, take])
		setReRecord(null)
		setTakePreview(null)
	}

	function closeReRecord() {
		playback.pause()
		setReRecord(null)
		setTakePreview(null)
		setJoinPreview(null)
	}

	// Splitting never moves the playhead or changes what plays — it only
	// divides the clip under the playhead into two that can be rearranged.
	function splitAt(seconds: number) {
		const next = splitClipAt(
			sequence,
			seconds,
			() => crypto.randomUUID(),
			replacements,
			currentClip
		)
		if (next) arrangeClips(next)
	}

	function deleteClipRun(from: number, to: number) {
		arrangeClips(deleteClips(sequence, from, to))
	}

	function duplicateClipRun(from: number, to: number) {
		arrangeClips(duplicateClips(sequence, from, to, () => crypto.randomUUID()))
	}

	/** Sets or removes the transition into clip `index`, one undo step. */
	function changeTransition(
		index: number,
		transition: { kind: TransitionKind; seconds: number } | null
	) {
		arrangeClips(setTransition(sequence, index, transition))
	}

	// Reorder and merge hand back the same clips when nothing moves.
	function arrangeClips(next: Clip[]) {
		if (next === sequence) return
		recordEdit()
		setClips(next)
	}

	function applyCleanup() {
		recordEdit()
		setCuts(cleanupPlan.cuts)
		applyTrim(cleanupPlan.trim, cleanupPlan.trim.startSeconds)
	}

	function recordEdit() {
		setHistory(record(history, snapshot))
	}

	function undoEdit() {
		const step = undo(history, snapshot)
		if (step) restore(step)
	}

	function redoEdit() {
		const step = redo(history, snapshot)
		if (step) restore(step)
	}

	function resetEdit() {
		restore(reset(history, snapshot, ORIGINAL_EDIT))
	}

	function restore(step: Step<EditSnapshot>) {
		setHistory(step.history)
		setCuts(step.restore.cuts)
		setClips(step.restore.clips)
		setReplacements(step.restore.replacements)
		setTitle(step.restore.title)
		setWatermark(step.restore.watermark)
		setCaptionsOn(step.restore.captionsOn)
		setAnnotations(step.restore.annotations)
		setTransform(step.restore.transform)
		setColor(step.restore.color)
		setCaptionStyle(step.restore.captionStyle)
		setAudioItems(step.restore.audioItems)
		setAddedVideos(step.restore.addedVideos)
		setSourceTrims(step.restore.sourceTrims)
		setLowerThird(step.restore.lowerThird)
		setZoom(step.restore.zoom)
		applyTrim(step.restore.trim, step.restore.trim?.startSeconds ?? 0)
	}

	// Once saved, the project saves itself a moment after each change to the
	// edit (any of the snapshot's pieces; not playback or the playhead).
	const autosave = useEffectEvent(() => {
		if (project && saveStatus !== 'saving') void save(project.name)
	})
	// The project's id, not its object: a save sets it again, and that's no change.
	const projectId = project?.id
	useEffect(() => {
		const timer = setTimeout(autosave, AUTOSAVE_DELAY_MS)
		return () => clearTimeout(timer)
	}, [
		projectId,
		trim,
		cuts,
		clips,
		replacements,
		title,
		watermark,
		captionsOn,
		annotations,
		transform,
		color,
		captionStyle,
		audioItems,
		addedVideos,
		sourceTrims,
		lowerThird,
		zoom
	])

	// Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z or Ctrl+Y redoes: in the Edited view,
	// and not while typing (there they're the field's own).
	const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
		if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return
		const target = event.target instanceof HTMLElement ? event.target : null
		if (target && (target.isContentEditable || target.closest('input, textarea, select, dialog')))
			return
		if (showOriginal) return
		const key = event.key.toLowerCase()
		const action =
			key === 'z' ? (event.shiftKey ? redoEdit : undoEdit) : key === 'y' ? redoEdit : null
		if (!action) return
		event.preventDefault()
		action()
	})

	/** A file attached in the chat, used as what it is: another video, the logo, or a sound. */
	function attachFile(file: File): AttachedAs {
		if (file.type.startsWith('video/')) {
			void addVideo(file)
			return 'video'
		}
		if (LOGO_TYPES.includes(file.type)) {
			logoCornerRef.current = watermark?.corner ?? logoCornerRef.current
			void addLogo(file)
			return 'logo'
		}
		if (file.type.startsWith('audio/')) {
			void addAudioFile(file)
			return 'audio'
		}
		return 'unknown'
	}

	// Long jobs, for the toolbar: the video loading, then its sound read and transcribed.
	const jobs: Job[] = []
	if (video && !hasDuration) jobs.push({ id: 'loading', label: t('status.loading') })
	if (video && analysis.transcript.status === 'analyzing')
		jobs.push({ id: 'analyzing', label: t('status.analyzing') })
	if (video && analysis.transcript.status === 'transcribing')
		jobs.push({ id: 'transcribing', label: t('status.transcribing') })

	useEffect(() => {
		window.addEventListener('keydown', handleShortcut)
		return () => window.removeEventListener('keydown', handleShortcut)
	}, [])

	function followPlayhead(seconds: number, index: number | null) {
		setCurrentTimeSeconds(seconds)
		setSegmentIndex(index)
	}

	function changeTitle(next: TitleCard | null) {
		recordEdit()
		setTitle(next)
	}

	function changeCaptions(on: boolean) {
		if (on === captionsOn) return
		recordEdit()
		setCaptionsOn(on)
	}

	// The file picker opens straight from the click (Add logo, or Apply on a
	// watermark command); the corner waits for the file.
	function pickLogo(corner: Corner) {
		logoCornerRef.current = corner
		logoInputRef.current?.click()
	}

	async function addLogo(file: File) {
		const notAPng = () =>
			toast({
				variant: 'destructive',
				title: t('graphics.notAPng.title'),
				description: t('graphics.notAPng.description', { name: file.name })
			})
		if (!LOGO_TYPES.includes(file.type)) return notAPng()
		const logo = await readLogo(file).catch(() => null)
		if (!logo) return notAPng()
		recordEdit()
		// A replaced logo keeps the old one's size and, if placed by hand, its place.
		setWatermark({
			...logo,
			corner: logoCornerRef.current,
			size: watermark?.size,
			at: watermark?.at
		})
		// On the video at once, picked, with its handles.
		pick({ kind: 'logo' })
		setOpenTool('text')
	}

	function moveWatermark(corner: Corner) {
		if (!watermark || (watermark.corner === corner && !watermark.at)) return
		recordEdit()
		setWatermark(inCorner(watermark, corner))
	}

	function changeWatermark(next: Watermark) {
		recordEdit()
		setWatermark(next)
	}

	/** A pointer's screen position as fractions of the output frame. */
	function toFrame(clientX: number, clientY: number) {
		const box = frameRef.current?.getBoundingClientRect()
		if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 }
		return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height }
	}

	/** A pointer's screen position as fractions of the source picture, through the shown transform and zoom. */
	function toPicture(clientX: number, clientY: number) {
		const frame = toFrame(clientX, clientY)
		return outputToPicture(pictureSize, shownTransform, unzoomedPoint(shownZoom, frame))
	}

	function changeLowerThird(next: LowerThird | null) {
		recordEdit()
		setLowerThird(next)
	}

	/** The title's or every annotation text's entrance or exit: one change. */
	function animateText(target: 'title' | 'text', phase: 'in' | 'out', motion: Motion) {
		const animated = (animation: Animation | undefined) => ({
			...(animation ?? NO_ANIMATION),
			[phase]: motion
		})
		recordEdit()
		if (target === 'title' && title) setTitle({ ...title, animation: animated(title.animation) })
		if (target === 'text') {
			setAnnotations(
				annotations.map((item) =>
					item.kind === 'text' ? { ...item, animation: animated(item.animation) } : item
				)
			)
		}
	}

	function changeZoom(next: Zoom | null) {
		recordEdit()
		setZoom(next)
		if (!next) setZoomAreaMode(false)
	}

	/** One tool on the picture at a time: aiming the zoom and cropping or turning take turns. */
	function aimZoom(on: boolean) {
		setZoomAreaMode(on)
		if (on) setTransformMode(null)
	}

	function changeTransformMode(mode: TransformMode | null) {
		setTransformMode(mode)
		if (mode) setZoomAreaMode(false)
	}

	/** Clips' volume, mute and fades, all in one change. A take never split becomes one clip. */
	function setClipsAudio(audio: (clip: Clip, index: number) => ClipAudio | undefined) {
		recordEdit()
		setClips(
			sequence.map((clip, index) =>
				withClipSettings(clip, audio(clip, index) ?? clip.audio, clip.speed)
			)
		)
	}

	function changeClipAudio(index: number, audio: ClipAudio) {
		setClipsAudio((_, i) => (i === index ? audio : undefined))
	}

	/** Sets clips' speeds (null: every clip), one undo step; clips with a take keep theirs. */
	function setClipsSpeed(speed: number, clipIndex: number | null) {
		recordEdit()
		setClips(
			sequence.map((clip, index) =>
				(clipIndex === null || index === clipIndex) && !clipHasTake(clip, replacements)
					? withClipSettings(clip, clip.audio, clampSpeed(speed))
					: clip
			)
		)
	}

	/** The whole video's (clip null) or one clip's color adjustments: one change. */
	function changeColor(clip: number | null, grade: ColorGrade) {
		recordEdit()
		if (clip === null) setColor(grade)
		else setClips(sequence.map((c, index) => (index === clip ? withClipColor(c, grade) : c)))
	}

	/** The title's, the captions' or every annotation text's style changed: one change. */
	function restyleText(target: TextTarget, changes: Partial<TextStyle>) {
		const restyled = (style: TextStyle | undefined) => ({
			...(style ?? DEFAULT_TEXT_STYLE),
			...changes
		})
		recordEdit()
		if (target === 'title' && title) setTitle({ ...title, style: restyled(title.style) })
		if (target === 'captions') setCaptionStyle(restyled(captionStyle))
		if (target === 'text') {
			setAnnotations(
				annotations.map((item) =>
					item.kind === 'text' ? { ...item, style: restyled(item.style) } : item
				)
			)
		}
	}

	// The file picker opens straight from the click (Add audio file, or Apply
	// on an add-audio command); where it goes waits for the file.
	function pickAudio(seconds: number) {
		audioAtRef.current = seconds
		audioInputRef.current?.click()
	}

	/** An audio file into the lane at the picked time: one change. */
	async function addAudioFile(file: File) {
		const buffer = file.type.startsWith('audio/') ? await decodeAudio(file) : null
		if (!buffer) {
			toast({
				variant: 'destructive',
				title: t('audioLane.notAudio.title'),
				description: t('audioLane.notAudio.description', { name: file.name })
			})
			return
		}
		recordEdit()
		setAudioItems([
			...audioItems,
			{
				id: crypto.randomUUID(),
				name: file.name,
				buffer,
				origin: { kind: 'file', file },
				pieces: [{ startSeconds: 0, endSeconds: buffer.duration }],
				skipSeconds: 0,
				seconds: buffer.duration,
				atSeconds: audioAtRef.current,
				volume: 1,
				muted: false
			}
		])
	}

	const extractBlockers = sequence.map((clip) => extractBlocker(clip, replacements))

	/** Clip `index`'s sound out into the lane, where it plays; the clip goes silent. One change. */
	async function extractClip(index: number) {
		const clip = sequence[index]
		const file = clip?.source
			? addedVideos.find((added) => added.id === clip.source)?.file
			: video?.file
		if (!clip || !file || extractBlockers[index] !== null) return
		// Each video's sound decoded once, the first time it's needed.
		const key = clip.source ?? ''
		const decoding = soundsRef.current.get(key) ?? decodeAudio(file)
		soundsRef.current.set(key, decoding)
		const buffer = await decoding
		const owners = segmentClips(sequence, edit, replacements, sourceEdits)
		const first = owners.indexOf(index)
		if (!buffer || first < 0) {
			toast({ variant: 'destructive', title: t('audioLane.noSound') })
			return
		}
		recordEdit()
		setAudioItems([
			...audioItems,
			extractedItem(
				editedSegments,
				first,
				owners.filter((owner) => owner === index).length,
				buffer,
				t('audioLane.clipSound', { number: index + 1 }),
				crypto.randomUUID()
			)
		])
		setClips(sequence.map((c, i) => (i === index ? { ...c, soundInLane: true } : c)))
	}

	// The file picker opens straight from the click (Add video, or Apply on an
	// add-video command).
	function pickVideo() {
		videoInputRef.current?.click()
	}

	/** Another video into the project, as one clip after the others: one change. */
	async function addVideo(file: File) {
		const probed = file.type.startsWith('video/') ? await probeVideo(file) : null
		if (!probed) {
			toast({
				variant: 'destructive',
				title: t('notAVideo.title'),
				description: t('notAVideo.description', { name: file.name })
			})
			return
		}
		addedUrlsRef.current.push(probed.url)
		const id = crypto.randomUUID()
		recordEdit()
		setAddedVideos([...addedVideos, { id, name: file.name, file, ...probed }])
		setClips([
			...sequence,
			{
				id: crypto.randomUUID(),
				ranges: [{ startSeconds: 0, endSeconds: probed.durationSeconds }],
				source: id
			}
		])
	}

	function releaseAddedUrls() {
		for (const url of addedUrlsRef.current) URL.revokeObjectURL(url)
		addedUrlsRef.current = []
	}

	/** An added video's trim edge moved, from the timeline while it shows that video. */
	function changeSourceTrim(added: AddedVideo, edge: TrimEdge, seconds: number) {
		const current = sourceTrims[added.id] ?? {
			startSeconds: 0,
			endSeconds: added.durationSeconds
		}
		const next = moveTrimEdge(current, edge, seconds, added.durationSeconds)
		if (next.startSeconds === current.startSeconds && next.endSeconds === current.endSeconds) return
		if (!trimDragRef.current?.recorded) {
			recordEdit()
			if (trimDragRef.current) trimDragRef.current.recorded = true
		}
		setSourceTrims({ ...sourceTrims, [added.id]: next })
		playback.pause()
		playback.seek(edge === 'start' ? next.startSeconds : next.endSeconds, added.id)
	}

	function changeAudioItem(item: AudioItem) {
		recordEdit()
		setAudioItems(audioItems.map((i) => (i.id === item.id ? item : i)))
	}

	function deleteAudioItem(id: string) {
		recordEdit()
		setAudioItems(audioItems.filter((i) => i.id !== id))
	}

	function changeCaptionStyle(style: TextStyle) {
		recordEdit()
		setCaptionStyle(style)
	}

	function changeTransform(next: PictureTransform) {
		recordEdit()
		setTransform(next)
	}

	/** Adds an item over the video: one change. Returns its id. */
	function addAnnotation(item: NewAnnotation): string {
		const id = crypto.randomUUID()
		recordEdit()
		setAnnotations([...annotations, { ...item, id }])
		return id
	}

	function drawAnnotation(rect: Rect) {
		const item = annotationTools.drawn(rect, editedNow ?? 0, editedSeconds)
		if (item) addAnnotation(item)
	}

	function changeAnnotation(next: Annotation) {
		recordEdit()
		setAnnotations(annotations.map((item) => (item.id === next.id ? next : item)))
	}

	function removeAnnotation(id: string) {
		recordEdit()
		setAnnotations(annotations.filter((item) => item.id !== id))
	}

	/** Picks something on the video (or nothing): the annotation layer's pick follows. */
	function pick(next: Picked | null) {
		setPicked(next)
		annotationTools.setSelectedId(next?.kind === 'annotation' ? next.id : null)
		if (next?.kind === 'annotation' && annotationTools.tool !== 'select')
			annotationTools.setTool(null)
	}

	/** Where something new goes on: the playhead, with room for it before the end. */
	function newItemStart() {
		return Math.max(0, Math.min(editedNow ?? 0, editedSeconds - 0.5))
	}

	/** A title on the video at once, picked; the one there is picked instead. */
	function addTitleNow() {
		setOpenTool('text')
		if (title) return pick({ kind: 'title' })
		const startSeconds = newItemStart()
		changeTitle({
			text: t('onVideo.newTitle'),
			startSeconds,
			durationSeconds: Math.min(NEW_ITEM_SECONDS, editedSeconds - startSeconds)
		})
		pick({ kind: 'title' })
		seekEdited(startSeconds)
	}

	/** Text on the video at once, picked, in the middle of the picture. */
	function addTextNow() {
		const startSeconds = newItemStart()
		const id = addAnnotation({
			kind: 'text',
			text: t('onVideo.newText'),
			style: annotationTools.textStyle,
			rect: NEW_TEXT_RECT,
			...newSpan(startSeconds, editedSeconds)
		})
		setOpenTool('text')
		pick({ kind: 'annotation', id })
		seekEdited(startSeconds)
	}

	/** A box, blur or pixelate on the video at once, picked, in the middle of the picture. */
	function addMark(kind: MarkKind) {
		const startSeconds = newItemStart()
		const shape = { rect: NEW_MARK_RECT, ...newSpan(startSeconds, editedSeconds) }
		const id = addAnnotation(
			kind === 'box' ? { kind, color: annotationTools.color, ...shape } : { kind, ...shape }
		)
		setOpenTool('annotate')
		pick({ kind: 'annotation', id })
		seekEdited(startSeconds)
	}

	/** Seeks to a time of the edited video: the source time in the segment playing then. */
	function seekEdited(seconds: number) {
		const starts = editedStarts(editedSegments)
		const index = starts.findLastIndex((start) => start <= seconds)
		const segment = editedSegments[index]
		if (!segment) return
		const into = (seconds - (starts[index] ?? 0)) * (segment.rate ?? 1)
		// A clip's first moment can also be another's last (reordered, they meet
		// the other way round): just inside, so it plays from this one.
		const sharedStart =
			into === 0 &&
			editedSegments.some(
				(other) =>
					other !== segment &&
					(other.source ?? '') === (segment.source ?? '') &&
					other.endSeconds === segment.startSeconds
			)
		const at = segment.startSeconds + (sharedStart ? BOUNDARY_NUDGE_SECONDS : into)
		playback.seek(Math.min(at, segment.endSeconds), segment.source)
	}

	// The transcript's sentence for "the sentence at 0:25": the one the
	// transcript labels 0:25 (its start, in whole seconds), else the one
	// being spoken then; and why it can't be re-recorded, if it can't.
	function sentenceAt(seconds: number) {
		if (analysis.transcript.status !== 'ready' || !analysis.loudness) return null
		const sentences = analysis.transcript.transcript.segments
		const sentence =
			sentences.find((s) => Math.floor(s.startSeconds) === Math.floor(seconds)) ??
			sentences.find((s) => seconds >= s.startSeconds && seconds < s.endSeconds)
		if (!sentence) return null
		const plan = planSentenceSplice(sentence, analysis.loudness)
		return { sentence, blocker: reRecordBlocker(plan, edit, sequence, replacements) }
	}

	const commandContext: CommandContext = {
		durationSeconds,
		editedSeconds,
		clipCount: sequence.length,
		canSplitAt: (seconds) => canSplitAt(sequence, seconds, replacements, currentClip),
		joinLimits: sequence.map(
			(_, index) => joinLimit(sequence, index, edit, replacements, sourceEdits) ?? 0
		),
		canMerge: (from, to) => mergeClips(sequence, from, to) !== sequence,
		projectName: project?.name ?? (video?.name ?? '').replace(/\.[^.]*$/, ''),
		unsaved: !project && history.past.length > 0,
		projects: projects.data ?? [],
		cleanupSeconds: removableSeconds,
		canUndo: history.past.length > 0,
		canRedo: history.future.length > 0,
		canReset: !isOriginalEdit(snapshot, durationSeconds),
		sentenceAt,
		transform,
		picture: pictureSize,
		clipAudio: sequence.map((clip) => clip.audio ?? DEFAULT_CLIP_AUDIO),
		clipTakes: sequence.map((clip) => clipHasTake(clip, replacements)),
		colors: { video: color, clips: sequence.map((clip) => clip.color) },
		hasTitle: title !== null,
		textCount: annotations.filter((item) => item.kind === 'text').length,
		audioCount: audioItems.length,
		extractBlockers,
		playheadSeconds: editedNow ?? 0
	}

	// Each runs what its button does, so each edit is the same one undo step.
	function applyCommand(plan: CommandPlan) {
		switch (plan.kind) {
			case 'trim':
				recordEdit()
				applyTrim(plan.range, plan.range.startSeconds)
				break
			case 'split':
				splitAt(plan.seconds)
				break
			case 'addVideo':
				pickVideo()
				break
			case 'saveProject':
				void save(plan.name)
				break
			case 'lowerThird':
				changeLowerThird({
					name: plan.name,
					subtitle: plan.subtitle,
					startSeconds: plan.startSeconds,
					durationSeconds: plan.durationSeconds,
					style: lowerThird?.style ?? DEFAULT_TEXT_STYLE
				})
				break
			case 'animate':
				animateText(plan.target, plan.phase, plan.motion)
				break
			case 'zoom':
				changeZoom(plan.zoom)
				break
			case 'openProject':
				void openSaved(plan.id)
				break
			case 'merge':
				arrangeClips(mergeClips(sequence, plan.from, plan.to))
				break
			case 'move':
				arrangeClips(moveClip(sequence, plan.from, plan.to))
				break
			case 'cleanup':
				applyCleanup()
				break
			case 'undo':
				undoEdit()
				break
			case 'redo':
				redoEdit()
				break
			case 'reset':
				resetEdit()
				break
			case 'speed':
				setPreviewRate(plan.rate)
				break
			case 'rerecord':
				openReRecord(plan.sentence)
				break
			case 'export':
				void exporter.start()
				break
			case 'title':
				changeTitle(plan.title)
				break
			case 'captions':
				changeCaptions(plan.on)
				break
			case 'annotation':
				addAnnotation(plan.annotation)
				break
			case 'transform':
				changeTransform(plan.transform)
				break
			case 'clipAudio':
				setClipsAudio((_, index) => plan.audio[index])
				break
			case 'clipSpeed':
				setClipsSpeed(plan.speed, plan.clip === null ? null : plan.clip - 1)
				break
			case 'transition':
				arrangeClips(
					plan.joins.reduce(
						(clips, index) =>
							setTransition(
								clips,
								index,
								plan.transition === null ? null : { kind: plan.transition, seconds: plan.seconds }
							),
						sequence
					)
				)
				break
			case 'color':
				changeColor(plan.clip === null ? null : plan.clip - 1, plan.grade)
				break
			case 'addAudio':
				pickAudio(plan.seconds)
				break
			case 'extractAudio':
				void extractClip(plan.clip - 1)
				break
			case 'deleteAudio': {
				const item = audioItems[plan.item - 1]
				if (item) deleteAudioItem(item.id)
				break
			}
			case 'textStyle':
				restyleText(plan.target, plan.changes)
				break
			case 'deleteClip':
				deleteClipRun(plan.clip - 1, plan.clip - 1)
				break
			case 'duplicateClip':
				duplicateClipRun(plan.clip - 1, plan.clip - 1)
				break
			case 'watermark':
				if (watermark) moveWatermark(plan.corner)
				else pickLogo(plan.corner)
		}
	}

	function stopPlaying() {
		setIsPlaying(false)
		setPreview(null)
		setTakePreview(null)
		setJoinPreview(null)
	}

	function handleTrimChange(edge: TrimEdge, seconds: number) {
		const next = moveTrimEdge(range, edge, seconds, durationSeconds)
		const changed = next.startSeconds !== range.startSeconds || next.endSeconds !== range.endSeconds
		if (changed && !trimDragRef.current?.recorded) {
			recordEdit()
			if (trimDragRef.current) trimDragRef.current.recorded = true
		}
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

	// A project to open, or a start handed over from the home page.
	// Once, though development runs effects twice.
	const begunRef = useRef(false)
	const begin = useEffectEvent(() => {
		if (begunRef.current) return
		begunRef.current = true
		if (openProjectId) {
			void openSaved(openProjectId)
			return
		}
		const start = takeStart()
		if (!start) return
		loadFile(start.file)
		setStartCommand(start.command)
		if (start.byHand) setSideTab('transcript')
	})
	// After mount, as the opening of a project or a picked file would be: from
	// a callback, not inside the effect's own render pass.
	useEffect(() => {
		void Promise.resolve().then(begin)
	}, [])

	const canEdit = !showOriginal
	// What's picked, only while it's still there (an undo can take it away).
	const pickedNow: Picked | null =
		picked?.kind === 'title' && title
			? picked
			: picked?.kind === 'logo' && watermark
				? picked
				: picked?.kind === 'lowerThird' && lowerThird
					? picked
					: picked?.kind === 'annotation' && annotations.some((item) => item.id === picked.id)
						? picked
						: null
	const annotationName = (item: Annotation) =>
		t('annotations.item', {
			kind: t(`annotations.kinds.${item.kind}`),
			number: annotations.indexOf(item) + 1
		})
	const pickedAnnotation =
		pickedNow?.kind === 'annotation'
			? annotations.find((item) => item.id === pickedNow.id)
			: undefined
	const pickedName =
		pickedNow?.kind === 'annotation'
			? pickedAnnotation
				? annotationName(pickedAnnotation)
				: ''
			: pickedNow
				? t(`onVideo.kinds.${pickedNow.kind}`)
				: ''
	const pickedTiming: Timing | null =
		pickedNow?.kind === 'title' && title
			? { startSeconds: title.startSeconds, endSeconds: title.startSeconds + title.durationSeconds }
			: pickedNow?.kind === 'lowerThird' && lowerThird
				? {
						startSeconds: lowerThird.startSeconds,
						endSeconds: lowerThird.startSeconds + lowerThird.durationSeconds
					}
				: pickedAnnotation
					? { startSeconds: pickedAnnotation.startSeconds, endSeconds: pickedAnnotation.endSeconds }
					: null

	function retimePicked(timing: Timing) {
		const durationSeconds = timing.endSeconds - timing.startSeconds
		if (pickedNow?.kind === 'title' && title)
			changeTitle({ ...title, startSeconds: timing.startSeconds, durationSeconds })
		if (pickedNow?.kind === 'lowerThird' && lowerThird)
			changeLowerThird({ ...lowerThird, startSeconds: timing.startSeconds, durationSeconds })
		if (pickedAnnotation) changeAnnotation({ ...pickedAnnotation, ...timing })
	}

	function deletePicked() {
		if (pickedNow?.kind === 'title') changeTitle(null)
		if (pickedNow?.kind === 'lowerThird') changeLowerThird(null)
		if (pickedNow?.kind === 'logo') {
			recordEdit()
			setWatermark(null)
		}
		if (pickedAnnotation) removeAnnotation(pickedAnnotation.id)
		pick(null)
	}

	/** Replace: a logo's file, or a title's or text's words (their field, focused). */
	const replacePicked =
		pickedNow?.kind === 'logo'
			? () => pickLogo(watermark?.corner ?? 'bottom-right')
			: pickedNow?.kind === 'title' || pickedAnnotation?.kind === 'text'
				? () => {
						setOpenTool('text')
						setSideOpen('panels', true)
						requestAnimationFrame(() =>
							document.querySelector<HTMLInputElement>('[data-picked-words]')?.focus()
						)
					}
				: undefined

	// The Text lane: everything over the video, in the edited video's time.
	const textItems: LaneItem[] = [
		...(title
			? [
					{
						id: 'title',
						label: title.text,
						startSeconds: title.startSeconds,
						endSeconds: title.startSeconds + title.durationSeconds,
						selected: pickedNow?.kind === 'title'
					}
				]
			: []),
		...(lowerThird
			? [
					{
						id: 'lowerThird',
						label: lowerThird.name,
						startSeconds: lowerThird.startSeconds,
						endSeconds: lowerThird.startSeconds + lowerThird.durationSeconds,
						selected: pickedNow?.kind === 'lowerThird'
					}
				]
			: []),
		...annotations.map((item) => ({
			id: item.id,
			label: item.kind === 'text' ? item.text : annotationName(item),
			startSeconds: item.startSeconds,
			endSeconds: item.endSeconds,
			selected: pickedNow?.kind === 'annotation' && pickedNow.id === item.id
		})),
		...(watermark
			? [
					{
						id: 'logo',
						label: t('onVideo.kinds.logo'),
						startSeconds: 0,
						endSeconds: editedSeconds,
						selected: pickedNow?.kind === 'logo'
					}
				]
			: []),
		...(captionsOn
			? [
					{
						id: 'captions',
						label: t('graphics.captions'),
						startSeconds: 0,
						endSeconds: editedSeconds
					}
				]
			: [])
	]

	function selectText(id: string) {
		setSideOpen('panels', true)
		if (id === 'captions') return setOpenTool('captions')
		if (id === 'title' || id === 'lowerThird' || id === 'logo') {
			pick({ kind: id })
			setOpenTool('text')
		} else {
			pick({ kind: 'annotation', id })
			const item = annotations.find((each) => each.id === id)
			setOpenTool(item?.kind === 'text' ? 'text' : 'annotate')
		}
		const at = textItems.find((item) => item.id === id)
		if (at && id !== 'logo') seekEdited(at.startSeconds)
	}

	const tool = (
		id: string,
		group: Tool['group'],
		icon: React.ReactNode,
		panel: React.ReactNode
	): Tool => ({
		id,
		group,
		icon,
		label: t(`tools.rail.${id}.label`),
		help: t(`tools.rail.${id}.help`),
		keywords: t(`tools.rail.${id}.keywords`),
		panel
	})
	const tools: Tool[] =
		video && hasDuration
			? [
					tool(
						'cleanup',
						'fix',
						<CleanupIcon size={18} />,
						<CleanupBar
							removableSeconds={removableSeconds}
							silenceCount={analysis.silences.length}
							fillerCutCount={fillerCuts.length}
							fillerReviewCount={analysis.fillerPlans.length - fillerCuts.length}
							onApply={applyCleanup}
							reading={
								analysis.transcript.status === 'analyzing' ||
								analysis.transcript.status === 'transcribing'
							}
						/>
					),
					tool(
						'captions',
						'add',
						<CaptionsIcon size={18} />,
						<CaptionsPanel
							captionsOn={captionsOn}
							onCaptionsChange={changeCaptions}
							captionStyle={captionStyle}
							onCaptionStyleChange={changeCaptionStyle}
							canEdit={canEdit}
						/>
					),
					tool(
						'text',
						'add',
						<TextIcon size={18} />,
						<>
							<TextLogoPanel
								title={title}
								lowerThird={lowerThird}
								watermark={watermark}
								texts={annotations.flatMap((item, index) =>
									item.kind === 'text' ? [{ item, number: index + 1 }] : []
								)}
								picked={pickedNow}
								canEdit={canEdit}
								onPick={(next) => {
									pick(next)
									const at =
										next.kind === 'title'
											? title?.startSeconds
											: next.kind === 'lowerThird'
												? lowerThird?.startSeconds
												: next.kind === 'annotation'
													? annotations.find((item) => item.id === next.id)?.startSeconds
													: undefined
									if (at !== undefined) seekEdited(at)
								}}
								onAddTitle={addTitleNow}
								onAddText={addTextNow}
								onAddLogo={() => pickLogo(watermark?.corner ?? 'bottom-right')}
								onTitleChange={changeTitle}
								onTextChange={changeAnnotation}
								onLogoSize={(size) =>
									watermark &&
									changeWatermark(resizedLogo(watermark, outputSize(pictureSize, transform), size))
								}
								more={
									<GraphicsPanel
										key={title ? JSON.stringify(title) : 'no title'}
										title={title}
										watermark={watermark}
										onTitleChange={changeTitle}
										onPickLogo={pickLogo}
										onCornerChange={moveWatermark}
										onLogoChange={changeWatermark}
										frame={outputSize(pictureSize, transform)}
										onRemoveWatermark={() => {
											recordEdit()
											setWatermark(null)
										}}
										lowerThird={lowerThird}
										onLowerThirdChange={changeLowerThird}
									/>
								}
							/>
							<input
								ref={logoInputRef}
								type="file"
								accept={LOGO_TYPES.join(',')}
								aria-label={t('graphics.logoInput')}
								className="sr-only"
								tabIndex={-1}
								onChange={(event) => {
									const file = event.currentTarget.files?.[0]
									// Cleared so picking the same file again still counts.
									event.currentTarget.value = ''
									if (file) void addLogo(file)
								}}
							/>
						</>
					),
					tool(
						'annotate',
						'add',
						<DrawIcon size={18} />,
						<AnnotatePanel
							marks={annotations.flatMap((item, index) =>
								item.kind === 'text' ? [] : [{ item, number: index + 1 }]
							)}
							picked={pickedNow}
							drawing={annotationTools.tool === 'pencil'}
							canEdit={canEdit}
							onPick={(next) => {
								pick(next)
								const item =
									next.kind === 'annotation'
										? annotations.find((each) => each.id === next.id)
										: undefined
								if (item) seekEdited(item.startSeconds)
							}}
							onAdd={addMark}
							onDraw={(on) => {
								pick(null)
								annotationTools.setTool(on ? 'pencil' : null)
							}}
							more={
								<AnnotationPanel
									tools={annotationTools}
									annotations={annotations}
									editedSeconds={editedSeconds}
									playheadSeconds={editedNow}
									onChange={changeAnnotation}
									onErase={removeAnnotation}
								/>
							}
						/>
					),
					tool(
						'audio',
						'add',
						<MusicIcon size={18} />,
						<>
							<AudioLanePanel
								items={audioItems}
								editedSeconds={editedSeconds}
								playheadSeconds={editedNow}
								extractBlockers={extractBlockers}
								canEdit={canEdit}
								onAddFile={pickAudio}
								onExtract={(index) => void extractClip(index)}
								onChange={changeAudioItem}
								onDelete={deleteAudioItem}
							/>
							<input
								ref={audioInputRef}
								type="file"
								accept="audio/*"
								aria-label={t('audioLane.fileInput')}
								className="sr-only"
								tabIndex={-1}
								onChange={(event) => {
									const file = event.currentTarget.files?.[0]
									// Cleared so picking the same file again still counts.
									event.currentTarget.value = ''
									if (file) void addAudioFile(file)
								}}
							/>
						</>
					),
					tool(
						'videos',
						'add',
						<VideoIcon size={18} />,
						<VideosPanel
							main={video.name}
							added={addedVideos.map((added) => added.name)}
							canEdit={canEdit}
							onAdd={pickVideo}
							replace={<VideoFileInput onFile={(file) => loadFile(file)} />}
							input={
								<input
									ref={videoInputRef}
									type="file"
									accept="video/*"
									aria-label={t('addVideoInput')}
									className="sr-only"
									tabIndex={-1}
									onChange={(event) => {
										const file = event.currentTarget.files?.[0]
										// Cleared so picking the same file again still counts.
										event.currentTarget.value = ''
										if (file) void addVideo(file)
									}}
								/>
							}
						/>
					),
					tool(
						'frame',
						'adjust',
						<CropIcon size={18} />,
						<>
							{picture && (
								<TransformPanel
									key={JSON.stringify(transform)}
									transform={transform}
									picture={picture}
									mode={transformMode}
									canEdit={canEdit}
									onModeChange={changeTransformMode}
									onChange={changeTransform}
								/>
							)}
							<ZoomPanel
								key={JSON.stringify(zoom)}
								zoom={zoom}
								editedSeconds={editedSeconds}
								playheadSeconds={editedNow}
								canEdit={canEdit}
								aiming={zoomAreaMode}
								onAim={aimZoom}
								onChange={changeZoom}
							/>
						</>
					),
					tool(
						'colour',
						'adjust',
						<ColourIcon size={18} />,
						<ColorPanel
							video={color}
							clips={sequence.map((clip) => clip.color)}
							canEdit={canEdit}
							onChange={changeColor}
						/>
					),
					tool(
						'speed',
						'adjust',
						<SpeedIcon size={18} />,
						<ClipAudioPanel
							clips={sequence}
							withTake={sequence.map((clip) => clipHasTake(clip, replacements))}
							inLane={sequence.map((clip) => clip.soundInLane === true)}
							canEdit={canEdit}
							onChange={changeClipAudio}
							onSpeedChange={(index, speed) => setClipsSpeed(speed, index)}
						/>
					),
					tool(
						'transitions',
						'adjust',
						<TransitionIcon size={18} />,
						<TransitionPanel
							joins={sequence.slice(1).map((_, i) => ({
								transition: transitionInto(sequence, i + 1),
								limit: joinLimit(sequence, i + 1, edit, replacements, sourceEdits) ?? 0
							}))}
							canEdit={canEdit}
							onChange={changeTransition}
						/>
					),
					tool(
						'project',
						'project',
						<ProjectsIcon size={18} />,
						<ProjectPanel
							name={project?.name ?? null}
							status={saveStatus}
							savedAt={savedAt}
							projects={projects.data ?? []}
							onOpen={(id) => void openSaved(id)}
							onDelete={(id) => void removeProject(id)}
						/>
					)
				]
			: []

	const unsaved = Boolean(video) && hasDuration && history !== savedHistory
	const frameSize = outputSize(pictureSize, shownTransform)
	const shownTitle = titleDraft ?? title
	const onVideo = editedNow !== null && picture && !transformMode && !showOriginal

	return (
		<>
			<LeaveGuard unsaved={unsaved} />
			<GradeFilters
				prefix={PREVIEW_GRADE}
				matrices={gradeMatrices.flatMap((matrix) => (matrix ? [matrix] : []))}
			/>
			<EditorShell
				panelsShown={panelsShown}
				onPanelsShown={(shown) => setSideOpen('panels', shown)}
				title={
					video ? (
						<>
							<ProjectTitle
								key={project?.id ?? `new-${video.url}`}
								name={project?.name ?? null}
								suggestedName={video.name.replace(/\.[^.]*$/, '')}
								status={saveStatus}
								savedAt={savedAt}
								onSave={(name) => void save(name)}
							/>
							<JobProgress jobs={jobs} />
						</>
					) : (
						<span className="text-text font-display truncate font-semibold">{t('untitled')}</span>
					)
				}
				centre={
					video && hasDuration ? (
						<>
							<HistoryControls
								canUndo={canEdit && history.past.length > 0}
								canRedo={canEdit && history.future.length > 0}
								canReset={canEdit && !isOriginalEdit(snapshot, durationSeconds)}
								onUndo={undoEdit}
								onRedo={redoEdit}
								onReset={resetEdit}
							/>
							<CompareToggle showOriginal={showOriginal} onChange={setShowOriginal} />
						</>
					) : null
				}
				actions={video && hasDuration ? <ExportButton exporter={exporter} /> : null}
				rail={
					tools.length > 0 ? (
						<ToolRail
							tools={tools}
							open={openTool}
							onOpen={setOpenTool}
							disabledNote={showOriginal ? t('original.toolsNote') : null}
						/>
					) : null
				}
				side={
					<SideTabs
						tab={sideTab}
						onTab={setSideTab}
						transcriptCount={
							analysis.transcript.status === 'ready'
								? analysis.transcript.transcript.segments.length
								: null
						}
						assistant={
							video && hasDuration ? (
								<fieldset disabled={showOriginal} className="flex min-h-0 flex-1 flex-col">
									{showOriginal && (
										<p className="text-text-muted border-border border-b p-3 text-sm">
											{t('original.chatNote')}
										</p>
									)}
									<CommandBar
										context={commandContext}
										hasWatermark={watermark !== null}
										onApply={applyCommand}
										onAttach={attachFile}
										initialCommand={startCommand}
									/>
								</fieldset>
							) : (
								<p className="text-text-muted p-4 text-sm">{t('layout.chatWaits')}</p>
							)
						}
						transcript={
							video ? (
								<TranscriptPanel
									state={analysis.transcript}
									onSeek={playback.seek}
									onReRecord={analysis.loudness && canEdit ? openReRecord : undefined}
									replacedSpans={replacedSpans}
								/>
							) : (
								<p className="text-text-muted p-4 text-sm">{t('layout.chatWaits')}</p>
							)
						}
					/>
				}
			>
				{video ? (
					<>
						{relink && (
							<RelinkPanel
								missing={relink.missing}
								onPick={(ref, file) => void relinkFile(ref, file)}
								onCancel={() => setRelink(null)}
							/>
						)}
						{hasDuration &&
							(showOriginal ? (
								<div
									role="status"
									className="border-border bg-surface mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
								>
									<p className="text-text flex-1 text-sm">
										<strong className="font-semibold">{t('original.title')}</strong>{' '}
										{t('original.body')}
									</p>
									<button
										type="button"
										onClick={() => setShowOriginal(false)}
										className="bg-accent text-accent-contrast focus-visible:outline-accent rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
									>
										{t('original.switch')}
									</button>
								</div>
							) : (
								<div className="flex flex-wrap items-start justify-center gap-2">
									<div
										role="toolbar"
										aria-label={t('videoTools.label')}
										className="border-border bg-surface flex items-center gap-0.5 rounded-lg border p-1 shadow-md"
									>
										<VideoToolButton
											label={t('videoTools.select')}
											pressed={!annotationTools.tool && !transformMode}
											onClick={() => {
												annotationTools.setTool(null)
												if (transformMode) changeTransformMode(null)
											}}
										>
											<SelectIcon size={18} />
										</VideoToolButton>
										<VideoToolButton
											label={t('videoTools.draw')}
											pressed={annotationTools.tool === 'pencil'}
											onClick={() => {
												pick(null)
												annotationTools.setTool(annotationTools.tool === 'pencil' ? null : 'pencil')
												setOpenTool('annotate')
												setSideOpen('panels', true)
											}}
										>
											<DrawIcon size={18} />
										</VideoToolButton>
										<VideoToolButton
											label={t('videoTools.crop')}
											pressed={openTool === 'frame'}
											onClick={() => {
												setOpenTool('frame')
												setSideOpen('panels', true)
											}}
										>
											<CropIcon size={18} />
										</VideoToolButton>
									</div>
									{onVideo && pickedNow && (
										<ItemToolbar
											key={`${pickedNow.kind}-${pickedNow.kind === 'annotation' ? pickedNow.id : ''}`}
											name={pickedName}
											timing={pickedTiming}
											editedSeconds={editedSeconds}
											onReplace={replacePicked}
											onTiming={retimePicked}
											onDelete={deletePicked}
											onClose={() => pick(null)}
										/>
									)}
								</div>
							))}
						<div className="relative">
							<PictureFrame
								picture={pictureSize}
								transform={shownTransform}
								zoom={shownZoom}
								frameRef={frameRef}
								video={
									<>
										<video
											key={video.url}
											ref={videoRef}
											src={video.url}
											playsInline
											className="absolute inset-0 block h-full w-full bg-black"
											style={{ filter: pictureFilter }}
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
										{/* The added videos' players, over the main one: each shown only while
									    it plays (use-sequence-playback.ts), fitted into the frame. */}
										{addedVideos.map((added) => (
											<video
												key={added.id}
												ref={(element) => {
													if (element) sourceElementsRef.current.set(added.id, element)
													else sourceElementsRef.current.delete(added.id)
												}}
												src={added.url}
												preload="auto"
												playsInline
												aria-hidden
												tabIndex={-1}
												data-testid="added-player"
												data-source={added.id}
												className="pointer-events-none absolute inset-0 block h-full w-full bg-black opacity-0"
												style={{ filter: pictureFilter }}
											/>
										))}
										{/* The clip dissolving in, shown only through a dissolve: there only
									    while the edit has one, so it loads ahead of it. */}
										{hasDissolve && (
											<video
												key={`${video.url}-deck`}
												ref={deckRef}
												src={video.url}
												preload="auto"
												playsInline
												aria-hidden
												tabIndex={-1}
												data-testid="dissolve-player"
												data-url={video.url}
												className="pointer-events-none absolute inset-0 block h-full w-full opacity-0"
												style={{ filter: incomingFilter }}
											/>
										)}
									</>
								}
								onPicture={
									<>
										{editedNow !== null && picture && (
											<AnnotationLayer
												annotations={annotations}
												editedSeconds={editedNow}
												picture={picture}
												videoRef={playback.activeRef}
												toPicture={toPicture}
												flip={{ x: transform.flipH ? -1 : 1, y: transform.flipV ? -1 : 1 }}
												// With no tool out, a click picks what's under it.
												tool={transformMode ? null : (annotationTools.tool ?? 'select')}
												onPointerStart={() => playback.pause()}
												onDraw={drawAnnotation}
												onStroke={(points) => {
													const item = annotationTools.stroked(
														points,
														pictureSize,
														editedNow ?? 0,
														editedSeconds
													)
													if (item) addAnnotation(item)
												}}
												pictureFilter={pictureFilter}
												selectedId={annotationTools.selectedId}
												onSelect={(id) => pick(id ? { kind: 'annotation', id } : null)}
												quiet={!transformMode && !annotationTools.tool}
												onChange={changeAnnotation}
												onErase={removeAnnotation}
											/>
										)}
										{transformMode === 'rotate' && !showOriginal && picture && (
											<RotateHandle
												rotation={transform.rotation}
												onDraft={setRotationDraft}
												onCommit={(rotation) =>
													changeTransform(withRotation(transform, rotation, picture))
												}
											/>
										)}
									</>
								}
								onFrame={
									<>
										{fadeLight < 1 && (
											<div
												data-testid="fade-black"
												aria-hidden
												className="pointer-events-none absolute inset-0 bg-black"
												style={{ opacity: 1 - fadeLight }}
											/>
										)}
										{editedNow !== null && picture && !transformMode && (
											<OverlayPreview
												overlays={{
													...overlays,
													title: shownTitle,
													watermark: logoDraft ?? overlays.watermark
												}}
												editedSeconds={editedNow}
												frame={frameSize}
											/>
										)}
										{onVideo && shownTitle && titleShownAt(shownTitle, editedNow) && (
											<TitleBox
												title={shownTitle}
												selected={pickedNow?.kind === 'title'}
												frame={frameSize}
												toFrame={toFrame}
												onSelect={() => {
													pick({ kind: 'title' })
													setOpenTool('text')
												}}
												onDraft={setTitleDraft}
												onChange={changeTitle}
											/>
										)}
										{onVideo && watermark && (
											<LogoBox
												watermark={watermark}
												frame={frameSize}
												toFrame={toFrame}
												selected={pickedNow?.kind === 'logo'}
												onSelect={() => {
													pick({ kind: 'logo' })
													setOpenTool('text')
												}}
												onDraft={setLogoDraft}
												onChange={changeWatermark}
											/>
										)}
										{zoomAreaMode && !showOriginal && zoom && (
											<ZoomBox zoom={zoom} toFrame={toFrame} onChange={changeZoom} />
										)}
										{transformMode === 'crop' && !showOriginal && transform.crop && picture && (
											<CropBox
												crop={transform.crop}
												frame={rotatedFrame(picture, transform.rotation)}
												toFrame={toFrame}
												onChange={(rect) =>
													transform.crop &&
													changeTransform({ ...transform, crop: { ...transform.crop, rect } })
												}
											/>
										)}
									</>
								}
							/>
						</div>
						{hasDuration && (
							<div
								className={cn(
									'mx-auto grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3',
									PLAYER_WIDTH
								)}
							>
								<span className="text-text-muted font-mono text-sm">
									<span className="text-text">
										{formatTimecode(editedNow ?? currentTimeSeconds)}
									</span>
									{' / '}
									{formatTimecode(showOriginal ? durationSeconds : editedSeconds)}
								</span>
								<button
									type="button"
									aria-label={isPlaying ? t('pause') : t('play')}
									title={isPlaying ? t('pause') : t('play')}
									onClick={() => (isPlaying ? playback.pause() : playback.play())}
									className="bg-text text-bg focus-visible:outline-accent inline-flex size-11 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
								>
									{isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
								</button>
								<div className="flex justify-end">
									<SpeedToggle rate={previewRate} onChange={setPreviewRate} />
								</div>
							</div>
						)}
					</>
				) : (
					<>
						<UploadDropzone onFile={(file) => loadFile(file)} />
						{relink ? (
							<RelinkPanel
								missing={relink.missing}
								onPick={(ref, file) => void relinkFile(ref, file)}
								onCancel={() => setRelink(null)}
							/>
						) : (
							<section
								aria-label={t('projects.label')}
								className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
							>
								<h2 className="text-text text-xs font-bold tracking-wider uppercase">
									{t('projects.myProjects')}
								</h2>
								<ProjectList
									projects={projects.data ?? []}
									current={null}
									onOpen={(id) => void openSaved(id)}
									onDelete={(id) => void removeProject(id)}
								/>
							</section>
						)}
					</>
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
						onSetByEar={
							reRecord.plan.kind === 'review' && !reRecord.take ? setJoinsByEar : undefined
						}
					>
						{reRecord.bounds && reRecord.plan.kind === 'splice' && (
							<JoinEditor
								joins={reRecord.plan}
								views={joinViews(reRecord.sentence, reRecord.bounds)}
								loudness={analysis.loudness}
								currentTimeSeconds={currentTimeSeconds}
								onMove={moveByEarJoin}
								onPlay={playJoinPreview}
							/>
						)}
					</ReRecordPanel>
				)}
				{video && hasDuration && (
					<EditorTimeline
						view={showOriginal ? 'original' : 'edited'}
						takeSeconds={durationSeconds}
						editedSeconds={editedSeconds}
						editedSegments={editedSegments}
						playheadSeconds={showOriginal ? currentTimeSeconds : editedNow}
						onSeek={(seconds) => (showOriginal ? playback.seek(seconds) : seekEdited(seconds))}
						onSeekSource={(seconds) => playback.seek(seconds)}
						clips={sequence}
						edit={edit}
						replacements={replacements}
						sourceEdits={sourceEdits}
						sourceNames={Object.fromEntries(addedVideos.map((added) => [added.id, added.name]))}
						mainName={video.name}
						currentIndex={currentClip}
						canSplit={canSplitAt(sequence, currentTimeSeconds, replacements, currentClip)}
						onSplit={() => splitAt(currentTimeSeconds)}
						onMove={(from, to) => arrangeClips(moveClip(sequence, from, to))}
						onMerge={(from, to) => arrangeClips(mergeClips(sequence, from, to))}
						onDelete={deleteClipRun}
						onDuplicate={duplicateClipRun}
						selection={clipSelection}
						onSelectionChange={setClipSelection}
						trim={
							timelineVideo
								? {
										source: timelineVideo.id,
										durationSeconds: timelineVideo.durationSeconds,
										range: sourceEdits[timelineVideo.id]?.trim ?? range
									}
								: { durationSeconds, range }
						}
						onTrimChange={(edge, seconds) =>
							timelineVideo
								? changeSourceTrim(timelineVideo, edge, seconds)
								: handleTrimChange(edge, seconds)
						}
						onTrimDraggingChange={(dragging) => {
							trimDragRef.current = dragging ? { recorded: false } : null
						}}
						silences={analysis.silences}
						fillerPlans={analysis.fillerPlans}
						audioIssues={analysis.audioIssues}
						replacedSpans={replacedSpans}
						onEditFiller={openCutEditor}
						textItems={textItems}
						audioItems={audioItems.map((item) => ({
							id: item.id,
							label: item.name,
							startSeconds: item.atSeconds,
							endSeconds: item.atSeconds + item.seconds
						}))}
						onSelectText={selectText}
						onSelectAudio={() => {
							setOpenTool('audio')
							setSideOpen('panels', true)
						}}
						onAddAudio={() => {
							setOpenTool('audio')
							setSideOpen('panels', true)
							pickAudio(editedNow ?? 0)
						}}
						onAddVideo={pickVideo}
					/>
				)}
			</EditorShell>
		</>
	)
}

/** A button on the bar over the video: an icon, its name said and shown on hover. */
function VideoToolButton({
	label,
	pressed,
	onClick,
	children
}: {
	label: string
	pressed: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			onClick={onClick}
			className="text-text-muted hover:bg-surface-hover hover:text-text aria-pressed:bg-surface-hover aria-pressed:text-text focus-visible:outline-accent inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-2"
		>
			{children}
		</button>
	)
}

/** The project's videos: the main one, and any added after it; add another, or replace the main one. */
function VideosPanel({
	main,
	added,
	canEdit,
	onAdd,
	replace,
	input
}: {
	main: string
	added: string[]
	canEdit: boolean
	onAdd: () => void
	/** The main video's file picker, inside the Replace label. */
	replace: React.ReactNode
	input: React.ReactNode
}) {
	const t = useTranslations('Editor.videos')
	return (
		<section aria-label={t('label')} className="flex flex-col gap-4">
			<Button type="button" disabled={!canEdit} onClick={onAdd} className="self-start">
				<VideoIcon />
				{t('add')}
			</Button>
			{input}
			<ul className="flex flex-col gap-1.5">
				{[main, ...added].map((name, index) => (
					<li
						key={`${index}-${name}`}
						className="border-border bg-surface flex items-center gap-3 rounded-lg border px-3 py-2.5"
					>
						<VideoIcon className="text-text-faint shrink-0" />
						<span className="text-text min-w-0 flex-1 truncate text-sm">{name}</span>
						<span className="text-text-faint text-xs">{index === 0 ? t('main') : t('added')}</span>
					</li>
				))}
			</ul>
			<label
				className={cn(
					'border-border text-text hover:bg-surface-hover has-[:focus-visible]:outline-accent inline-flex h-9 cursor-pointer items-center gap-2 self-start rounded-md border px-3 text-sm font-medium has-[:focus-visible]:outline-2',
					!canEdit && 'pointer-events-none opacity-40'
				)}
			>
				{t('replace')}
				{replace}
			</label>
			<p className="text-text-muted text-xs">{t('help')}</p>
		</section>
	)
}
