'use client'

import { useTranslations } from 'next-intl'
import { captionAt } from './captions'
import {
	CAPTION_BOTTOM_FRACTION,
	CAPTION_FONT_FRACTION,
	CAPTION_LINE_SCALE,
	CAPTION_PADDING_SCALE,
	TITLE_BAND_SCALE,
	TITLE_FONT_FRACTION,
	titleShownAt,
	watermarkRect,
	type Overlays
} from './overlays'
import { bandColor, DEFAULT_TEXT_STYLE, fontFamily } from './text-style'

const PERCENT = 100

type OverlayPreviewProps = {
	overlays: Overlays
	/** Where playback is in the edited video. */
	editedSeconds: number
	/** The output frame's size (after any crop or rotation), for placing the watermark. */
	frame: { width: number; height: number }
}

/**
 * The title, captions and watermark over the output frame, where the export
 * draws them: the same geometry, sized against the frame (container query
 * units: text against its shorter side, `cqmin`, as the export does), so
 * they scale with the player, skip its letterbox bars and stay put through
 * a crop or rotation. Render inside PictureFrame's output frame.
 */
export function OverlayPreview({ overlays, editedSeconds, frame }: OverlayPreviewProps) {
	const t = useTranslations('Editor.graphics')
	const { title, watermark, captions, captionStyle } = overlays
	const caption = captionAt(captions, editedSeconds)
	const titleStyle = title?.style ?? DEFAULT_TEXT_STYLE
	const logo = watermark && watermarkRect(watermark, frame.width, frame.height)
	return (
		<div className="pointer-events-none absolute inset-0" style={{ containerType: 'size' }}>
			{title && titleShownAt(title, editedSeconds) && (
				<div
					className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center font-bold"
					style={{
						height: `${TITLE_FONT_FRACTION * TITLE_BAND_SCALE * titleStyle.size * PERCENT}cqmin`,
						fontSize: `${TITLE_FONT_FRACTION * titleStyle.size * PERCENT}cqmin`,
						background: titleStyle.background ? bandColor(titleStyle.background) : 'none',
						color: titleStyle.color,
						fontFamily: fontFamily(titleStyle.font)
					}}
				>
					{title.text}
				</div>
			)}
			{caption && (
				<div
					className="absolute inset-x-0 flex flex-col items-center font-bold"
					style={{
						bottom: `${CAPTION_BOTTOM_FRACTION * PERCENT}cqh`,
						fontSize: `${CAPTION_FONT_FRACTION * captionStyle.size * PERCENT}cqmin`,
						lineHeight: CAPTION_LINE_SCALE,
						color: captionStyle.color,
						fontFamily: fontFamily(captionStyle.font)
					}}
				>
					{caption.lines.map((line, index) => (
						<span
							key={index}
							style={{
								background: captionStyle.background ? bandColor(captionStyle.background) : 'none',
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
						left: `${(logo.x / frame.width) * PERCENT}%`,
						top: `${(logo.y / frame.height) * PERCENT}%`,
						width: `${(logo.width / frame.width) * PERCENT}%`,
						height: `${(logo.height / frame.height) * PERCENT}%`
					}}
				/>
			)}
		</div>
	)
}
