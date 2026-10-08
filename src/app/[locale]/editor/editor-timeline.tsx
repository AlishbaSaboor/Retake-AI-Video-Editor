'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
	CopyIcon,
	MergeIcon,
	MusicIcon,
	PlusIcon,
	SplitIcon,
	TrashIcon
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { AUDIO_ISSUE_KINDS, type AudioIssue } from './audio-quality'
import type { Edit } from './cleanup'
import { selectedRun, type ClipSelection } from './clip-selection'
import type { FillerPlan } from './filler-cuts'
import { editedSecondsAt } from './overlays'
import {
	clipPlayedSeconds,
	mergeClips,
	type Clip,
	type Replacement,
	type Segment,
	type SourceEdits,
	type SourceRange
} from './sequence'
import type { Silence } from './take-audio'
import { TimelineFlag } from './timeline-flag'
import {
	clampTime,
	formatTimecode,
	rulerTicks,
	timeToPercent,
	type TrimEdge,
	type TrimRange
} from './timeline-scale'
import { TrimHandle } from './trim-handle'

// Arrow keys nudge the playhead by a second; Shift+arrow jumps five.
const SMALL_STEP_SECONDS = 1
const LARGE_STEP_SECONDS = 5
const MOVE_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
const SELECT_KEYS = new Set([' ', 'Enter'])
const DELETE_KEYS = new Set(['Delete', 'Backspace'])
const ZOOM = { min: 1, max: 8, step: 0.5 }

/** Something on the Text or Audio lane: when it shows, and what it's called. */
export type LaneItem = {
	id: string
	label: string
	startSeconds: number
	endSeconds: number
	selected?: boolean
}

type EditorTimelineProps = {
	/** The edited video, or the untouched take (the Original view: view only). */
	view: 'edited' | 'original'
	/** The take's length: the Original view's whole width. */
	takeSeconds: number
	editedSeconds: number
	editedSegments: Segment[]
	/** The playhead: in the edited video, or the take in the Original view; null when neither (a preview). */
	playheadSeconds: number | null
	/** Seeks to a time of what's shown: the edited video, or the take. */
	onSeek: (seconds: number) => void
	/** Seeks to a time of the main video's own (a flag's). */
	onSeekSource: (seconds: number) => void
	clips: Clip[]
	edit: Edit
	replacements: readonly Replacement[]
	sourceEdits: SourceEdits
	sourceNames: Readonly<Record<string, string>>
	/** The main video's file name, shown on its clips. */
	mainName: string
	currentIndex: number
	canSplit: boolean
	onSplit: () => void
	onMove: (from: number, to: number) => void
	onMerge: (from: number, to: number) => void
	onDelete: (from: number, to: number) => void
	onDuplicate: (from: number, to: number) => void
	selection: ClipSelection | null
	onSelectionChange: (selection: ClipSelection | null) => void
	/** The trim of the video the playhead is in: its source, its length, its range. */
	trim: { source?: string; durationSeconds: number; range: TrimRange }
	onTrimChange: (edge: TrimEdge, seconds: number) => void
	onTrimDraggingChange: (dragging: boolean) => void
	/** The main video's flags, in its own time. */
	silences: Silence[]
	fillerPlans: FillerPlan[]
	audioIssues: AudioIssue[]
	replacedSpans: SourceRange[]
	onEditFiller: (plan: FillerPlan) => void
	textItems: LaneItem[]
	audioItems: LaneItem[]
	onSelectText: (id: string) => void
	onSelectAudio: (id: string) => void
	onAddAudio: () => void
	onAddVideo: () => void
}

/**
 * The timeline, in the edited video's time: a ruler to scrub, and a lane each
 * for the video, the text over it and the sound. The Video lane is the clips
 * themselves, each as wide as it plays: Split cuts the clip under the playhead
 * in two right where it is; clips are picked, dragged to reorder, merged,
 * duplicated or deleted. Silences and filler words are flagged where they
 * play. In the Original view it shows the untouched take, and edits nothing.
 */
