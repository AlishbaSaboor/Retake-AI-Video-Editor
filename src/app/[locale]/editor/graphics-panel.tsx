'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CORNERS, type Corner, type TitleCard, type Watermark } from './overlays'
import { DEFAULT_TEXT_STYLE, type TextStyle } from './text-style'
import { TextStyleFields } from './text-style-fields'

/** A new title's stretch, before the user sets one: the first 3 seconds. */
const NEW_TITLE = { startSeconds: 0, durationSeconds: 3 }
const SECONDS_STEP = 0.1

type GraphicsPanelProps = {
	title: TitleCard | null
	watermark: Watermark | null
	onTitleChange: (title: TitleCard | null) => void
	/** Asks for a PNG, to go in `corner`. */
	onPickLogo: (corner: Corner) => void
	onCornerChange: (corner: Corner) => void
	onRemoveWatermark: () => void
	captionsOn: boolean
	onCaptionsChange: (on: boolean) => void
	captionStyle: TextStyle
	onCaptionStyleChange: (style: TextStyle) => void
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
	onRemoveWatermark,
	captionsOn,
	onCaptionsChange,
	captionStyle,
	onCaptionStyleChange
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
			className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 shadow-xl"
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
			<div className="flex flex-wrap items-center gap-3">
				<div role="group" aria-label={t('corner')} className="flex flex-wrap gap-1">
					{CORNERS.map((option) => (
						<Button
							key={option}
							type="button"
							size="sm"
							variant={option === corner ? 'secondary' : 'ghost'}
							aria-pressed={option === corner}
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
			</div>
		</section>
	)
}
