'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	clampTextSize,
	DEFAULT_TEXT_STYLE,
	FONTS,
	isDefaultStyle,
	MAX_TEXT_SIZE,
	MIN_TEXT_SIZE,
	type Font,
	type TextStyle
} from './text-style'

const PERCENT = 100
const SIZE_STEP_PERCENT = 10
/** The band color offered when there's none yet. */
const DEFAULT_BAND_COLOR = '#000000'

type TextStyleFieldsProps = {
	/** What's being styled: "Title style", "Caption style"… names the group. */
	label: string
	style: TextStyle
	disabled?: boolean
	/** Each call is one change: a font or background picked, a size or color committed. */
	onChange: (style: TextStyle) => void
}

/**
 * Font, size, color and background for one piece of text. The font and the
 * background switch apply at once; a size or color is committed on Enter or
 * leaving the field, so picking a color is one change, not one per step of
 * the picker. Render with a `key` that follows `style`, so an undo resets
 * what's typed.
 */
export function TextStyleFields({ label, style, disabled, onChange }: TextStyleFieldsProps) {
	const t = useTranslations('Editor.textStyle')
	const id = useId()
	const [size, setSize] = useState(String(Math.round(style.size * PERCENT)))
	const [color, setColor] = useState(style.color)
	const [background, setBackground] = useState(style.background ?? DEFAULT_BAND_COLOR)

	function commitSize() {
		const percent = Number.parseFloat(size)
		if (!Number.isFinite(percent)) {
			setSize(String(Math.round(style.size * PERCENT)))
			return
		}
		const next = clampTextSize(percent / PERCENT)
		setSize(String(Math.round(next * PERCENT)))
		if (next !== style.size) onChange({ ...style, size: next })
	}

	return (
		<div role="group" aria-label={label} className="flex flex-wrap items-end gap-3">
			<span className="text-text w-24 shrink-0 pb-2 text-xs font-medium">{label}</span>
			<div className="flex flex-col gap-1">
				<Label htmlFor={`${id}-font`}>{t('font')}</Label>
				<select
					id={`${id}-font`}
					value={style.font}
					disabled={disabled}
					onChange={(event) => {
						const font = FONTS.find((f) => f === event.target.value)
						if (font) onChange({ ...style, font })
					}}
					className="border-border bg-surface text-text h-9 rounded-md border px-2 text-sm"
				>
					{FONTS.map((font: Font) => (
						<option key={font} value={font}>
							{t(`fonts.${font}`)}
						</option>
					))}
				</select>
			</div>
			<form
				className="flex flex-col gap-1"
				onSubmit={(event) => {
					event.preventDefault()
					commitSize()
				}}
			>
				<Label htmlFor={`${id}-size`}>{t('size')}</Label>
				<Input
					id={`${id}-size`}
					type="number"
					min={MIN_TEXT_SIZE * PERCENT}
					max={MAX_TEXT_SIZE * PERCENT}
					step={SIZE_STEP_PERCENT}
					value={size}
					disabled={disabled}
					onChange={(event) => setSize(event.target.value)}
					onBlur={commitSize}
					className="w-20"
				/>
			</form>
			<div className="flex flex-col gap-1">
				<Label htmlFor={`${id}-color`}>{t('color')}</Label>
				<input
					id={`${id}-color`}
					type="color"
					value={color}
					disabled={disabled}
					onChange={(event) => setColor(event.target.value)}
					onBlur={() => color !== style.color && onChange({ ...style, color })}
					className="border-border h-9 w-14 cursor-pointer rounded-md border bg-transparent"
				/>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor={`${id}-background`}>{t('background')}</Label>
				<input
					id={`${id}-background`}
					type="color"
					value={background}
					disabled={disabled || style.background === null}
					onChange={(event) => setBackground(event.target.value)}
					onBlur={() =>
						style.background !== null &&
						background !== style.background &&
						onChange({ ...style, background })
					}
					className="border-border h-9 w-14 cursor-pointer rounded-md border bg-transparent"
				/>
			</div>
			<Button
				type="button"
				size="sm"
				variant={style.background === null ? 'secondary' : 'ghost'}
				aria-pressed={style.background === null}
				disabled={disabled}
				onClick={() =>
					onChange({ ...style, background: style.background === null ? background : null })
				}
			>
				{t('noBackground')}
			</Button>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				disabled={disabled || isDefaultStyle(style)}
				onClick={() => onChange(DEFAULT_TEXT_STYLE)}
			>
				{t('reset')}
			</Button>
		</div>
	)
}
