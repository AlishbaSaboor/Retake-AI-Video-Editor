'use client'

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { rectBetween, type Rect } from './annotations'
import {
	aspectRatio,
	centredCrop,
	clampCrop,
	CROP_ASPECTS,
	normalizeDegrees,
	resizeCrop,
	rotatedFrame,
	withRotation,
	type Crop,
	type PictureTransform,
	type Size
} from './transform'
import { MoreInfo } from './more-info'

/** Setting the picture by hand on the preview: the crop box, or the rotation handle. */
export type TransformMode = 'crop' | 'rotate'

const QUARTER_TURN = 90
const PERCENT = 100
/** Shift-dragging the rotation handle, or Shift+arrow on it, moves this far. */
const SNAP_DEGREES = 15
type Point = { x: number; y: number }

type TransformPanelProps = {
	transform: PictureTransform
	picture: Size
	mode: TransformMode | null
	/** False outside the Edited view: transforms are set on the edit. */
	canEdit: boolean
	onModeChange: (mode: TransformMode | null) => void
	onChange: (next: PictureTransform) => void
}

/**
 * Flip, rotate and crop the whole picture. Each button, a typed angle (on
 * Enter or leaving the field), and each crop or rotation drag on the
 * preview is one change. Render with a `key` that follows `transform`, so an
 * undo resets the typed angle.
 */
export function TransformPanel({
	transform,
	picture,
	mode,
	canEdit,
	onModeChange,
	onChange
}: TransformPanelProps) {
	const t = useTranslations('Editor.transform')
	const id = useId()
	const [degrees, setDegrees] = useState(String(transform.rotation))
	const frame = rotatedFrame(picture, transform.rotation)

	function turnTo(rotation: number) {
		if (normalizeDegrees(rotation) !== transform.rotation) {
			onChange(withRotation(transform, rotation, picture))
		}
	}

	function commitDegrees() {
		const typed = Number.parseFloat(degrees)
		if (Number.isFinite(typed)) turnTo(typed)
		else setDegrees(String(transform.rotation))
	}

	function cropTo(aspect: Crop['aspect']) {
		const ratio = aspectRatio(aspect)
		const rect: Rect =
			ratio === null
				? (transform.crop?.rect ?? { x: 0, y: 0, width: 1, height: 1 })
				: centredCrop(ratio, frame)
		onChange({ ...transform, crop: { rect, aspect } })
		onModeChange('crop')
	}

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			<div className="flex flex-wrap items-end gap-3">
				<form
					className="flex items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						commitDegrees()
					}}
				>
					<div className="flex w-28 flex-col gap-1">
						<Label htmlFor={`${id}-degrees`}>{t('degrees')}</Label>
						<Input
							id={`${id}-degrees`}
							type="number"
							step={1}
							value={degrees}
							disabled={!canEdit}
							onChange={(event) => setDegrees(event.target.value)}
							onBlur={commitDegrees}
						/>
					</div>
				</form>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!canEdit}
					onClick={() => turnTo(transform.rotation - QUARTER_TURN)}
				>
					{t('left90')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!canEdit}
					onClick={() => turnTo(transform.rotation + QUARTER_TURN)}
				>
					{t('right90')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={mode === 'rotate' ? 'secondary' : 'ghost'}
					aria-pressed={mode === 'rotate'}
					disabled={!canEdit}
					onClick={() => onModeChange(mode === 'rotate' ? null : 'rotate')}
				>
					{t('rotateMode')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={transform.flipH ? 'secondary' : 'ghost'}
					aria-pressed={transform.flipH}
					disabled={!canEdit}
					onClick={() => onChange({ ...transform, flipH: !transform.flipH })}
				>
					{t('flipH')}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={transform.flipV ? 'secondary' : 'ghost'}
					aria-pressed={transform.flipV}
					disabled={!canEdit}
					onClick={() => onChange({ ...transform, flipV: !transform.flipV })}
				>
					{t('flipV')}
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<span className="text-text-muted mr-2 text-xs">{t('crop')}</span>
				<div role="group" aria-label={t('cropShape')} className="flex flex-wrap gap-1">
					{CROP_ASPECTS.map((aspect) => (
						<Button
							key={aspect}
							type="button"
							size="sm"
							variant={transform.crop?.aspect === aspect ? 'secondary' : 'ghost'}
							aria-pressed={transform.crop?.aspect === aspect}
							disabled={!canEdit}
							onClick={() => cropTo(aspect)}
						>
							{aspect === 'free' ? t('free') : aspect}
						</Button>
					))}
				</div>
				{transform.crop && (
					<>
						<Button
							type="button"
							size="sm"
							variant={mode === 'crop' ? 'secondary' : 'ghost'}
							aria-pressed={mode === 'crop'}
							disabled={!canEdit}
							onClick={() => onModeChange(mode === 'crop' ? null : 'crop')}
						>
							{t('cropMode')}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!canEdit}
							onClick={() => {
								onChange({ ...transform, crop: null })
								if (mode === 'crop') onModeChange(null)
							}}
						>
							{t('noCrop')}
						</Button>
					</>
				)}
			</div>
			{canEdit ? (
				<MoreInfo>{t('hint')}</MoreInfo>
			) : (
				<p className="text-text-muted -mt-2 text-xs">{t('originalHint')}</p>
			)}
		</section>
	)
}

