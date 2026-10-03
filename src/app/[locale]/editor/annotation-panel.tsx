'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import {
	DEFAULT_BOX_COLOR,
	moveSpan,
	moveSpanEdge,
	newSpan,
	type Annotation,
	type AnnotationTool,
	type NewAnnotation,
	type Rect,
	type Span
} from './annotations'
import { formatTimecode, timeToPercent, type TrimEdge } from './timeline-scale'
import { TrimHandle } from './trim-handle'

const TOOLS: AnnotationTool[] = ['select', 'box', 'blur', 'pixelate', 'text', 'erase']
// Arrow keys on a bar move it a tenth of a second, Shift+arrow a second, as trims do.
const STEPS = { small: 0.1, large: 1 }

/** The picked tool, the color new boxes get and the words new text shows; shared by the panel and the layer. */
export function useAnnotationTools() {
	const [tool, setTool] = useState<AnnotationTool | null>(null)
	const [color, setColor] = useState(DEFAULT_BOX_COLOR)
	const [text, setText] = useState('')

	/** What drawing `rect` with the picked tool adds, shown from `seconds`; null if nothing. */
	function drawn(rect: Rect, seconds: number, editedSeconds: number): NewAnnotation | null {
		const shape = { rect, ...newSpan(seconds, editedSeconds) }
		if (tool === 'box') return { kind: 'box', color, ...shape }
		if (tool === 'blur' || tool === 'pixelate') return { kind: tool, ...shape }
		if (tool === 'text' && text.trim()) return { kind: 'text', text: text.trim(), ...shape }
		return null
	}

	return { tool, setTool, color, setColor, text, setText, drawn }
}

type AnnotationPanelProps = {
	tools: ReturnType<typeof useAnnotationTools>
	annotations: Annotation[]
	/** The edited video's length: the lane's whole width. */
	editedSeconds: number
	/** Where playback is in the edited video; null outside it (the Original view, a preview). */
	playheadSeconds: number | null
	onChange: (item: Annotation) => void
	onErase: (id: string) => void
}

/**
 * The annotation tools, and a lane under them with one bar per item over
 * the edited video's length: drag a bar to move its time, its edges to
 * change when it starts and ends. A drag shows as it goes and is handed up
 * once, on release, so it is one change; each arrow key is one too.
 */
export function AnnotationPanel({
	tools,
	annotations,
	editedSeconds,
	playheadSeconds,
	onChange,
	onErase
}: AnnotationPanelProps) {
	const t = useTranslations('Editor.annotations')
	const id = useId()
	const canDraw = playheadSeconds !== null

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 shadow-xl"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			<div className="flex flex-wrap items-end gap-3">
				<div role="group" aria-label={t('toolsLabel')} className="flex flex-wrap gap-1">
					{TOOLS.map((option) => (
						<Button
							key={option}
							type="button"
							size="sm"
							variant={option === tools.tool ? 'secondary' : 'ghost'}
							aria-pressed={option === tools.tool}
							disabled={!canDraw || (option === 'text' && !tools.text.trim())}
							onClick={() => tools.setTool(option === tools.tool ? null : option)}
						>
							{t(`tools.${option}`)}
						</Button>
					))}
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${id}-color`}>{t('color')}</Label>
					<input
						id={`${id}-color`}
						type="color"
						value={tools.color}
						onChange={(event) => tools.setColor(event.target.value)}
						className="border-border h-9 w-14 cursor-pointer rounded-md border bg-transparent"
					/>
				</div>
				<div className="flex min-w-40 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-text`}>{t('text')}</Label>
					<Input
						id={`${id}-text`}
						value={tools.text}
						onChange={(event) => tools.setText(event.target.value)}
					/>
				</div>
			</div>
			<p className="text-text-muted -mt-2 text-xs">
				{canDraw ? t('hint') : t('originalHint')} {t('staysPut')}
			</p>
			<AnnotationLane
				annotations={annotations}
				editedSeconds={editedSeconds}
				playheadSeconds={playheadSeconds}
				erasing={tools.tool === 'erase'}
				onChange={onChange}
				onErase={onErase}
			/>
		</section>
	)
}

type AnnotationLaneProps = Omit<AnnotationPanelProps, 'tools'> & { erasing: boolean }

