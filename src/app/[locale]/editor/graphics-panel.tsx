'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	CORNERS,
	WATERMARK_WIDTH_FRACTION,
	type Corner,
	type TitleCard,
	type Watermark
} from './overlays'
import { DegreesField } from './degrees-field'
import { MAX_LOGO_SIZE, MIN_LOGO_SIZE, resizedLogo, rotatedLogo } from './logo'
import type { Size } from './transform'
import { DEFAULT_TEXT_STYLE, type TextStyle } from './text-style'
import { TextStyleFields } from './text-style-fields'
import { AnimationFields } from './motion-panels'
import type { LowerThird } from './motion'

/** A new title's stretch, before the user sets one: the first 3 seconds. */
const NEW_TITLE = { startSeconds: 0, durationSeconds: 3 }
const SECONDS_STEP = 0.1
const PERCENT = 100

type GraphicsPanelProps = {
	title: TitleCard | null
	watermark: Watermark | null
	onTitleChange: (title: TitleCard | null) => void
	/** Asks for a PNG or JPG, to go in `corner`. */
	onPickLogo: (corner: Corner) => void
	onCornerChange: (corner: Corner) => void
	/** The logo resized from its size field. */
	onLogoChange: (watermark: Watermark) => void
	/** The output frame's size, which the logo's size is a fraction of. */
	frame: Size
	onRemoveWatermark: () => void
	captionsOn: boolean
	onCaptionsChange: (on: boolean) => void
	captionStyle: TextStyle
	onCaptionStyleChange: (style: TextStyle) => void
	lowerThird: LowerThird | null
	onLowerThirdChange: (lowerThird: LowerThird | null) => void
}

/**
 * The title card, watermark and captions, by hand. The title is a draft until Add or
 * Update, so typing it is one change, not one per key; a corner, a logo or
 * a removal is one change at once. Times are in the edited video. Render
 * with a `key` that follows `title`, so an undo resets the draft.
 */
