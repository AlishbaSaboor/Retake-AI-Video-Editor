'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SplitIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { Edit } from './cleanup'
import { clipIndexAt, clipPlayedSeconds, type Clip } from './sequence'
import { formatTimecode } from './timeline-scale'

type ClipStripProps = {
	clips: Clip[]
	edit: Edit
	currentTimeSeconds: number
	canSplit: boolean
	onSplit: () => void
	onMove: (from: number, to: number) => void
}

const MOVE_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }

/**
 * The take as its clips, in playback order, each as wide as it plays for
 * (after trim and cuts). The clip under the playhead is highlighted. Clips
 * reorder by dragging, or with Alt+arrow keys so it isn't mouse-only.
 */
export function ClipStrip({
	clips,
	edit,
	currentTimeSeconds,
	canSplit,
	onSplit,
	onMove
}: ClipStripProps) {
	const t = useTranslations('Editor.clips')
	const currentIndex = clipIndexAt(clips, currentTimeSeconds)
	const hintId = useId()
	const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

	function handleKeyDown(event: KeyboardEvent, index: number) {
		const step = MOVE_KEYS[event.key]
		if (!event.altKey || step === undefined) return
		event.preventDefault()
		onMove(index, index + step)
	}

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface rounded-2xl border p-4 shadow-xl"
		>
			<div className="border-border mb-3 flex items-center gap-2 border-b pb-3">
				<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
				<span className="text-text-muted text-xs">{t('count', { count: clips.length })}</span>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto"
					disabled={!canSplit}
					onClick={onSplit}
				>
					<SplitIcon />
					{t('split')}
				</Button>
			</div>
			<ol className="flex gap-1.5" aria-describedby={hintId}>
				{clips.map((clip, index) => {
					const playedSeconds = clipPlayedSeconds(clip, edit)
					const isCurrent = index === currentIndex
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
							tabIndex={0}
							draggable
							aria-current={isCurrent || undefined}
							aria-label={label}
							aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
							title={label}
							onKeyDown={(event) => handleKeyDown(event, index)}
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
								'focus-visible:ring-accent flex min-w-16 basis-0 cursor-grab flex-col gap-0.5 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2',
								isCurrent ? 'border-accent bg-accent/10' : 'border-border-strong bg-surface-hover',
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
							</span>
						</li>
					)
				})}
			</ol>
			<p id={hintId} className="text-text-muted mt-2 text-xs">
				{t('reorderHint')}
			</p>
		</section>
	)
}