type CropBoxProps = {
	crop: Crop
	/** The rotated frame's size: the crop box's whole range. */
	frame: Size
	/** A pointer's screen position as fractions of the output frame (the whole rotated frame while cropping). */
	toFrame: (clientX: number, clientY: number) => Point
	onChange: (rect: Rect) => void
}

type CropDrag = { type: 'move' | 'resize' | 'draw'; from: Point; to: Point }

/**
 * The crop box over the whole rotated frame, the rest dimmed: drag inside to
 * move it, its corner to resize it (a preset keeps its shape), outside to
 * draw a new one. Shown as it goes, handed up once on release.
 */
export function CropBox({ crop, frame, toFrame, onChange }: CropBoxProps) {
	const t = useTranslations('Editor.transform')
	const [drag, setDrag] = useState<CropDrag | null>(null)
	// The drag as of the last pointer move: React may not have rendered it
	// yet when the release comes, so the release reads this, not `drag`.
	const latestRef = useRef<CropDrag | null>(null)
	const ratio = aspectRatio(crop.aspect)
	const follow = (next: CropDrag | null) => {
		latestRef.current = next
		setDrag(next)
	}

	function draggedRect(current: CropDrag): Rect {
		const { from, to } = current
		if (current.type === 'move') {
			return clampCrop({
				...crop.rect,
				x: crop.rect.x + to.x - from.x,
				y: crop.rect.y + to.y - from.y
			})
		}
		if (current.type === 'resize') return clampCrop(resizeCrop(crop.rect, to.x, to.y, ratio, frame))
		const drawn = rectBetween(from, to)
		return clampCrop(
			ratio === null
				? drawn
				: resizeCrop(drawn, drawn.x + drawn.width, drawn.y + drawn.height, ratio, frame)
		)
	}

	const rect = drag ? draggedRect(drag) : crop.rect
	return (
		<div
			data-testid="crop-layer"
			className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
			onPointerDown={(event) => {
				const target = event.target instanceof Element ? event.target : null
				const type = target?.closest('[data-crop-resize]')
					? 'resize'
					: target?.closest('[data-crop-box]')
						? 'move'
						: 'draw'
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
				if (done.from.x !== done.to.x || done.from.y !== done.to.y) onChange(draggedRect(done))
			}}
		>
			<div
				data-crop-box
				aria-label={t('cropBox')}
				role="img"
				className="absolute cursor-move border-2 border-white"
				style={{
					left: `${rect.x * PERCENT}%`,
					top: `${rect.y * PERCENT}%`,
					width: `${rect.width * PERCENT}%`,
					height: `${rect.height * PERCENT}%`,
					// Dims everything outside the box; the frame's overflow clips it.
					boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)'
				}}
			>
				<span
					data-crop-resize
					aria-hidden
					className="bg-accent absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize"
				/>
			</div>
		</div>
	)
}

type RotateHandleProps = {
	rotation: number
	/** Live, while dragging: what the preview shows. */
	onDraft: (rotation: number | null) => void
	/** On release, or per arrow key: one change. */
	onCommit: (rotation: number) => void
}

/**
 * A handle at the top of the picture, turning with it: drag it round the
 * picture's centre to rotate (Shift snaps to 15°), or use the arrow keys
 * (1°, Shift 15°).
 */
export function RotateHandle({ rotation, onDraft, onCommit }: RotateHandleProps) {
	const t = useTranslations('Editor.transform')
	const [dragging, setDragging] = useState<number | null>(null)
	// The angle as of the last pointer move: the release can come before
	// React renders it, and committed a stale angle (a real drag to 90°
	// committed the 75° it passed through).
	const latestRef = useRef<number | null>(null)
	const follow = (angle: number | null) => {
		latestRef.current = angle
		setDragging(angle)
	}

	function angleAt(event: React.PointerEvent<HTMLElement>): number {
		const picture = event.currentTarget.closest('[data-testid="picture"]')
		const box = picture?.getBoundingClientRect()
		if (!box) return rotation
		// The picture turns about its centre, which its bounding box shares.
		const dx = event.clientX - (box.left + box.width / 2)
		const dy = event.clientY - (box.top + box.height / 2)
		const raw = (Math.atan2(dy, dx) * 180) / Math.PI + QUARTER_TURN
		const snapped = event.shiftKey ? Math.round(raw / SNAP_DEGREES) * SNAP_DEGREES : Math.round(raw)
		return normalizeDegrees(snapped)
	}

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={t('rotateHandle')}
			aria-valuemin={-179}
			aria-valuemax={180}
			aria-valuenow={dragging ?? rotation}
			aria-valuetext={`${dragging ?? rotation}°`}
			className="bg-accent focus-visible:outline-accent absolute top-[6%] left-1/2 size-5 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-white shadow-lg focus-visible:outline-2"
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId)
				follow(rotation)
			}}
			onPointerMove={(event) => {
				if (latestRef.current === null) return
				const angle = angleAt(event)
				follow(angle)
				onDraft(angle)
			}}
			onLostPointerCapture={() => {
				const angle = latestRef.current
				follow(null)
				if (angle === null) return
				onDraft(null)
				if (angle !== rotation) onCommit(angle)
			}}
			onKeyDown={(event) => {
				const step = event.shiftKey ? SNAP_DEGREES : 1
				const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[
					event.key
				]
				if (delta === undefined) return
				event.preventDefault()
				onCommit(normalizeDegrees(rotation + delta))
			}}
		/>
	)
}
