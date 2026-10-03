'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import {
	annotationsAt,
	BLUR_BLOCK_FRACTION,
	isBigEnough,
	moveRect,
	obscureGridSize,
	rectBetween,
	resizeRect,
	TEXT_HEIGHT_FRACTION,
	toPixels,
	type Annotation,
	type AnnotationTool,
	type Rect
} from './annotations'
import { TITLE_BAND_COLOR } from './overlays'
import type { Size } from './transform'

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
	/** The source picture's size, in its pixels. */
	picture: Size
	/** The video, which a pixelate samples. */
	videoRef: RefObject<HTMLVideoElement | null>
	/** A pointer's screen position as a point on the picture (fractions), through any transform. */
	toPicture: (clientX: number, clientY: number) => Point
	/** -1 on an axis the picture is flipped on: text is drawn back the right way round. */
	flip: { x: number; y: number }
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
 * A pixelate in the preview: the picture under it shrunk into a canvas one
 * pixel per block, every frame, and shown stretched with hard edges
 * (`image-rendering: pixelated`), as the export draws it.
 */
function PixelatePatch({
	rect,
	picture,
	videoRef
}: {
	rect: Rect
	picture: Size
	videoRef: RefObject<HTMLVideoElement | null>
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const pixels = toPixels(rect, picture.width, picture.height)
	const grid = obscureGridSize(pixels, picture.width, 'pixelate')
	const { x, y, width, height } = pixels
	useEffect(() => {
		let frame = 0
		const draw = () => {
			const video = videoRef.current
			const context = canvasRef.current?.getContext('2d')
			if (video && context && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				context.imageSmoothingQuality = 'high'
				context.drawImage(video, x, y, width, height, 0, 0, grid.width, grid.height)
			}
			frame = requestAnimationFrame(draw)
		}
		draw()
		return () => cancelAnimationFrame(frame)
	}, [videoRef, x, y, width, height, grid.width, grid.height])
	return (
		<canvas
			ref={canvasRef}
			width={grid.width}
			height={grid.height}
			className="absolute inset-0 h-full w-full"
			style={{ imageRendering: 'pixelated' }}
		/>
	)
}

/**
 * The annotations on the picture, where the export draws them (fractions of
 * the source picture, inside PictureFrame's picture box, so they turn, flip
 * and crop with it), and, with a tool picked, where they're drawn, moved,
 * resized and erased. A drag is shown as it goes and handed up once, on
 * release, so it is one change.
 */
export function AnnotationLayer({
	annotations,
	editedSeconds,
	picture,
	videoRef,
	toPicture,
	flip,
	tool,
	onPointerStart,
	onDraw,
	onChange,
	onErase
}: AnnotationLayerProps) {
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [drag, setDrag] = useState<Drag | null>(null)
	// The drag as of the last pointer move: the release can come before React
	// renders it, so the release reads this, not `drag`.
	const latestRef = useRef<Drag | null>(null)
	const follow = (next: Drag | null) => {
		latestRef.current = next
		setDrag(next)
	}
	const shown = annotationsAt(annotations, editedSeconds)
	const pointAt = (event: React.PointerEvent) => toPicture(event.clientX, event.clientY)

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
			follow({ type, item, from: point, to: point })
		} else {
			follow({ type: 'draw', from: point, to: point })
		}
		event.currentTarget.setPointerCapture(event.pointerId)
	}

	function handlePointerUp() {
		const done = latestRef.current
		if (!done) return
		follow(null)
		const rect = draggedRect(done)
		if (done.type === 'draw') {
			if (isBigEnough(rect)) onDraw(rect)
		} else if (
			rect.x !== done.item.rect.x ||
			rect.y !== done.item.rect.y ||
			rect.width !== done.item.rect.width ||
			rect.height !== done.item.rect.height
		) {
			onChange({ ...done.item, rect })
		}
	}

	const drawing = drag?.type === 'draw' ? draggedRect(drag) : null
	return (
		<div
			data-testid="annotation-layer"
			className={cn(
				'absolute inset-0 touch-none',
				tool ? 'pointer-events-auto' : 'pointer-events-none',
				tool && tool !== 'select' && tool !== 'erase' && 'cursor-crosshair',
				tool === 'erase' && 'cursor-not-allowed'
			)}
			style={{ containerType: 'size' }}
			onPointerDown={handlePointerDown}
			onPointerMove={(event) => {
				const current = latestRef.current
				if (current) follow({ ...current, to: pointAt(event) })
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
						{item.kind === 'pixelate' && (
							<PixelatePatch rect={rect} picture={picture} videoRef={videoRef} />
						)}
						{item.kind === 'text' && (
							<span
								className="flex h-full items-center justify-center font-sans leading-none font-bold whitespace-nowrap text-white"
								style={{ transform: `scale(${flip.x}, ${flip.y})` }}
							>
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
