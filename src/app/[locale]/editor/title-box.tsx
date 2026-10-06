'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { titleCentre, TITLE_FONT_FRACTION, type TitleCard } from './overlays'
import { clampTextSize, DEFAULT_TEXT_STYLE, fontFamily } from './text-style'

const PERCENT = 100
/** An arrow key moves the title this far (a fraction of the frame); with Shift, the larger step. */
const KEY_STEP = 0.01
const KEY_BIG_STEP = 0.05
/** + and − change its size by this much. */
const SIZE_STEP = 0.1

type Point = { x: number; y: number }
type TitleDrag = { type: 'move' | 'resize'; from: Point; to: Point }

const ARROWS: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** The title with its centre moved by a fraction of the frame. */
export function movedTitle(title: TitleCard, dx: number, dy: number): TitleCard {
	const centre = titleCentre(title)
	return { ...title, at: { x: clamp01(centre.x + dx), y: clamp01(centre.y + dy) } }
}

/** The title at a new text size. */
export function resizedTitle(title: TitleCard, size: number): TitleCard {
	const style = title.style ?? DEFAULT_TEXT_STYLE
	return { ...title, style: { ...style, size: clampTextSize(size) } }
}

/**
 * The title, by hand, on the preview: drag it anywhere, drag its corner to
 * make it bigger or smaller; or move it with the arrow keys and resize it
 * with + and −. Each drag or key press is one change. It's a box the size of
 * the title's text (the same text, in the same font, see-through), so it
 * fits whatever was typed. Render inside PictureFrame's output frame, over
 * OverlayPreview, which draws the title.
 */
export function TitleBox({
	title,
	selected,
	frame,
	toFrame,
	onSelect,
	onDraft,
	onChange
}: {
	title: TitleCard
	selected: boolean
	/** The output frame's size: for turning a corner drag into a size. */
	frame: { width: number; height: number }
	/** A pointer's screen position as fractions of the output frame. */
	toFrame: (clientX: number, clientY: number) => Point
	onSelect: () => void
	/** The title as it's being dragged, for the preview; null when the drag ends. */
	onDraft: (title: TitleCard | null) => void
	onChange: (title: TitleCard) => void
}) {
	const t = useTranslations('Editor.graphics')
	const [drag, setDrag] = useState<TitleDrag | null>(null)
	// The drag as of the last pointer move: the release reads this, not `drag`.
	const latestRef = useRef<TitleDrag | null>(null)
	const style = title.style ?? DEFAULT_TEXT_STYLE

	function dragged(current: TitleDrag): TitleCard {
		if (current.type === 'move') {
			return movedTitle(title, current.to.x - current.from.x, current.to.y - current.from.y)
		}
		// Bigger by how much further the corner is from the centre, in pixels of the frame.
		const centre = titleCentre(title)
		const distance = (point: Point) =>
			Math.hypot((point.x - centre.x) * frame.width, (point.y - centre.y) * frame.height)
		const from = distance(current.from)
		return from > 0 ? resizedTitle(title, (style.size * distance(current.to)) / from) : title
	}

	function follow(next: TitleDrag | null) {
		latestRef.current = next
		setDrag(next)
		onDraft(next ? dragged(next) : null)
	}

	const shown = drag ? dragged(drag) : title
	const centre = titleCentre(shown)
	const shownStyle = shown.style ?? DEFAULT_TEXT_STYLE
	return (
		<button
			type="button"
			data-testid="title-box"
			aria-label={t('titleBox', { text: title.text })}
			aria-pressed={selected}
			data-text={shown.text}
			className="focus-visible:outline-accent pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-sm px-[0.3em] font-bold whitespace-nowrap text-transparent outline-1 outline-white/70 outline-dashed before:content-[attr(data-text)] focus-visible:outline-2 focus-visible:outline-solid aria-pressed:outline-[var(--color-accent)] aria-pressed:outline-solid"
			style={{
				left: `${centre.x * PERCENT}%`,
				top: `${centre.y * PERCENT}%`,
				fontSize: `${TITLE_FONT_FRACTION * shownStyle.size * PERCENT}cqmin`,
				fontFamily: fontFamily(shownStyle.font)
			}}
			onPointerDown={(event) => {
				// The title's, not the annotation layer's underneath.
				event.stopPropagation()
				onSelect()
				const target = event.target instanceof Element ? event.target : null
				const type = target?.closest('[data-title-resize]') ? 'resize' : 'move'
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
				let next: TitleCard | null = null
				if (arrow) next = movedTitle(title, arrow.x * step, arrow.y * step)
				if (event.key === '+' || event.key === '=')
					next = resizedTitle(title, style.size + SIZE_STEP)
				if (event.key === '-') next = resizedTitle(title, style.size - SIZE_STEP)
				if (!next) return
				event.preventDefault()
				onChange(next)
			}}
		>
			{/* Its words are the title's own, drawn by the preview: here only as
			    a see-through ::before, so they size the box and aren't read twice. */}
			{selected && (
				<>
					<span
						data-title-resize
						aria-hidden
						className="bg-accent absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm"
					/>
					<span
						data-title-resize
						aria-hidden
						className="bg-accent absolute -top-1.5 -left-1.5 size-3 cursor-nwse-resize rounded-sm"
					/>
					<span
						data-title-resize
						aria-hidden
						className="bg-accent absolute -top-1.5 -right-1.5 size-3 cursor-nesw-resize rounded-sm"
					/>
					<span
						data-title-resize
						aria-hidden
						className="bg-accent absolute -bottom-1.5 -left-1.5 size-3 cursor-nesw-resize rounded-sm"
					/>
				</>
			)}
		</button>
	)
}