export function GraphicsPanel({
	title,
	watermark,
	onTitleChange,
	onPickLogo,
	onCornerChange,
	onLogoChange,
	frame,
	onRemoveWatermark,
	captionsOn,
	onCaptionsChange,
	captionStyle,
	onCaptionStyleChange,
	lowerThird,
	onLowerThirdChange
}: GraphicsPanelProps) {
	const t = useTranslations('Editor.graphics')
	const id = useId()
	const [draft, setDraft] = useState(title ?? { text: '', ...NEW_TITLE })
	const [newCorner, setNewCorner] = useState<Corner>('bottom-right')
	const corner = watermark?.corner ?? newCorner
	const isValid = draft.text.trim() !== '' && draft.startSeconds >= 0 && draft.durationSeconds > 0

	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					size="sm"
					variant={captionsOn ? 'secondary' : 'outline'}
					aria-pressed={captionsOn}
					onClick={() => onCaptionsChange(!captionsOn)}
				>
					{t('captions')}
				</Button>
				<span className="text-text-muted text-xs">{t('captionsHint')}</span>
			</div>
			<TextStyleFields
				key={`caption-${JSON.stringify(captionStyle)}`}
				label={t('captionStyle')}
				style={captionStyle}
				onChange={onCaptionStyleChange}
			/>
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					if (isValid) onTitleChange({ ...draft, text: draft.text.trim() })
				}}
			>
				<div className="flex min-w-48 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-text`}>{t('titleText')}</Label>
					<Input
						id={`${id}-text`}
						value={draft.text}
						onChange={(event) => setDraft({ ...draft, text: event.target.value })}
					/>
				</div>
				<div className="flex w-28 flex-col gap-1">
					<Label htmlFor={`${id}-start`}>{t('titleStart')}</Label>
					<Input
						id={`${id}-start`}
						type="number"
						min={0}
						step={SECONDS_STEP}
						value={draft.startSeconds}
						onChange={(event) => setDraft({ ...draft, startSeconds: event.target.valueAsNumber })}
					/>
				</div>
				<div className="flex w-28 flex-col gap-1">
					<Label htmlFor={`${id}-duration`}>{t('titleDuration')}</Label>
					<Input
						id={`${id}-duration`}
						type="number"
						min={SECONDS_STEP}
						step={SECONDS_STEP}
						value={draft.durationSeconds}
						onChange={(event) =>
							setDraft({ ...draft, durationSeconds: event.target.valueAsNumber })
						}
					/>
				</div>
				<Button type="submit" size="sm" disabled={!isValid}>
					{title ? t('updateTitle') : t('addTitle')}
				</Button>
				{title && (
					<Button type="button" variant="outline" size="sm" onClick={() => onTitleChange(null)}>
						{t('removeTitle')}
					</Button>
				)}
			</form>
			<p className="text-text-muted -mt-2 text-xs">{t('titleHint')}</p>
			{title && (
				<TextStyleFields
					key={`title-${JSON.stringify(title.style ?? DEFAULT_TEXT_STYLE)}`}
					label={t('titleStyle')}
					style={title.style ?? DEFAULT_TEXT_STYLE}
					onChange={(style) => onTitleChange({ ...title, style })}
				/>
			)}
			{title && (
				<AnimationFields
					key={`title-motion-${JSON.stringify(title.animation ?? null)}`}
					label={t('titleMotion')}
					animation={title.animation}
					onChange={(animation) => onTitleChange({ ...title, animation })}
				/>
			)}
			<LowerThirdFields
				key={JSON.stringify(lowerThird)}
				lowerThird={lowerThird}
				onChange={onLowerThirdChange}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<div role="group" aria-label={t('corner')} className="flex flex-wrap gap-1">
					{CORNERS.map((option) => (
						<Button
							key={option}
							type="button"
							size="sm"
							variant={option === corner && !watermark?.at ? 'secondary' : 'ghost'}
							aria-pressed={option === corner && !watermark?.at}
							onClick={() => (watermark ? onCornerChange(option) : setNewCorner(option))}
						>
							{t(`corners.${option}`)}
						</Button>
					))}
				</div>
				<Button type="button" variant="outline" size="sm" onClick={() => onPickLogo(corner)}>
					{watermark ? t('replaceLogo') : t('addLogo')}
				</Button>
				{watermark && (
					<Button type="button" variant="outline" size="sm" onClick={onRemoveWatermark}>
						{t('removeWatermark')}
					</Button>
				)}
				{watermark && (
					<LogoSizeField
						key={watermark.size ?? WATERMARK_WIDTH_FRACTION}
						watermark={watermark}
						frame={frame}
						onChange={onLogoChange}
					/>
				)}
				{watermark && (
					<DegreesField
						key={watermark.rotation ?? 0}
						label={t('logoRotation')}
						degrees={watermark.rotation ?? 0}
						onChange={(degrees) => onLogoChange(rotatedLogo(watermark, degrees))}
					/>
				)}
			</div>
			{watermark && <p className="text-text-muted -mt-2 text-xs">{t('logoHint')}</p>}
		</section>
	)
}

/**
 * The logo's width, as a percentage of the frame's, typed: one change on
 * Enter or leaving the field. Render with a `key` that follows the size, so
 * a drag or an undo resets what's typed.
 */