export function EditorTimeline(props: EditorTimelineProps) {
	const {
		view,
		clips,
		edit,
		replacements,
		sourceEdits,
		sourceNames,
		currentIndex,
		selection,
		onSelectionChange: setSelection
	} = props
	const t = useTranslations('Editor.timeline')
	const tc = useTranslations('Editor.clips')
	const hintId = useId()
	// The ruler, for turning a pointer into a time, and where a trim drag began.
	const [ruler, setRuler] = useState<HTMLDivElement | null>(null)
	const [trimDrag, setTrimDrag] = useState<{ edited: number; source: number } | null>(null)
	const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
	const [zoom, setZoom] = useState(1)
	const isOriginal = view === 'original'
	const total = isOriginal ? props.takeSeconds : props.editedSeconds
	const selected = selectedRun(clips, selection)
	const at = (seconds: number) => timeToPercent(seconds, total)
	const span = (start: number, end: number) => ({
		left: at(start),
		width: `calc(${at(end)} - ${at(start)})`
	})
	// The main video's own times, where they play in the edit (null where cut).
	const edited = (seconds: number) =>
		isOriginal ? seconds : editedSecondsAt(seconds, props.editedSegments)

	/** The time under the pointer: past either end too, for a trim dragged outwards. */
	function unclampedTimeAt(clientX: number): number {
		if (!ruler) return 0
		const rect = ruler.getBoundingClientRect()
		return ((clientX - rect.left) / rect.width) * total
	}
	const timeAtPointer = (clientX: number) => clampTime(unclampedTimeAt(clientX), total)

	function handleRulerKey(event: KeyboardEvent) {
		const now = props.playheadSeconds ?? 0
		const step = event.shiftKey ? LARGE_STEP_SECONDS : SMALL_STEP_SECONDS
		const target: Record<string, number> = {
			ArrowRight: now + step,
			ArrowUp: now + step,
			ArrowLeft: now - step,
			ArrowDown: now - step,
			Home: 0,
			End: total
		}
		const next = target[event.key]
		if (next === undefined) return
		event.preventDefault()
		props.onSeek(clampTime(next, total))
	}

	function select(clip: Clip, extend: boolean) {
		setSelection({
			anchorId: extend && selection ? selection.anchorId : clip.id,
			focusId: clip.id
		})
	}

	function handleClipKey(event: KeyboardEvent, clip: Clip, index: number) {
		if (SELECT_KEYS.has(event.key)) {
			event.preventDefault()
			select(clip, event.shiftKey)
			return
		}
		if (DELETE_KEYS.has(event.key) && clips.length > 1) {
			event.preventDefault()
			props.onDelete(index, index)
			setSelection(null)
			return
		}
		const step = MOVE_KEYS[event.key]
		if (!event.altKey || step === undefined) return
		event.preventDefault()
		props.onMove(index, index + step)
	}

	// Never every clip: something has to play. Only clips of one video can be one clip.
	const canMerge =
		selected !== null &&
		selected.to > selected.from &&
		mergeClips(clips, selected.from, selected.to) !== clips
	const canDelete = selected !== null && selected.to - selected.from + 1 < clips.length
	const canEdit = !isOriginal

	// The trim handles sit on the trimmed video's edges, where they play; a drag
	// moves the edge by as much edited time as the pointer moved.
	const trimSource = props.trim.source
	const trimAt = (seconds: number) =>
		isOriginal ? null : editedSecondsAt(seconds, props.editedSegments, null, trimSource)
	const trimStart = trimAt(props.trim.range.startSeconds)
	const trimEnd = trimAt(props.trim.range.endSeconds)
	const trimTime = (edge: TrimEdge) => (clientX: number) => {
		const pointer = unclampedTimeAt(clientX)
		const from = edge === 'start' ? props.trim.range.startSeconds : props.trim.range.endSeconds
		const origin = trimDrag ?? { edited: pointer, source: from }
		if (!trimDrag) setTrimDrag(origin)
		return origin.source + (pointer - origin.edited)
	}
	const onTrimDragging = (dragging: boolean) => {
		if (!dragging) setTrimDrag(null)
		props.onTrimDraggingChange(dragging)
	}

	const issueCounts = AUDIO_ISSUE_KINDS.map((kind) => ({
		kind,
		count: props.audioIssues.filter((issue) => issue.kind === kind).length
	})).filter(({ count }) => count > 0)
	const textRows = laneRows(props.textItems)
	const audioRows = laneRows(props.audioItems)
	// A lane's height: a row per run of overlapping items, and at least one.
	const laneHeight = (rows: number) => `${Math.max(rows, 1) * 2.125}rem`

	const laneLabel = 'text-text-muted w-14 shrink-0 pt-2 text-xs font-medium'
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col rounded-lg border"
		>
			<h2 className="sr-only">{t('label')}</h2>
			<div
				role="region"
				aria-label={tc('label')}
				className="flex flex-col"
				aria-describedby={hintId}
			>
				<div className="border-border flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
					<ToolbarButton
						label={tc('split')}
						text={tc('splitShort')}
						icon={<SplitIcon />}
						disabled={!canEdit || !props.canSplit}
						onClick={props.onSplit}
					/>
					<ToolbarButton
						label={tc('merge')}
						text={tc('mergeShort')}
						icon={<MergeIcon />}
						disabled={!canEdit || !canMerge}
						onClick={() => {
							if (!selected) return
							props.onMerge(selected.from, selected.to)
							setSelection(null)
						}}
					/>
					<ToolbarButton
						label={tc('duplicate')}
						text={tc('duplicate')}
						icon={<CopyIcon />}
						disabled={!canEdit || !selected}
						onClick={() => selected && props.onDuplicate(selected.from, selected.to)}
					/>
					<ToolbarButton
						label={tc('delete')}
						text={tc('delete')}
						icon={<TrashIcon />}
						disabled={!canEdit || !canDelete}
						onClick={() => {
							if (!selected) return
							props.onDelete(selected.from, selected.to)
							setSelection(null)
						}}
					/>
					<p id={hintId} className="text-text-faint px-2 text-xs max-md:hidden">
						{isOriginal ? t('originalHint') : tc('dragHint')}
					</p>
					<div className="ml-auto flex items-center gap-2">
						<span className="text-text-muted text-xs max-sm:sr-only">
							{tc('count', { count: clips.length })}
						</span>
						{!isOriginal && props.silences.length > 0 && (
							<span className="text-warning text-xs max-sm:hidden">
								{t('silenceCount', { count: props.silences.length })}
							</span>
						)}
						{!isOriginal && props.fillerPlans.length > 0 && (
							<span className="text-filler text-xs max-sm:hidden">
								{t('fillerCount', { count: props.fillerPlans.length })}
							</span>
						)}
						{!isOriginal &&
							issueCounts.map(({ kind, count }) => (
								<span key={kind} className="text-text-muted text-xs max-sm:hidden">
									{t(`audio.${kind}.count`, { count })}
								</span>
							))}
						<label className="text-text-muted flex items-center gap-2 text-xs">
							{t('zoom')}
							<input
								type="range"
								min={ZOOM.min}
								max={ZOOM.max}
								step={ZOOM.step}
								value={zoom}
								onChange={(event) => setZoom(Number(event.target.value))}
								className="accent-accent w-24"
							/>
						</label>
					</div>
				</div>
				<div className="flex gap-1 overflow-x-auto px-2 pt-1 pb-2">
					<div className="flex shrink-0 flex-col gap-1 pt-7" aria-hidden>
						<span className={cn(laneLabel, 'h-14')}>{t('lanes.video')}</span>
						{!isOriginal && (
							<span className={laneLabel} style={{ height: laneHeight(textRows.length) }}>
								{t('lanes.text')}
							</span>
						)}
						{!isOriginal && (
							<span className={laneLabel} style={{ height: laneHeight(audioRows.length) }}>
								{t('lanes.audio')}
							</span>
						)}
					</div>
					<div
						className="relative min-w-0 flex-1" // As wide as the lane's room (beside its labels), times the zoom.
						style={{ minWidth: `calc(${zoom} * (100% - 3.75rem))` }}
					>
						<div
							ref={setRuler}
							role="slider"
							tabIndex={0}
							aria-label={t('scrubberLabel')}
							aria-valuemin={0}
							aria-valuemax={Number(total.toFixed(2))}
							aria-valuenow={Number((props.playheadSeconds ?? 0).toFixed(2))}
							aria-valuetext={formatTimecode(props.playheadSeconds ?? 0)}
							// What plays, for tests that place the playhead by a time of the
							// recording: [start, end, rate, video] per piece, in edited order.
							data-segments={
								isOriginal
									? undefined
									: JSON.stringify(
											props.editedSegments.map((segment) => [
												segment.startSeconds,
												segment.endSeconds,
												segment.rate ?? 1,
												segment.source ?? ''
											])
										)
							}
							className="focus-visible:outline-accent border-border relative h-7 cursor-pointer touch-none border-b font-mono select-none focus-visible:outline-2"
							onPointerDown={(event) => {
								event.currentTarget.setPointerCapture(event.pointerId)
								props.onSeek(timeAtPointer(event.clientX))
							}}
							onPointerMove={(event) => {
								if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
								props.onSeek(timeAtPointer(event.clientX))
							}}
							onKeyDown={handleRulerKey}
						>
							{rulerTicks(total).map((tick) => (
								<span
									key={tick}
									className="border-border-strong text-text-faint absolute top-0 h-3 border-l pl-1 text-[10px] leading-3"
									style={{ left: at(tick) }}
								>
									{formatTimecode(tick)}
								</span>
							))}
						</div>
						{props.silences.map((silence) => {
							const start = edited(silence.startSeconds)
							return (
								start !== null && (
									<TimelineFlag
										key={`silence-${silence.startSeconds}`}
										kind="silence"
										atSeconds={start}
										durationSeconds={total}
										className="top-3.5"
										label={t('silencePinLabel', {
											start: formatTimecode(silence.startSeconds),
											end: formatTimecode(silence.endSeconds)
										})}
										onJump={() => props.onSeekSource(silence.startSeconds)}
									/>
								)
							)
						})}
						{props.fillerPlans.map((plan, index) => {
							const start = edited(plan.filler.startSeconds)
							return (
								start !== null && (
									<TimelineFlag
										key={`filler-${index}`}
										kind={plan.kind === 'cut' ? 'filler' : 'fillerReview'}
										atSeconds={start}
										durationSeconds={total}
										className="top-3.5"
										label={t(plan.kind === 'cut' ? 'fillerPinLabel' : 'fillerReviewPinLabel', {
											word: plan.filler.word,
											at: formatTimecode(plan.filler.startSeconds)
										})}
										onJump={() => props.onEditFiller(plan)}
									/>
								)
							)
						})}
						{props.audioIssues.map((issue) => {
							const start = edited(issue.startSeconds)
							return (
								start !== null && (
									<TimelineFlag
										key={`${issue.kind}-${issue.startSeconds}`}
										kind={issue.kind}
										atSeconds={start}
										durationSeconds={total}
										className="top-3.5"
										label={t(`audio.${issue.kind}.pin`, {
											start: formatTimecode(issue.startSeconds),
											end: formatTimecode(issue.endSeconds)
										})}
										onJump={() => props.onSeekSource(issue.startSeconds)}
									/>
								)
							)
						})}
						<div className="relative mt-1 flex h-14 flex-col gap-1">
							{isOriginal ? (
								<div className="border-border-strong bg-surface-hover text-text-muted flex h-14 items-center rounded-lg border px-3 text-xs">
									{t('originalTake', { duration: formatTimecode(total) })}
								</div>
							) : (
								<ol
									role="listbox"
									aria-label={tc('label')}
									aria-multiselectable
									className="flex h-14"
								>
									{clips.map((clip, index) => {
										const played = clipPlayedSeconds(clip, edit, replacements, sourceEdits)
										const of = clip.source ? (sourceNames[clip.source] ?? '') : null
										const isCurrent = index === currentIndex
										const isSelected =
											selected !== null && index >= selected.from && index <= selected.to
										const source = clip.ranges
											.map(
												(r) => `${formatTimecode(r.startSeconds)}–${formatTimecode(r.endSeconds)}`
											)
											.join(', ')
										const label = of
											? tc('clipLabelOf', {
													number: index + 1,
													duration: formatTimecode(played),
													source,
													video: of
												})
											: tc('clipLabel', {
													number: index + 1,
													duration: formatTimecode(played),
													source
												})
										return (
											<li
												key={clip.id}
												role="option"
												tabIndex={0}
												draggable
												aria-selected={isSelected}
												aria-current={isCurrent || undefined}
												aria-label={label}
												aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
												title={label}
												onClick={(event) => select(clip, event.shiftKey)}
												onKeyDown={(event) => handleClipKey(event, clip, index)}
												onDragStart={(event) => {
													// Firefox only starts a drag that carries some data.
													event.dataTransfer.setData('text/plain', clip.id)
													event.dataTransfer.effectAllowed = 'move'
													setDraggingIndex(index)
												}}
												onDragOver={(event) => {
													if (draggingIndex !== null) event.preventDefault()
												}}
												onDrop={(event) => {
													event.preventDefault()
													if (draggingIndex !== null) props.onMove(draggingIndex, index)
													setDraggingIndex(null)
												}}
												onDragEnd={() => setDraggingIndex(null)}
												className={cn(
													'focus-visible:outline-accent relative flex min-w-0 cursor-grab flex-col justify-center gap-0.5 overflow-hidden rounded-md border px-2 select-none focus-visible:outline-2 focus-visible:-outline-offset-2',
													isSelected
														? 'border-text bg-surface-hover ring-text ring-1'
														: isCurrent
															? 'border-accent/70 bg-accent/10'
															: 'border-border-strong bg-surface-hover',
													draggingIndex === index && 'opacity-50'
												)}
												// As wide as it plays; a fully cut clip keeps a sliver.
												style={{
													width: at(played),
													minWidth: played > 0 ? undefined : 4,
													marginLeft: index === 0 ? at(0) : undefined
												}}
											>
												<span className="text-text truncate text-xs font-semibold">
													{tc('clipName', { number: index + 1 })}
													{clip.speed !== undefined && (
														<span className="text-accent-fg ml-1.5">
															{tc('speed', { speed: clip.speed })}
														</span>
													)}
												</span>
												<span className="text-text-muted truncate font-mono text-[10px]">
													{of ?? props.mainName} · {formatTimecode(played)}
												</span>
											</li>
										)
									})}
								</ol>
							)}
							{!isOriginal &&
								props.silences.map((silence) => {
									const start = edited(silence.startSeconds)
									const end = edited(silence.endSeconds)
									return (
										start !== null &&
										end !== null && (
											<div
												key={`shade-${silence.startSeconds}`}
												aria-hidden
												className="bg-warning/20 pointer-events-none absolute inset-y-0"
												style={span(start, end)}
											/>
										)
									)
								})}
							{!isOriginal &&
								props.replacedSpans.map((replaced) => {
									const start = edited(replaced.startSeconds)
									const end = edited(replaced.endSeconds)
									return (
										start !== null &&
										end !== null && (
											<div
												key={`replaced-${replaced.startSeconds}`}
												aria-hidden
												className="bg-accent/25 border-accent/70 pointer-events-none absolute inset-y-0 border-x-2"
												style={span(start, end)}
											/>
										)
									)
								})}
							{trimStart !== null && (
								<TrimHandle
									edge="start"
									seconds={props.trim.range.startSeconds}
									durationSeconds={props.trim.durationSeconds}
									label={t('trimStartLabel')}
									timeAtPointer={trimTime('start')}
									onChange={props.onTrimChange}
									onDraggingChange={onTrimDragging}
									left={at(trimStart)}
									className="top-0 h-14 w-2.5"
								/>
							)}
							{trimEnd !== null && (
								<TrimHandle
									edge="end"
									seconds={props.trim.range.endSeconds}
									durationSeconds={props.trim.durationSeconds}
									label={t('trimEndLabel')}
									timeAtPointer={trimTime('end')}
									onChange={props.onTrimChange}
									onDraggingChange={onTrimDragging}
									left={at(trimEnd)}
									className="top-0 h-14 w-2.5"
								/>
							)}
						</div>
						{!isOriginal && (
							<>
								<Lane
									label={t('lanes.text')}
									rows={textRows}
									height={laneHeight(textRows.length)}
									span={span}
									empty={t('lanes.textEmpty')}
									onSelect={props.onSelectText}
								/>
								<Lane
									label={t('lanes.audio')}
									rows={audioRows}
									height={laneHeight(audioRows.length)}
									span={span}
									icon={<MusicIcon size={12} />}
									onSelect={props.onSelectAudio}
									add={{ label: t('lanes.addAudio'), onAdd: props.onAddAudio }}
								/>
							</>
						)}
						{props.playheadSeconds !== null && (
							<div
								aria-hidden
								className="bg-accent pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 -translate-x-1/2"
								style={{ left: at(props.playheadSeconds) }}
							>
								<div className="bg-accent absolute -top-0.5 left-1/2 h-2.5 w-3 -translate-x-1/2 rounded-sm" />
							</div>
						)}
					</div>
				</div>
				{!isOriginal && (
					<div className="border-border flex flex-wrap items-center gap-2 border-t px-3 py-1.5">
						<button
							type="button"
							onClick={props.onAddVideo}
							className="text-text-muted hover:text-text focus-visible:outline-accent inline-flex items-center gap-1.5 rounded text-xs font-medium focus-visible:outline-2"
						>
							<PlusIcon size={14} />
							{t('addVideo')}
						</button>
						{issueCounts.length > 0 && (
							<p className="text-text-faint text-xs">
								{issueCounts.map(({ kind }) => t(`audio.${kind}.meaning`)).join(' ')}{' '}
								{t('audio.note')}
							</p>
						)}
					</div>
				)}
			</div>
		</section>
	)
}

