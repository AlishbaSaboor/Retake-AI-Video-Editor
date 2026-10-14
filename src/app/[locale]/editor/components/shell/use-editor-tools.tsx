import type { RefObject } from 'react'
import type { useTranslations } from 'next-intl'
import {
	ArticleIcon,
	CaptionsIcon,
	CleanupIcon,
	ColourIcon,
	CropIcon,
	DrawIcon,
	HighlightIcon,
	MusicIcon,
	ProjectsIcon,
	SparkleIcon,
	SpeedIcon,
	TextIcon,
	TransitionIcon,
	VideoIcon
} from '@/components/ui/icons'
import type { CommandContext, CommandPlan } from '../../assistant/edit-command'
import type { FillerPlan } from '../../audio/filler-cuts'
import type { ReplacementTake } from '../../audio/re-record'
import type { TranscriptSegment } from '../../audio/transcript'
import type { useTakeAnalysis } from '../../audio/use-take-analysis'
import type { AudioItem, ExtractBlocker } from '../../model/audio-lane'
import type { Edit } from '../../model/cleanup'
import type { ClipAudio } from '../../model/clip-audio'
import type { ColorGrade } from '../../model/color-grade'
import {
	clipHasTake,
	joinLimit,
	transitionInto,
	type Clip,
	type SourceEdits,
	type SourceRange
} from '../../model/sequence'
import type { AddedVideo } from '../../model/sources'
import { outputSize, type PictureTransform } from '../../model/transform'
import type { TransitionKind } from '../../model/transitions'
import type { Annotation } from '../../overlays/annotations'
import type { CaptionMode } from '../../overlays/captions'
import { LOGO_TYPES, resizedLogo } from '../../overlays/logo'
import type { LowerThird, Zoom } from '../../overlays/motion'
import type { Corner, TitleCard, Watermark } from '../../overlays/overlays'
import type { TextStyle } from '../../overlays/text-style'
import type { MadeWith } from '../../projects/editor-start'
import type { ProjectSummary } from '../../projects/projects'
import type { LoadedVideo } from '../../video-editor-helpers'
import { CommandBar, type AttachedAs, type FollowUps } from '../assistant/command-bar'
import { AnnotationPanel, type useAnnotationTools } from '../panels/annotation-panel'
import { AudioLanePanel } from '../panels/audio-lane-panel'
import { CleanupPanel } from '../panels/cleanup-bar'
import { ClipAudioPanel } from '../panels/clip-audio-panel'
import { ColorPanel } from '../panels/color-panel'
import { CaptionsPanel, GraphicsPanel } from '../panels/graphics-panel'
import { HighlightsPanel } from '../panels/highlights-dialog'
import { ZoomPanel } from '../panels/motion-panels'
import { AnnotatePanel, TextLogoPanel, type MarkKind, type Picked } from '../panels/on-video-panels'
import { ProjectPanel, type SaveStatus } from '../panels/project-panel'
import { TranscriptPanel } from '../panels/transcript-panel'
import { TransformPanel, type TransformMode } from '../panels/transform-panel'
import { TransitionPanel } from '../panels/transition-panel'
import { VideosPanel } from '../panels/videos-panel'
import type { useSequencePlayback } from '../preview/use-sequence-playback'
import { MadeWithIntro } from './studio'
import type { Tool } from './tool-rail'
import { VideoFileInput } from './video-file-input'

/**
 * The editor's tools, as the rail shows them: each one's icon and panel,
 * wired to the editor's state and actions. None until a video with a known
 * length is loaded.
 *
 * A hook, not a plain function, for React Compiler: it compiles hooks (and
 * components) only, so here each panel's element is still memoized on the
 * values that panel reads, as it was inside VideoEditor. A plain function
 * isn't compiled, and would build every panel afresh on each render, the
 * playhead's included, so the open panel would re-render on every frame
 * during playback.
 */
