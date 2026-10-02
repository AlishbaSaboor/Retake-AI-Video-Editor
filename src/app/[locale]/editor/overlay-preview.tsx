'use client'

import { useTranslations } from 'next-intl'
import { captionAt } from './captions'
import {
	CAPTION_BOTTOM_FRACTION,
	CAPTION_FONT_FRACTION,
	CAPTION_LINE_SCALE,
	CAPTION_PADDING_SCALE,
	fitInside,
	TITLE_BAND_COLOR,
	TITLE_BAND_SCALE,
	TITLE_FONT_FRACTION,
	titleShownAt,
	watermarkRect,
	type Overlays
} from './overlays'

/** The editor's player frame, `aspect-video`. */
const FRAME_RATIO = 16 / 9
const PERCENT = 100

type OverlayPreviewProps = {
	overlays: Overlays
	/** Where playback is in the edited video. */
	editedSeconds: number
	picture: { width: number; height: number }
}

/**
 * The title, captions and watermark over the player, where the export draws them:
 * the same geometry, sized against the picture's own box (container query
 * units), so they scale with the player and skip its letterbox bars.
 */
export function OverlayPreview({ overlays, editedSeconds, picture }: OverlayPreviewProps) {
	const t = useTranslations('Editor.graphics')
	const box = fitInside(picture.width / picture.height, FRAME_RATIO)
	const { title, watermark, captions } = overlays
	const caption = captionAt(captions, editedSeconds)
	const logo = watermark && watermarkRect(watermark, picture.width, picture.height)
	return (
		<div
			className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
			style={{
				width: `${box.widthPercent}%`,
				height: `${box.heightPercent}%`,
				containerType: 'size'
			}}
		>
			{title && titleShownAt(title, editedSeconds) && (
				<div
					className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center font-sans font-bold text-white"
					style={{
						height: `${TITLE_FONT_FRACTION * TITLE_BAND_SCALE * PERCENT}cqh`,
						fontSize: `${TITLE_FONT_FRACTION * PERCENT}cqh`,
						background: TITLE_BAND_COLOR
					}}
				>
					{title.text}
				</div>
			)}
			{caption && (
				<div
					className="absolute inset-x-0 flex flex-col items-center font-sans font-bold text-white"
					style={{
						bottom: `${CAPTION_BOTTOM_FRACTION * PERCENT}cqh`,
						fontSize: `${CAPTION_FONT_FRACTION * PERCENT}cqh`,
						lineHeight: CAPTION_LINE_SCALE
					}}
				>
					{caption.lines.map((line, index) => (
						<span
							key={index}
							style={{
								background: TITLE_BAND_COLOR,
								padding: `0 ${CAPTION_PADDING_SCALE}em`
							}}
						>
							{line}
						</span>
					))}
				</div>
			)}
			{watermark && logo && (
				// eslint-disable-next-line @next/next/no-img-element -- a data URL the user just picked; nothing for next/image to optimise
				<img
					src={watermark.image}
					alt={t('watermarkAlt')}
					className="absolute"
					style={{
						left: `${(logo.x / picture.width) * PERCENT}%`,
						top: `${(logo.y / picture.height) * PERCENT}%`,
						width: `${(logo.width / picture.width) * PERCENT}%`,
						height: `${(logo.height / picture.height) * PERCENT}%`
					}}
				/>
			)}
		</div>
	)
}
