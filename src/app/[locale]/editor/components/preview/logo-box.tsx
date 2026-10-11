'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
	angleTo,
	logoBox,
	movedLogo,
	resizedLogo,
	resizedTo,
	rotatedLogo,
	unturned
} from '../../overlays/logo'
import { WATERMARK_WIDTH_FRACTION, type Watermark } from '../../overlays/overlays'
import type { Size } from '../../model/transform'

const PERCENT = 100
/** An arrow key moves the logo this far (a fraction of the frame); with Shift, the larger step. */
const KEY_STEP = 0.01
const KEY_BIG_STEP = 0.05
/** + and − change its width by this much of the frame's. */
const SIZE_STEP = 0.01
/** [ and ] turn it this many degrees; with Shift, the larger step. */
const TURN_STEP = 1
const TURN_BIG_STEP = 15

type Point = { x: number; y: number }
type LogoDrag = { type: 'move' | 'resize' | 'rotate'; from: Point; to: Point }

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
	/** Whether it's the thing picked on the video. */
	selected?: boolean
	onSelect?: () => void
}

/**
 * The logo, by hand, on the preview: drag it anywhere, drag its corner to
 * resize it (keeping its shape), drag the handle above it to turn it; or
 * move it with the arrow keys, resize it with + and −, and turn it with
 * [ and ]. Each drag or key press is one change. Render inside
 * PictureFrame's output frame, over OverlayPreview, which draws the logo.
 */
export function LogoBox({
	watermark,
	frame,
	toFrame,
	onDraft,
	onChange,
	selected = false,
	onSelect
}: LogoBoxProps) {
	const t = useTranslations('Editor.graphics')
	const [drag, setDrag] = useState<LogoDrag | null>(null)
	// The drag as of the last pointer move: React may not have rendered it
	// yet when the release comes, so the release reads this, not `drag`.
	const latestRef = useRef<LogoDrag | null>(null)

	const rotation = watermark.rotation ?? 0
	function dragged(current: LogoDrag) {
		const at = logoBox(watermark, frame)
		const centre = { x: at.x + at.width / 2, y: at.y + at.height / 2 }
		if (current.type === 'move') {
			return movedLogo(
				watermark,
				frame,
				current.to.x - current.from.x,
				current.to.y - current.from.y
			)
		}
		if (current.type === 'rotate') return rotatedLogo(watermark, angleTo(centre, current.to, frame))
		// The corner of a turned logo: the pointer, turned back, as if it were upright.
		return resizedTo(watermark, frame, unturned(current.to, centre, rotation, frame))
	}

	function follow(next: LogoDrag | null) {
		latestRef.current = next
		setDrag(next)
		onDraft(next ? dragged(next) : null)
	}

	const shown = drag ? dragged(drag) : watermark
	const box = logoBox(shown, frame)
	return (
		<button
			type="button"
			data-testid="logo-box"
			aria-label={t('logoBox')}
			aria-pressed={selected}
			className="focus-visible:outline-accent aria-pressed:outline-accent pointer-events-auto absolute cursor-move touch-none rounded-sm outline-1 outline-white/70 outline-dashed focus-visible:outline-2 focus-visible:outline-solid aria-pressed:outline-2 aria-pressed:outline-solid"
			style={{
				left: `${box.x * PERCENT}%`,
				top: `${box.y * PERCENT}%`,
				width: `${box.width * PERCENT}%`,
				height: `${box.height * PERCENT}%`,
				transform: shown.rotation ? `rotate(${shown.rotation}deg)` : undefined
			}}
			onPointerDown={(event) => {
				// The logo's, not the annotation layer's underneath.
				event.stopPropagation()
				onSelect?.()
				const target = event.target instanceof Element ? event.target : null
				const type = target?.closest('[data-logo-resize]')
					? 'resize'
					: target?.closest('[data-logo-rotate]')
						? 'rotate'
						: 'move'
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
				const turn = event.shiftKey ? TURN_BIG_STEP : TURN_STEP
				if (event.key === '[' || event.key === '{') next = rotatedLogo(watermark, rotation - turn)
				if (event.key === ']' || event.key === '}') next = rotatedLogo(watermark, rotation + turn)
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
			{/* Above the logo, on a short stem: drag it round to turn the logo. */}
			<span
				data-logo-rotate
				aria-hidden
				className="absolute -top-7 left-1/2 flex h-7 w-5 -translate-x-1/2 cursor-grab flex-col items-center"
			>
				<span className="bg-accent size-3 rounded-full border-2 border-white shadow" />
				<span className="h-4 w-px bg-white/70" />
			</span>
		</button>
	)
}
