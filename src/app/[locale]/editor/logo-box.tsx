'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { logoBox, movedLogo, resizedLogo, resizedTo } from './logo'
import { WATERMARK_WIDTH_FRACTION, type Watermark } from './overlays'
import type { Size } from './transform'

const PERCENT = 100
/** An arrow key moves the logo this far (a fraction of the frame); with Shift, the larger step. */
const KEY_STEP = 0.01
const KEY_BIG_STEP = 0.05
/** + and − change its width by this much of the frame's. */
const SIZE_STEP = 0.01

type Point = { x: number; y: number }
type LogoDrag = { type: 'move' | 'resize'; from: Point; to: Point }

const ARROWS: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 }
}

type LogoBoxProps = {
	watermark: Watermark
	/** The output frame's size: the logo's place and size are fractions of it. */
	frame: Size
	/** A pointer's screen position as fractions of the output frame. */
	toFrame: (clientX: number, clientY: number) => Point
	/** The logo as it's being dragged, for the preview; null when the drag ends. */
	onDraft: (watermark: Watermark | null) => void
	onChange: (watermark: Watermark) => void
}

/**
 * The logo, by hand, on the preview: drag it anywhere, drag its corner to
 * resize it (keeping its shape), or move it with the arrow keys and resize
 * it with + and −. Each drag or key press is one change. Render inside
 * PictureFrame's output frame, over OverlayPreview, which draws the logo.
 */
export function LogoBox({ watermark, frame, toFrame, onDraft, onChange }: LogoBoxProps) {
	const t = useTranslations('Editor.graphics')
	const [drag, setDrag] = useState<LogoDrag | null>(null)
	// The drag as of the last pointer move: React may not have rendered it
	// yet when the release comes, so the release reads this, not `drag`.
	const latestRef = useRef<LogoDrag | null>(null)

	function dragged(current: LogoDrag) {
		return current.type === 'move'
			? movedLogo(watermark, frame, current.to.x - current.from.x, current.to.y - current.from.y)
			: resizedTo(watermark, frame, current.to)
	}

	function follow(next: LogoDrag | null) {
		latestRef.current = next
		setDrag(next)
		onDraft(next ? dragged(next) : null)
	}

	const box = logoBox(drag ? dragged(drag) : watermark, frame)
	return (
		<button
			type="button"
			data-testid="logo-box"
			aria-label={t('logoBox')}
			className="focus-visible:outline-accent pointer-events-auto absolute cursor-move touch-none rounded-sm outline-1 outline-white/70 outline-dashed focus-visible:outline-2 focus-visible:outline-solid"
			style={{
				left: `${box.x * PERCENT}%`,
				top: `${box.y * PERCENT}%`,
				width: `${box.width * PERCENT}%`,
				height: `${box.height * PERCENT}%`
			}}
			onPointerDown={(event) => {
				// The logo's, not the annotation layer's underneath.
				event.stopPropagation()
				const target = event.target instanceof Element ? event.target : null
				const type = target?.closest('[data-logo-resize]') ? 'resize' : 'move'
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
				if (!done) return
				if (done.from.x !== done.to.x || done.from.y !== done.to.y) onChange(dragged(done))
			}}
			onKeyDown={(event) => {
				const arrow = ARROWS[event.key]
				const step = event.shiftKey ? KEY_BIG_STEP : KEY_STEP
				const size = watermark.size ?? WATERMARK_WIDTH_FRACTION
				let next: Watermark | null = null
				if (arrow) next = movedLogo(watermark, frame, arrow.x * step, arrow.y * step)
				if (event.key === '+' || event.key === '=') {
					next = resizedLogo(watermark, frame, size + SIZE_STEP)
				}
				if (event.key === '-') next = resizedLogo(watermark, frame, size - SIZE_STEP)
				if (!next) return
				event.preventDefault()
				onChange(next)
			}}
		>
			<span
				data-logo-resize
				aria-hidden
				className="bg-accent absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize"
			/>
		</button>
	)
}
