'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import {
	annotationsAt,
	BLUR_BLOCK_FRACTION,
	isBigEnough,
	moveRect,
	rectBetween,
	resizeRect,
	TEXT_HEIGHT_FRACTION,
	type Annotation,
	type AnnotationTool,
	type Rect
} from './annotations'
import { fitInside, TITLE_BAND_COLOR } from './overlays'

/** The editor's player frame, `aspect-video`. */
const FRAME_RATIO = 16 / 9
const PERCENT = 100
// The preview's blur is CSS's own (backdrop-filter, on the GPU): a Gaussian
// about half a blur block wide, which looks like the export's averaging.
const PREVIEW_BLUR = `blur(${(BLUR_BLOCK_FRACTION * PERCENT) / 2}cqw)`

type Point = { x: number; y: number }
type Drag =
	| { type: 'draw'; from: Point; to: Point }
	| { type: 'move' | 'resize'; item: Annotation; from: Point; to: Point }

type AnnotationLayerProps = {
	annotations: Annotation[]
	/** Where playback is in the edited video: only the items due then show. */
	editedSeconds: number
	picture: { width: number; height: number }
	/** Null when no tool is picked: the layer only shows, and the player's controls work. */
	tool: AnnotationTool | null
	/** A pointer went down on the picture with a tool, so playback should stop. */
	onPointerStart: () => void
	onDraw: (rect: Rect) => void
	onChange: (item: Annotation) => void
	onErase: (id: string) => void
}

const position = (rect: Rect) => ({
	left: `${rect.x * PERCENT}%`,
	top: `${rect.y * PERCENT}%`,
	width: `${rect.width * PERCENT}%`,
	height: `${rect.height * PERCENT}%`
})

/**
 * The annotations over the player, where the export draws them (fractions
 * of the picture's own box, which skips the letterbox bars), and, with a
 * tool picked, where they're drawn, moved, resized and erased. A drag is
 * shown as it goes and handed up once, on release, so it is one change.
 */
export function AnnotationLayer({
	annotations,
	editedSeconds,
	picture,
	tool,
	onPointerStart,
	onDraw,
	onChange,
	onErase
}: AnnotationLayerProps) {
	const layerRef = useRef<HTMLDivElement>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [drag, setDrag] = useState<Drag | null>(null)
	const box = fitInside(picture.width / picture.height, FRAME_RATIO)
	const shown = annotationsAt(annotations, editedSeconds)

	function pointAt(event: React.PointerEvent): Point {
		const bounds = layerRef.current?.getBoundingClientRect()
		if (!bounds) return { x: 0, y: 0 }
		return {
			x: (event.clientX - bounds.left) / bounds.width,
			y: (event.clientY - bounds.top) / bounds.height
		}
	}

	/** Where an item is while it's being dragged, and where it'll be put. */
	function draggedRect(current: Drag): Rect {
		if (current.type === 'draw') return rectBetween(current.from, current.to)
		const { item, from, to } = current
		return current.type === 'move'
			? moveRect(item.rect, to.x - from.x, to.y - from.y)
			: resizeRect(item.rect, to.x, to.y)
	}

	function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
		if (!tool) return
		onPointerStart()
		const point = pointAt(event)
		const target = event.target instanceof Element ? event.target : null
		const id = target?.closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
		const item = shown.find((a) => a.id === id)
		if (tool === 'erase') {
			if (item) onErase(item.id)
			return
		}
		if (tool === 'select') {
			setSelectedId(item?.id ?? null)
			if (!item) return
			const type = target?.closest('[data-resize]') ? 'resize' : 'move'
			setDrag({ type, item, from: point, to: point })
		} else {
			setDrag({ type: 'draw', from: point, to: point })
		}
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function handlePointerUp() {
		if (!drag) return
		const rect = draggedRect(drag)
		setDrag(null)
		if (drag.type === 'draw') {
			if (isBigEnough(rect)) onDraw(rect)
		} else if (
			rect.x !== drag.item.rect.x ||
			rect.y !== drag.item.rect.y ||
			rect.width !== drag.item.rect.width ||
			rect.height !== drag.item.rect.height
		) {
			onChange({ ...drag.item, rect })
		}
	}

	const drawing = drag?.type === 'draw' ? draggedRect(drag) : null
	return (
		<div
			ref={layerRef}
			data-testid="annotation-layer"
			className={cn(
				'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 touch-none',
				tool ? 'pointer-events-auto' : 'pointer-events-none',
				tool && tool !== 'select' && tool !== 'erase' && 'cursor-crosshair',
				tool === 'erase' && 'cursor-not-allowed'
			)}
			style={{
				width: `${box.widthPercent}%`,
				height: `${box.heightPercent}%`,
				containerType: 'size'
			}}
			onPointerDown={handlePointerDown}
			onPointerMove={(event) => {
				if (drag) setDrag({ ...drag, to: pointAt(event) })
			}}
			onPointerUp={handlePointerUp}
			onLostPointerCapture={handlePointerUp}
		>
			{shown.map((item) => {
				const rect =
					drag && drag.type !== 'draw' && drag.item.id === item.id ? draggedRect(drag) : item.rect
				const selected = tool === 'select' && item.id === selectedId
				return (
					<div
						key={item.id}
						data-annotation-id={item.id}
						data-annotation-kind={item.kind}
						className={cn(
							'absolute overflow-hidden',
							tool && 'outline-1 outline-white/60 outline-dashed',
							selected && 'outline-accent outline-2 outline-solid',
							tool === 'select' && 'cursor-move'
						)}
						style={{
							...position(rect),
							...(item.kind === 'box' && { background: item.color }),
							...(item.kind === 'blur' && {
								backdropFilter: PREVIEW_BLUR,
								WebkitBackdropFilter: PREVIEW_BLUR
							}),
							...(item.kind === 'text' && {
								background: TITLE_BAND_COLOR,
								fontSize: `${rect.height * TEXT_HEIGHT_FRACTION * PERCENT}cqh`
							})
						}}
					>
						{item.kind === 'text' && (
							<span className="flex h-full items-center justify-center font-sans leading-none font-bold whitespace-nowrap text-white">
								{item.text}
							</span>
						)}
						{selected && (
							<span
								data-resize
								aria-hidden
								className="bg-accent absolute right-0 bottom-0 size-3 cursor-nwse-resize"
							/>
						)}
					</div>
				)
			})}
			{drawing && (
				<div
					className="absolute border-2 border-dashed border-white/80"
					style={position(drawing)}
				/>
			)}
		</div>
	)
}