export function useEditorTools({
	t,
	video,
	hasDuration,
	canEdit,
	pickedNow,
	pick,
	seekEdited,
	recordEdit,
	editedSeconds,
	editedNow,
	annotations,
	title,
	watermark,
	lowerThird,
	sequence,
	replacements,
	commandContext,
	applyCommand,
	attachFile,
	startCommand,
	followUps,
	studio,
	made,
	analysis,
	playback,
	openReRecord,
	replacedSpans,
	openHighlights,
	removableSeconds,
	fillerCuts,
	applyCleanup,
	captionsOn,
	changeCaptions,
	captionMode,
	changeCaptionMode,
	captionStyle,
	changeCaptionStyle,
	addTitleNow,
	addTextNow,
	pickLogo,
	addLogo,
	changeTitle,
	changeAnnotation,
	changeWatermark,
	moveWatermark,
	setWatermark,
	changeLowerThird,
	pictureSize,
	transform,
	logoInputRef,
	annotationTools,
	addMark,
	removeAnnotation,
	audioItems,
	extractBlockers,
	pickAudio,
	addAudioFile,
	extractClip,
	changeAudioItem,
	deleteAudioItem,
	audioInputRef,
	addedVideos,
	pickVideo,
	addVideo,
	loadFile,
	videoInputRef,
	picture,
	transformMode,
	changeTransformMode,
	changeTransform,
	zoom,
	zoomAreaMode,
	aimZoom,
	changeZoom,
	color,
	changeColor,
	changeClipAudio,
	setClipsSpeed,
	edit,
	sourceEdits,
	changeTransition,
	project,
	saveStatus,
	savedAt,
	projects,
	openSaved,
	removeProject
}: {
	// Used by several tools.
	t: ReturnType<typeof useTranslations<'Editor'>>
	video: LoadedVideo | null
	hasDuration: boolean
	canEdit: boolean
	pickedNow: Picked | null
	pick: (next: Picked | null) => void
	seekEdited: (seconds: number) => void
	recordEdit: () => void
	editedSeconds: number
	editedNow: number | null
	annotations: Annotation[]
	title: TitleCard | null
	watermark: Watermark | null
	lowerThird: LowerThird | null
	sequence: Clip[]
	replacements: ReplacementTake[]
	// The assistant.
	commandContext: CommandContext
	applyCommand: (plan: CommandPlan) => void
	attachFile: (file: File) => AttachedAs
	startCommand: string | null
	followUps: FollowUps | undefined
	studio: boolean
	made: MadeWith | null
	// The transcript, highlights and clean-up.
	analysis: ReturnType<typeof useTakeAnalysis>
	playback: Pick<ReturnType<typeof useSequencePlayback>, 'seek'>
	openReRecord: (sentence: TranscriptSegment) => void
	replacedSpans: SourceRange[]
	openHighlights: () => void
	removableSeconds: number
	fillerCuts: FillerPlan[]
	applyCleanup: () => void
	// Captions.
	captionsOn: boolean
	changeCaptions: (on: boolean) => void
	captionMode: CaptionMode
	changeCaptionMode: (mode: CaptionMode) => void
	captionStyle: TextStyle
	changeCaptionStyle: (style: TextStyle) => void
	// Text, titles and the logo.
	addTitleNow: () => void
	addTextNow: () => void
	pickLogo: (corner: Corner) => void
	addLogo: (file: File) => Promise<void>
	changeTitle: (next: TitleCard | null) => void
	changeAnnotation: (next: Annotation) => void
	changeWatermark: (next: Watermark) => void
	moveWatermark: (corner: Corner) => void
	setWatermark: (next: Watermark | null) => void
	changeLowerThird: (next: LowerThird | null) => void
	pictureSize: { width: number; height: number }
	transform: PictureTransform
	logoInputRef: RefObject<HTMLInputElement | null>
	// Boxes, blurs and drawing.
	annotationTools: ReturnType<typeof useAnnotationTools>
	addMark: (kind: MarkKind) => void
	removeAnnotation: (id: string) => void
	// The Audio lane.
	audioItems: AudioItem[]
	extractBlockers: (ExtractBlocker | null)[]
	pickAudio: (seconds: number) => void
	addAudioFile: (file: File) => Promise<void>
	extractClip: (index: number) => Promise<void>
	changeAudioItem: (item: AudioItem) => void
	deleteAudioItem: (id: string) => void
	audioInputRef: RefObject<HTMLInputElement | null>
	// Videos.
	addedVideos: AddedVideo[]
	pickVideo: () => void
	addVideo: (file: File) => Promise<void>
	loadFile: (file: File) => void
	videoInputRef: RefObject<HTMLInputElement | null>
	// The frame: flip, rotate, crop and zoom.
	picture: { width: number; height: number } | null
	transformMode: TransformMode | null
	changeTransformMode: (mode: TransformMode | null) => void
	changeTransform: (next: PictureTransform) => void
	zoom: Zoom | null
	zoomAreaMode: boolean
	aimZoom: (on: boolean) => void
	changeZoom: (next: Zoom | null) => void
	// Colour, speed and transitions.
	color: ColorGrade
	changeColor: (clip: number | null, grade: ColorGrade) => void
	changeClipAudio: (index: number, audio: ClipAudio) => void
	setClipsSpeed: (speed: number, clipIndex: number | null) => void
	edit: Edit
	sourceEdits: SourceEdits
	changeTransition: (
		index: number,
		transition: { kind: TransitionKind; seconds: number } | null
	) => void
	// The project.
	project: { id: string; name: string } | null
	saveStatus: SaveStatus
	savedAt: number | null
	projects: { data?: ProjectSummary[] }
	openSaved: (id: string) => Promise<void>
	removeProject: (id: string) => Promise<void>
}): Tool[] {
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
					{
						...tool('assistant', 'assist', <SparkleIcon size={18} />, null),
						fill: true,
						panel: (
							<CommandBar
								context={commandContext}
								hasWatermark={watermark !== null}
								onApply={applyCommand}
								onAttach={attachFile}
								initialCommand={startCommand}
								followUps={followUps}
								intro={studio && made ? <MadeWithIntro made={made} /> : null}
							/>
						)
					},
					tool(
						'transcript',
						'assist',
						<ArticleIcon size={18} />,
						<TranscriptPanel
							state={analysis.transcript}
							onSeek={playback.seek}
							onReRecord={analysis.loudness && canEdit ? openReRecord : undefined}
							replacedSpans={replacedSpans}
							silences={analysis.silences}
							fillerPlans={analysis.fillerPlans}
							audioIssues={analysis.audioIssues}
						/>
					),
					tool(
						'highlights',
						'assist',
						<HighlightIcon size={18} />,
						<HighlightsPanel onOpen={openHighlights} />
					),
					tool(
						'cleanup',
						'fix',
						<CleanupIcon size={18} />,
						<CleanupPanel
							removableSeconds={removableSeconds}
							editedSeconds={editedSeconds}
							canEdit={canEdit}
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
							captionMode={captionMode}
							onCaptionModeChange={changeCaptionMode}
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
	return tools
}
