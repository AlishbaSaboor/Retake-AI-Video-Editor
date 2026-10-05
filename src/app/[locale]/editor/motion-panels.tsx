'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	clampMotionSeconds,
	clampZoom,
	DEFAULT_ZOOM,
	MOTIONS,
	NO_ANIMATION,
	SIDES,
	type Animation,
	type Motion,
	type Zoom
} from './motion'
import { MoreInfo } from './more-info'

const PERCENT = 100
const SECONDS_STEP = 0.1
const NEW_ZOOM_SECONDS = 3

const selectClass = 'border-border bg-surface text-text h-9 rounded-md border px-2 text-sm'

/**
 * An element's entrance and exit: a kind (none, fade, slide, pop), the side
 * a slide comes from or goes to, and how long. A kind or side applies at
 * once; a length on Enter or leaving the field: each one change. Render with
 * a `key` that follows `animation`, so an undo resets what's typed.
 */
export function AnimationFields({
	label,
	animation,
	disabled,
	onChange
}: {
	label: string
	animation: Animation | undefined
	disabled?: boolean
	onChange: (animation: Animation) => void
}) {
	const t = useTranslations('Editor.motion')
	const current = animation ?? NO_ANIMATION
	return (
		<div role="group" aria-label={label} className="flex flex-wrap items-end gap-4">
			<span className="text-text w-24 shrink-0 pb-2 text-xs font-medium">{label}</span>
			{(['in', 'out'] as const).map((phase) => (
				<MotionRow
					key={phase}
					phase={phase}
					motion={current[phase]}
					disabled={disabled}
					onChange={(motion) => onChange({ ...current, [phase]: motion })}
				/>
			))}
			<span className="sr-only">{t('hint')}</span>
		</div>
	)
}

function MotionRow({
	phase,
	motion,
	disabled,
	onChange
}: {
	phase: 'in' | 'out'
	motion: Motion
	disabled?: boolean
	onChange: (motion: Motion) => void
}) {
	const t = useTranslations('Editor.motion')
	const id = useId()
	const [seconds, setSeconds] = useState(String(motion.seconds))

	function commitSeconds() {
		const typed = Number.parseFloat(seconds)
		if (!Number.isFinite(typed)) {
			setSeconds(String(motion.seconds))
			return
		}
		const next = clampMotionSeconds(typed)
		setSeconds(String(next))
		if (next !== motion.seconds) onChange({ ...motion, seconds: next })
	}

	return (
		<form
			className="flex items-end gap-2"
			onSubmit={(event) => {
				event.preventDefault()
				commitSeconds()
			}}
		>
			<div className="flex flex-col gap-1">
				<Label htmlFor={`${id}-kind`}>{t(`${phase}.label`)}</Label>
				<select
					id={`${id}-kind`}
					value={motion.kind}
					disabled={disabled}
					onChange={(event) => {
						const kind = MOTIONS.find((k) => k === event.target.value)
						if (kind) onChange({ ...motion, kind })
					}}
					className={selectClass}
				>
					{MOTIONS.map((kind) => (
						<option key={kind} value={kind}>
							{t(`kinds.${kind}`)}
						</option>
					))}
				</select>
			</div>
			{motion.kind === 'slide' && (
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${id}-side`}>{t(`${phase}.side`)}</Label>
					<select
						id={`${id}-side`}
						value={motion.side}
						disabled={disabled}
						onChange={(event) => {
							const side = SIDES.find((s) => s === event.target.value)
							if (side) onChange({ ...motion, side })
						}}
						className={selectClass}
					>
						{SIDES.map((side) => (
							<option key={side} value={side}>
								{t(`sides.${side}`)}
							</option>
						))}
					</select>
				</div>
			)}
			{motion.kind !== 'none' && (
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${id}-seconds`}>{t(`${phase}.seconds`)}</Label>
					<Input
						id={`${id}-seconds`}
						type="number"
						min={SECONDS_STEP}
						step={SECONDS_STEP}
						value={seconds}
						disabled={disabled}
						onChange={(event) => setSeconds(event.target.value)}
						onBlur={commitSeconds}
						className="w-20"
					/>
				</div>
			)}
		</form>
	)
}

