'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { MergeIcon, SplitIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { Edit } from './cleanup'
import { clipIndexAt, clipPlayedSeconds, type Clip, type Replacement } from './sequence'
import { formatTimecode } from './timeline-scale'

type ClipStripProps = {
	clips: Clip[]
	edit: Edit
	replacements: readonly Replacement[]
	currentTimeSeconds: number
	canSplit: boolean
	onSplit: () => void
	onMove: (from: number, to: number) => void
	onMerge: (from: number, to: number) => void
}

const MOVE_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
const SELECT_KEYS = new Set([' ', 'Enter'])

/**
 * Selection is a run from an anchor clip to a focus clip, kept by id so it
 * survives a reorder or split elsewhere — and always contiguous, so whatever
 * is selected can be merged.
 */
type Selection = { anchorId: string; focusId: string }

/**
 * The take as its clips, in playback order, each as wide as it plays for
 * (after trim, cuts and re-recorded takes). The clip under the playhead is highlighted. Clips
 * reorder by dragging, or with Alt+arrow keys so it isn't mouse-only; a
 * selected run of them merges into one.
 */
export function ClipStrip({
	clips,
	edit,
	replacements,
	currentTimeSeconds,
	canSplit,
	onSplit,
	onMove,
	onMerge
}: ClipStripProps) {
	const t = useTranslations('Editor.clips')
	const currentIndex = clipIndexAt(clips, currentTimeSeconds)
	const hintId = useId()
	const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
	const [selection, setSelection] = useState<Selection | null>(null)

	const anchor = clips.findIndex((c) => c.id === selection?.anchorId)
	const focus = clips.findIndex((c) => c.id === selection?.focusId)
	const selected =
		anchor >= 0 && focus >= 0
			? { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
			: null

	function select(clip: Clip, extend: boolean) {
		setSelection((current) => ({
			anchorId: extend && current ? current.anchorId : clip.id,
			focusId: clip.id
		}))
	}

	function handleKeyDown(event: KeyboardEvent, clip: Clip, index: number) {
		if (SELECT_KEYS.has(event.key)) {
			event.preventDefault()
			select(clip, event.shiftKey)
			return
		}
		const step = MOVE_KEYS[event.key]
		if (!event.altKey || step === undefined) return
		event.preventDefault()
		onMove(index, index + step)
	}

	function merge() {
		if (!selected) return
		onMerge(selected.from, selected.to)
		setSelection(null)
	}

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface rounded-2xl border p-4 shadow-xl"
		>
			<div className="border-border mb-3 flex items-center gap-2 border-b pb-3">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
				<span className="text-text-muted text-xs">{t('count', { count: clips.length })}</span>
				<div className="ml-auto flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={!selected || selected.to === selected.from}
						onClick={merge}
					>
						<MergeIcon />
						{t('merge')}
					</Button>
					<Button variant="outline" size="sm" disabled={!canSplit} onClick={onSplit}>
						<SplitIcon />
						{t('split')}
					</Button>
				</div>
			</div>
			<ol
				role="listbox"
				aria-label={t('label')}
				aria-multiselectable
				aria-describedby={hintId}
				className="flex gap-1.5"
			>
				{clips.map((clip, index) => {
					const playedSeconds = clipPlayedSeconds(clip, edit, replacements)
					const isCurrent = index === currentIndex
					const isSelected = selected !== null && index >= selected.from && index <= selected.to
					const source = clip.ranges
						.map((r) => `${formatTimecode(r.startSeconds)}–${formatTimecode(r.endSeconds)}`)
						.join(', ')
					const label = t('clipLabel', {
						number: index + 1,
						duration: formatTimecode(playedSeconds),
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
							onKeyDown={(event) => handleKeyDown(event, clip, index)}
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
								if (draggingIndex !== null) onMove(draggingIndex, index)
								setDraggingIndex(null)
							}}
							onDragEnd={() => setDraggingIndex(null)}
							className={cn(
								'focus-visible:outline-accent flex min-w-16 basis-0 cursor-grab flex-col gap-0.5 rounded-lg border px-3 py-2 select-none focus-visible:outline-2 focus-visible:outline-offset-2',
								isCurrent ? 'border-accent bg-accent/10' : 'border-border-strong bg-surface-hover',
								isSelected && 'ring-accent-secondary ring-2',
								draggingIndex === index && 'opacity-50'
							)}
							// Width is proportional to play time; a fully cut clip keeps a sliver.
							style={{ flexGrow: Math.max(playedSeconds, 0.01) }}
						>
							<span className="text-text truncate text-xs font-semibold">
								{t('clipName', { number: index + 1 })}
							</span>
							<span className="text-text-muted font-mono text-xs">
								{formatTimecode(playedSeconds)}
								{clip.speed !== undefined && (
									<span className="text-accent ml-1.5 font-semibold">
										{t('speed', { speed: clip.speed })}
									</span>
								)}
							</span>
						</li>
					)
				})}
			</ol>
			<p id={hintId} className="text-text-muted mt-2 text-xs">
				{t('reorderHint')} {t('selectionHint')}
			</p>
		</section>
	)
}