function ToolbarButton({
	label,
	text,
	icon,
	disabled,
	onClick
}: {
	label: string
	text: string
	icon: React.ReactNode
	disabled: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className="text-text hover:bg-surface-hover focus-visible:outline-accent inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40"
		>
			{icon}
			{text}
		</button>
	)
}

/** Items in rows: an item overlapping one before it goes on a row of its own. */
function laneRows(items: LaneItem[]): LaneItem[][] {
	const rows: LaneItem[][] = []
	for (const item of [...items].sort((a, b) => a.startSeconds - b.startSeconds)) {
		const row = rows.find((each) => (each.at(-1)?.endSeconds ?? 0) <= item.startSeconds)
		if (row) row.push(item)
		else rows.push([item])
	}
	return rows
}

/** A lane of things over the video or under it: one bar each, picked by a click. */
function Lane({
	label,
	rows,
	height,
	span,
	empty,
	icon,
	onSelect,
	add
}: {
	label: string
	rows: LaneItem[][]
	height: string
	span: (start: number, end: number) => { left: string; width: string }
	empty?: string
	icon?: React.ReactNode
	onSelect: (id: string) => void
	add?: { label: string; onAdd: () => void }
}) {
	return (
		<div
			role="group"
			aria-label={label}
			className="relative mt-1 flex flex-col gap-0.5"
			style={{ height }}
		>
			{rows.length === 0 && (
				<div className="border-border text-text-faint flex h-8 items-center justify-center rounded-md border border-dashed text-xs">
					{add ? (
						<button
							type="button"
							onClick={add.onAdd}
							className="hover:text-text focus-visible:outline-accent inline-flex h-full w-full items-center justify-center gap-1.5 rounded-md focus-visible:outline-2"
						>
							<PlusIcon size={12} />
							{add.label}
						</button>
					) : (
						empty
					)}
				</div>
			)}
			{rows.map((row, index) => (
				<div key={index} className="relative h-8">
					{row.map((item) => (
						<button
							key={item.id}
							type="button"
							aria-pressed={item.selected ?? false}
							onClick={() => onSelect(item.id)}
							title={item.label}
							className={cn(
								'focus-visible:outline-accent absolute inset-y-0 flex min-w-6 items-center gap-1 overflow-hidden rounded-md border px-2 text-left text-xs focus-visible:outline-2',
								item.selected
									? 'border-accent bg-accent/20 text-text'
									: 'border-border-strong bg-surface-hover text-text-muted hover:text-text'
							)}
							style={span(item.startSeconds, item.endSeconds)}
						>
							{icon}
							<span className="truncate">{item.label}</span>
						</button>
					))}
				</div>
			))}
			{add && rows.length > 0 && (
				<button
					type="button"
					aria-label={add.label}
					title={add.label}
					onClick={add.onAdd}
					className="bg-surface border-border text-text-muted hover:text-text focus-visible:outline-accent absolute top-1 right-1 z-10 inline-flex size-6 items-center justify-center rounded border focus-visible:outline-2"
				>
					<PlusIcon size={12} />
				</button>
			)}
		</div>
	)
}