/**
 * The zoom: a slow push-in or pull-out on the whole picture between two
 * times of the edited video, to a magnification. A draft until Add or
 * Update, so typing it is one change. Render with a `key` that follows
 * `zoom`.
 */
export function ZoomPanel({
	zoom,
	editedSeconds,
	playheadSeconds,
	canEdit,
	aiming,
	onAim,
	onChange
}: {
	zoom: Zoom | null
	editedSeconds: number
	playheadSeconds: number | null
	canEdit: boolean
	/** Whether its area is being set on the video. */
	aiming: boolean
	onAim: (aiming: boolean) => void
	onChange: (zoom: Zoom | null) => void
}) {
	const t = useTranslations('Editor.zoom')
	const id = useId()
	const start = playheadSeconds ?? 0
	const [draft, setDraft] = useState(() => ({
		startSeconds: String(zoom?.startSeconds ?? Math.round(start * 10) / 10),
		endSeconds: String(
			zoom?.endSeconds ?? Math.round(Math.min(editedSeconds, start + NEW_ZOOM_SECONDS) * 10) / 10
		),
		direction: zoom?.direction ?? ('in' as const),
		amount: String(Math.round((zoom?.amount ?? DEFAULT_ZOOM) * PERCENT))
	}))
	const startSeconds = Number.parseFloat(draft.startSeconds)
	const endSeconds = Number.parseFloat(draft.endSeconds)
	const amount = Number.parseFloat(draft.amount)
	const isValid =
		Number.isFinite(startSeconds) &&
		Number.isFinite(endSeconds) &&
		Number.isFinite(amount) &&
		startSeconds >= 0 &&
		endSeconds > startSeconds
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					if (!isValid) return
					onChange({
						...zoom,
						startSeconds,
						endSeconds: Math.min(endSeconds, editedSeconds),
						direction: draft.direction,
						amount: clampZoom(amount / PERCENT)
					})
				}}
			>
				<div role="group" aria-label={t('direction')} className="flex gap-1 pb-0.5">
					{(['in', 'out'] as const).map((direction) => (
						<Button
							key={direction}
							type="button"
							size="sm"
							variant={draft.direction === direction ? 'secondary' : 'ghost'}
							aria-pressed={draft.direction === direction}
							disabled={!canEdit}
							onClick={() => setDraft({ ...draft, direction })}
						>
							{t(`directions.${direction}`)}
						</Button>
					))}
				</div>
				{(['startSeconds', 'endSeconds', 'amount'] as const).map((field) => (
					<div key={field} className="flex w-24 flex-col gap-1">
						<Label htmlFor={`${id}-${field}`}>{t(field)}</Label>
						<Input
							id={`${id}-${field}`}
							type="number"
							min={0}
							step={field === 'amount' ? 5 : SECONDS_STEP}
							value={draft[field]}
							disabled={!canEdit}
							onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
						/>
					</div>
				))}
				<Button type="submit" size="sm" disabled={!canEdit || !isValid}>
					{zoom ? t('update') : t('add')}
				</Button>
				{zoom && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!canEdit}
						onClick={() => onChange(null)}
					>
						{t('remove')}
					</Button>
				)}
				<Button
					type="button"
					size="sm"
					variant={aiming ? 'secondary' : 'outline'}
					aria-pressed={aiming}
					disabled={!canEdit || !zoom}
					onClick={() => onAim(!aiming)}
				>
					{t('aim')}
				</Button>
			</form>
			{!zoom && <p className="text-text-muted text-xs">{t('aimNeedsZoom')}</p>}
			<MoreInfo>
				{t('hint')} {zoom && t('aimHint')}
			</MoreInfo>
		</section>
	)
}
