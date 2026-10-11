'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MIN_ZOOM, MAX_ZOOM, zoomArea, zoomOnArea, type Zoom } from '../../overlays/motion'

const PERCENT = 100

type Point = { x: number; y: number }
type ZoomDrag = { type: 'move' | 'resize'; from: Point; to: Point }

/**
 * The zoom's area on the whole (unzoomed) frame: what it ends on. Drag it
 * to aim the zoom; drag its corner to choose how far it goes (smaller area,
 * closer zoom). The area keeps the frame's shape. One change per drag.
 * Render inside PictureFrame's output frame, with the zoom not applied.
 */
export function ZoomBox({
	zoom,
	toFrame,
	onChange
}: {
	zoom: Zoom
	/** A pointer's screen position as fractions of the output frame. */
	toFrame: (clientX: number, clientY: number) => Point
	onChange: (zoom: Zoom) => void
}) {
	const t = useTranslations('Editor.zoom')
	const [drag, setDrag] = useState<ZoomDrag | null>(null)
	// The drag as of the last pointer move: the release reads this, not `drag`.
	const latestRef = useRef<ZoomDrag | null>(null)
	const follow = (next: ZoomDrag | null) => {
		latestRef.current = next
		setDrag(next)
	}

	function dragged(current: ZoomDrag): Zoom {
		const area = zoomArea(zoom)
		const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
		if (current.type === 'move') {
			return zoomOnArea(
				zoom,
				{
					x: centre.x + current.to.x - current.from.x,
					y: centre.y + current.to.y - current.from.y
				},
				area.width
			)
		}
		// From the opposite corner, as large as the pointer reaches either way.
		const width = Math.max(current.to.x - area.x, current.to.y - area.y, 1 / MAX_ZOOM)
		const sized = Math.min(width, 1 / MIN_ZOOM)
		return zoomOnArea(zoom, { x: area.x + sized / 2, y: area.y + sized / 2 }, sized)
	}

	const area = zoomArea(drag ? dragged(drag) : zoom)
	return (
		<div
			data-testid="zoom-layer"
			className="pointer-events-auto absolute inset-0 touch-none"
			onPointerDown={(event) => {
				const target = event.target instanceof Element ? event.target : null
				if (!target?.closest('[data-zoom-area]')) return
				const type = target.closest('[data-zoom-resize]') ? 'resize' : 'move'
				const point = toFrame(event.clientX, event.clientY)
				follow({ type, from: point, to: point })
				event.currentTarget.setPointerCapture(event.pointerId)
			}}
			onPointerMove={(event) => {
				const current = latestRef.current
				if (current) follow({ ...current, to: toFrame(event.clientX, event.clientY) })
			}}
			onLostPointerCapture={() => {
				const done = latestRef.current
				follow(null)
				if (done && (done.from.x !== done.to.x || done.from.y !== done.to.y))
					onChange(dragged(done))
			}}
		>
			<div
				data-zoom-area
				role="img"
				aria-label={t('area', {
					percent: Math.round((drag ? dragged(drag) : zoom).amount * PERCENT)
				})}
				className="border-accent absolute cursor-move border-2"
				style={{
					left: `${area.x * PERCENT}%`,
					top: `${area.y * PERCENT}%`,
					width: `${area.width * PERCENT}%`,
					height: `${area.height * PERCENT}%`,
					// Shades everything the zoom will leave out.
					boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)'
				}}
			>
				<span
					data-zoom-resize
					aria-hidden
					className="bg-accent absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize"
				/>
			</div>
		</div>
	)
}