function AnnotationLane({
	annotations,
	editedSeconds,
	playheadSeconds,
	erasing,
	onChange,
	onErase
}: AnnotationLaneProps) {
	const t = useTranslations('Editor.annotations')
	const trackRef = useRef<HTMLDivElement>(null)
	// The bar being dragged and where it is so far; committed on release.
	const [draft, setDraft] = useState<{ id: string; span: Span } | null>(null)
	const barDragRef = useRef<{ fromSeconds: number; span: Span } | null>(null)

	function timeAtPointer(clientX: number): number {
		const bounds = trackRef.current?.getBoundingClientRect()
		if (!bounds || bounds.width === 0) return 0
		return ((clientX - bounds.left) / bounds.width) * editedSeconds
	}

	function commit(item: Annotation, span: Span) {
		if (span.startSeconds !== item.startSeconds || span.endSeconds !== item.endSeconds) {
			onChange({ ...item, ...span })
		}
	}

	if (annotations.length === 0) {
		return <p className="text-text-muted text-xs">{t('empty')}</p>
	}
	return (
		<div className="flex flex-col gap-1">
			<p className="text-text-muted text-xs">{t('lane')}</p>
			{annotations.map((item, index) => {
				const span = draft?.id === item.id ? draft.span : item
				const name = t('item', { kind: t(`kinds.${item.kind}`), number: index + 1 })
				const moveEdge = (edge: TrimEdge, seconds: number) => {
					const next = moveSpanEdge(span, edge, seconds, editedSeconds)
					// While a handle is dragged, only the draft moves; a key press is a change of its own.
					if (draft?.id === item.id) setDraft({ id: item.id, span: next })
					else commit(item, next)
				}
				return (
					<div key={item.id} className="flex items-center gap-3">
						<span className="text-text-muted w-16 shrink-0 truncate text-xs">{name}</span>
						<div
							// Every row's track is the same width (the label column is fixed), so
							// the first one's measures pointer time for them all.
							ref={index === 0 ? trackRef : undefined}
							className="bg-surface-inset relative h-7 flex-1 rounded-md"
						>
							{playheadSeconds !== null && (
								<span
									aria-hidden
									className="bg-text-muted/60 absolute inset-y-0 w-px"
									style={{ left: timeToPercent(playheadSeconds, editedSeconds) }}
								/>
							)}
							<div
								role="button"
								tabIndex={0}
								aria-label={t('bar', {
									name,
									start: formatTimecode(span.startSeconds),
									end: formatTimecode(span.endSeconds)
								})}
								title={t('barHint')}
								className={cn(
									'bg-accent/40 border-accent focus-visible:outline-accent absolute inset-y-1 touch-none rounded border focus-visible:outline-2',
									erasing ? 'cursor-not-allowed' : 'cursor-grab'
								)}
								style={{
									left: timeToPercent(span.startSeconds, editedSeconds),
									width: timeToPercent(span.endSeconds - span.startSeconds, editedSeconds)
								}}
								onPointerDown={(event) => {
									if (erasing) {
										onErase(item.id)
										return
									}
									event.currentTarget.setPointerCapture(event.pointerId)
									barDragRef.current = { fromSeconds: timeAtPointer(event.clientX), span: item }
									setDraft({ id: item.id, span: item })
								}}
								onPointerMove={(event) => {
									const start = barDragRef.current
									if (!start) return
									const delta = timeAtPointer(event.clientX) - start.fromSeconds
									setDraft({ id: item.id, span: moveSpan(start.span, delta, editedSeconds) })
								}}
								onLostPointerCapture={() => {
									barDragRef.current = null
									setDraft(null)
									commit(item, span)
								}}
								onKeyDown={(event) => {
									if (event.key === 'Delete' || event.key === 'Backspace') {
										event.preventDefault()
										onErase(item.id)
										return
									}
									const step = event.shiftKey ? STEPS.large : STEPS.small
									const delta = { ArrowRight: step, ArrowLeft: -step }[event.key]
									if (delta === undefined) return
									event.preventDefault()
									commit(item, moveSpan(item, delta, editedSeconds))
								}}
							/>
							{(['start', 'end'] as const).map((edge) => (
								<TrimHandle
									key={edge}
									edge={edge}
									seconds={edge === 'start' ? span.startSeconds : span.endSeconds}
									durationSeconds={editedSeconds}
									label={t(edge, { name })}
									timeAtPointer={timeAtPointer}
									onChange={moveEdge}
									onDraggingChange={(dragging) => {
										if (dragging) setDraft({ id: item.id, span: item })
										else {
											setDraft(null)
											commit(item, span)
										}
									}}
									steps={STEPS}
									className="inset-y-0"
								/>
							))}
						</div>
					</div>
				)
			})}
		</div>
	)
}
