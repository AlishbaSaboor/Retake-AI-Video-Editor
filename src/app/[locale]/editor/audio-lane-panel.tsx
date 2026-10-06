'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import {
	itemEnd,
	moveItem,
	trimItem,
	withVolume,
	type AudioItem,
	type ExtractBlocker
} from './audio-lane'
import { MAX_VOLUME } from './clip-audio'
import { formatTimecode, timeToPercent, type TrimEdge } from './timeline-scale'
import { TrimHandle } from './trim-handle'
import { MoreInfo } from './more-info'

const PERCENT = 100
const VOLUME_STEP_PERCENT = 5
const SECONDS_STEP = 0.1
// Arrow keys on a bar move it a tenth of a second, Shift+arrow a second, as trims do.
const STEPS = { small: 0.1, large: 1 }

type AudioLanePanelProps = {
	items: AudioItem[]
	/** The edited video's length: the lane's whole width. */
	editedSeconds: number
	/** Where playback is in the edited video; null outside it. */
	playheadSeconds: number | null
	/** Per clip, why its sound can't be extracted; null where it can. */
	extractBlockers: (ExtractBlocker | null)[]
	/** False outside the Edited view: the lane is part of the edit. */
	canEdit: boolean
	/** Asks for an audio file, to start at `seconds` of the edited video. */
	onAddFile: (seconds: number) => void
	onExtract: (clip: number) => void
	/** One change: a move, a trim, a volume, a mute. */
	onChange: (item: AudioItem) => void
	onDelete: (id: string) => void
}

/**
 * The Audio lane: added files and extracted clip sounds over the edited
 * video's length, each a bar to drag (its edges trim it), with its start,
 * volume, mute and delete. A drag is one change, on release.
 */