function LogoSizeField({
	watermark,
	frame,
	onChange
}: {
	watermark: Watermark
	frame: Size
	onChange: (watermark: Watermark) => void
}) {
	const t = useTranslations('Editor.graphics')
	const id = useId()
	const size = watermark.size ?? WATERMARK_WIDTH_FRACTION
	const [typed, setTyped] = useState(String(Math.round(size * PERCENT)))

	function commit() {
		const percent = Number.parseFloat(typed)
		if (!Number.isFinite(percent)) return setTyped(String(Math.round(size * PERCENT)))
		const next = resizedLogo(watermark, frame, percent / PERCENT)
		if (next.size === size) return setTyped(String(Math.round(size * PERCENT)))
		onChange(next)
	}

	return (
		<form
			className="flex w-28 flex-col gap-1"
			onSubmit={(event) => {
				event.preventDefault()
				commit()
			}}
		>
			<Label htmlFor={`${id}-logo-size`}>{t('logoSize')}</Label>
			<Input
				id={`${id}-logo-size`}
				type="number"
				min={MIN_LOGO_SIZE * PERCENT}
				max={MAX_LOGO_SIZE * PERCENT}
				step={1}
				value={typed}
				onChange={(event) => setTyped(event.target.value)}
				onBlur={commit}
			/>
		</form>
	)
}

/** A new lower third, before the user sets one: from 0:00 for 4 seconds. */
const NEW_LOWER_THIRD = { startSeconds: 0, durationSeconds: 4 }

/**
 * The lower third: a name and a subtitle that slide in at a time and out
 * after a duration (edited seconds), styled like any text. A draft until
 * Add or Update; its style applies at once.
 */
function LowerThirdFields({
	lowerThird,
	onChange
}: {
	lowerThird: LowerThird | null
	onChange: (lowerThird: LowerThird | null) => void
}) {
	const t = useTranslations('Editor.graphics')
	const id = useId()
	const [draft, setDraft] = useState(
		lowerThird ?? { name: '', subtitle: '', ...NEW_LOWER_THIRD, style: DEFAULT_TEXT_STYLE }
	)
	const isValid = draft.name.trim() !== '' && draft.startSeconds >= 0 && draft.durationSeconds > 0
	return (
		<div role="group" aria-label={t('lowerThird')} className="flex flex-col gap-3">
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					if (isValid) {
						onChange({ ...draft, name: draft.name.trim(), subtitle: draft.subtitle.trim() })
					}
				}}
			>
				<div className="flex min-w-32 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-name`}>{t('lowerThirdName')}</Label>
					<Input
						id={`${id}-name`}
						value={draft.name}
						onChange={(event) => setDraft({ ...draft, name: event.target.value })}
					/>
				</div>
				<div className="flex min-w-32 flex-1 flex-col gap-1">
					<Label htmlFor={`${id}-subtitle`}>{t('lowerThirdSubtitle')}</Label>
					<Input
						id={`${id}-subtitle`}
						value={draft.subtitle}
						onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
					/>
				</div>
				<div className="flex w-24 flex-col gap-1">
					<Label htmlFor={`${id}-start`}>{t('lowerThirdStart')}</Label>
					<Input
						id={`${id}-start`}
						type="number"
						min={0}
						step={SECONDS_STEP}
						value={draft.startSeconds}
						onChange={(event) => setDraft({ ...draft, startSeconds: event.target.valueAsNumber })}
					/>
				</div>
				<div className="flex w-24 flex-col gap-1">
					<Label htmlFor={`${id}-duration`}>{t('lowerThirdDuration')}</Label>
					<Input
						id={`${id}-duration`}
						type="number"
						min={SECONDS_STEP}
						step={SECONDS_STEP}
						value={draft.durationSeconds}
						onChange={(event) =>
							setDraft({ ...draft, durationSeconds: event.target.valueAsNumber })
						}
					/>
				</div>
				<Button type="submit" size="sm" disabled={!isValid}>
					{lowerThird ? t('updateLowerThird') : t('addLowerThird')}
				</Button>
				{lowerThird && (
					<Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
						{t('removeLowerThird')}
					</Button>
				)}
			</form>
			{lowerThird && (
				<TextStyleFields
					key={`lower-${JSON.stringify(lowerThird.style)}`}
					label={t('lowerThirdStyle')}
					style={lowerThird.style}
					onChange={(style) => onChange({ ...lowerThird, style })}
				/>
			)}
		</div>
	)
}