export function AudioLanePanel({
	items,
	editedSeconds,
	playheadSeconds,
	extractBlockers,
	canEdit,
	onAddFile,
	onExtract,
	onChange,
	onDelete
}: AudioLanePanelProps) {
	const t = useTranslations('Editor.audioLane')
	const id = useId()
	const [clip, setClip] = useState(0)
	const chosen = clip < extractBlockers.length ? clip : 0
	const blocker = extractBlockers[chosen] ?? null
	const trackRef = useRef<HTMLDivElement>(null)

	function timeAtPointer(clientX: number): number {
		const bounds = trackRef.current?.getBoundingClientRect()
		if (!bounds || bounds.width === 0) return 0
		return ((clientX - bounds.left) / bounds.width) * editedSeconds
	}

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<h2 className="sr-only">{t('label')}</h2>
			<div className="flex flex-wrap items-end gap-3">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!canEdit}
					onClick={() => onAddFile(playheadSeconds ?? 0)}
				>
					{t('addFile')}
				</Button>
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${id}-clip`}>{t('extractFrom')}</Label>
					<select
						id={`${id}-clip`}
						value={chosen}
						onChange={(event) => setClip(Number(event.target.value))}
						className="border-border bg-surface text-text h-9 rounded-md border px-2 text-sm"
					>
						{extractBlockers.map((_, index) => (
							<option key={index} value={index}>
								{t('clip', { number: index + 1 })}
							</option>
						))}
					</select>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!canEdit || blocker !== null}
					onClick={() => onExtract(chosen)}
				>
					{t('extract')}
				</Button>
				{blocker && <span className="text-text-muted pb-2 text-xs">{t(`blocked.${blocker}`)}</span>}
			</div>
			{items.length === 0 ? (
				<p className="text-text-muted text-xs">{t('empty')}</p>
			) : (
				<div className="flex flex-col gap-3">
					{items.map((item, index) => (
						<LaneRow
							// Follows the item, so an undo resets what's typed.
							key={`${item.id}-${item.atSeconds}-${item.seconds}-${item.volume}-${item.muted}`}
							item={item}
							number={index + 1}
							editedSeconds={editedSeconds}
							playheadSeconds={playheadSeconds}
							canEdit={canEdit}
							trackRef={index === 0 ? trackRef : undefined}
							timeAtPointer={timeAtPointer}
							onChange={onChange}
							onDelete={onDelete}
						/>
					))}
				</div>
			)}
			<MoreInfo>{t('hint')}</MoreInfo>
		</section>
	)
}

function LaneRow({
	item,
	number,
	editedSeconds,
	playheadSeconds,
	canEdit,
	trackRef,
	timeAtPointer,
	onChange,
	onDelete
}: {
	item: AudioItem
	number: number
	editedSeconds: number
	playheadSeconds: number | null
	canEdit: boolean
	trackRef: React.RefObject<HTMLDivElement | null> | undefined
	timeAtPointer: (clientX: number) => number
	onChange: (item: AudioItem) => void
	onDelete: (id: string) => void
}) {
	const t = useTranslations('Editor.audioLane')
	const id = useId()
	// The bar being dragged and where it is so far; committed on release.
	const [draft, setDraft] = useState<AudioItem | null>(null)
	const dragRef = useRef<{ fromSeconds: number; item: AudioItem } | null>(null)
	const [start, setStart] = useState(String(Math.round(item.atSeconds * 100) / 100))
	const [volume, setVolume] = useState(Math.round(item.volume * PERCENT))
	const shown = draft ?? item
	const name = t('item', { number, name: item.name })
	// Every row's track is the edited video's length (the first one's measures
	// pointer time for them all); an item running past the end is cut off there.
	const lane = editedSeconds

	function commit(next: AudioItem) {
		if (
			next.atSeconds !== item.atSeconds ||
			next.seconds !== item.seconds ||
			next.skipSeconds !== item.skipSeconds
		) {
			onChange(next)
		}
	}

	function commitStart() {
		const seconds = Number.parseFloat(start)
		if (!Number.isFinite(seconds)) {
			setStart(String(item.atSeconds))
			return
		}
		commit(moveItem(item, seconds))
	}

	function commitVolume() {
		const next = withVolume(item, volume / PERCENT)
		if (next.volume !== item.volume) onChange(next)
	}

	return (
		<div role="group" aria-label={name} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<span className="text-text w-40 shrink-0 truncate text-xs font-medium" title={item.name}>
					{name}
				</span>
				<div
					ref={trackRef}
					className="bg-surface-inset relative h-7 flex-1 overflow-hidden rounded-md"
				>
					{playheadSeconds !== null && (
						<span
							aria-hidden
							className="bg-text-muted/60 absolute inset-y-0 w-px"
							style={{ left: timeToPercent(playheadSeconds, lane) }}
						/>
					)}
					<div
						role="button"
						tabIndex={0}
						aria-label={t('bar', {
							name,
							start: formatTimecode(shown.atSeconds),
							end: formatTimecode(itemEnd(shown))
						})}
						aria-disabled={!canEdit}
						className={cn(
							'border-accent-secondary bg-accent-secondary/40 focus-visible:outline-accent absolute inset-y-1 touch-none rounded border focus-visible:outline-2',
							canEdit && 'cursor-grab',
							item.muted && 'opacity-40'
						)}
						style={{
							left: timeToPercent(shown.atSeconds, lane),
							width: timeToPercent(shown.seconds, lane)
						}}
						onPointerDown={(event) => {
							if (!canEdit) return
							event.currentTarget.setPointerCapture(event.pointerId)
							dragRef.current = { fromSeconds: timeAtPointer(event.clientX), item }
							setDraft(item)
						}}
						onPointerMove={(event) => {
							const drag = dragRef.current
							if (!drag) return
							const delta = timeAtPointer(event.clientX) - drag.fromSeconds
							setDraft(moveItem(drag.item, drag.item.atSeconds + delta))
						}}
						onLostPointerCapture={() => {
							dragRef.current = null
							setDraft(null)
							commit(shown)
						}}
						onKeyDown={(event) => {
							if (!canEdit) return
							const step = event.shiftKey ? STEPS.large : STEPS.small
							const delta = { ArrowRight: step, ArrowLeft: -step }[event.key]
							if (delta === undefined) return
							event.preventDefault()
							commit(moveItem(item, item.atSeconds + delta))
						}}
					/>
					{canEdit &&
						(['start', 'end'] as const).map((edge) => (
							<TrimHandle
								key={edge}
								edge={edge}
								seconds={edge === 'start' ? shown.atSeconds : itemEnd(shown)}
								durationSeconds={lane}
								label={t(edge, { name })}
								timeAtPointer={timeAtPointer}
								onChange={(moved: TrimEdge, seconds: number) => {
									const next = trimItem(draft ?? item, moved, seconds)
									// While a handle is dragged, only the draft moves; a key press is a change of its own.
									if (draft) setDraft(next)
									else commit(next)
								}}
								onDraggingChange={(dragging) => {
									if (dragging) setDraft(item)
									else {
										setDraft(null)
										commit(shown)
									}
								}}
								steps={STEPS}
								className="inset-y-0"
							/>
						))}
				</div>
			</div>
			<div className="flex flex-wrap items-end gap-3 pl-43">
				<form
					className="flex flex-col gap-1"
					onSubmit={(event) => {
						event.preventDefault()
						commitStart()
					}}
				>
					<Label htmlFor={`${id}-start`}>{t('startsAt')}</Label>
					<Input
						id={`${id}-start`}
						type="number"
						min={0}
						step={SECONDS_STEP}
						value={start}
						disabled={!canEdit}
						onChange={(event) => setStart(event.target.value)}
						onBlur={commitStart}
						className="w-24"
					/>
				</form>
				<div className="flex min-w-40 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-volume`}>{t('volume', { percent: volume })}</Label>
					<input
						id={`${id}-volume`}
						type="range"
						min={0}
						max={MAX_VOLUME * PERCENT}
						step={VOLUME_STEP_PERCENT}
						value={volume}
						disabled={!canEdit}
						onChange={(event) => setVolume(event.target.valueAsNumber)}
						onPointerUp={commitVolume}
						onKeyUp={commitVolume}
						onBlur={commitVolume}
						className="accent-accent h-9"
					/>
				</div>
				<Button
					type="button"
					size="sm"
					variant={item.muted ? 'secondary' : 'ghost'}
					aria-pressed={item.muted}
					disabled={!canEdit}
					onClick={() => onChange({ ...item, muted: !item.muted })}
				>
					{t('mute')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={!canEdit}
					onClick={() => onDelete(item.id)}
				>
					{t('delete')}
				</Button>
			</div>
		</div>
	)
}
