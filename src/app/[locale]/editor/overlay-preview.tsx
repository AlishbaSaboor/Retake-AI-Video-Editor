'use client'

import { useTranslations } from 'next-intl'
import { captionAt } from './captions'
import {
	CAPTION_BOTTOM_FRACTION,
	CAPTION_FONT_FRACTION,
	CAPTION_LINE_SCALE,
	CAPTION_PADDING_SCALE,
	LOWER_THIRD_BOTTOM_FRACTION,
	LOWER_THIRD_LEFT_FRACTION,
	LOWER_THIRD_LINE_SCALE,
	LOWER_THIRD_NAME_FRACTION,
	LOWER_THIRD_PADDING_SCALE,
	LOWER_THIRD_SUBTITLE_FRACTION,
	TITLE_BAND_SCALE,
	TITLE_FONT_FRACTION,
	watermarkRect,
	type Overlays
} from './overlays'
import { animationAt, LOWER_THIRD_ANIMATION, type MotionState } from './motion'
import { bandColor, DEFAULT_TEXT_STYLE, fontFamily } from './text-style'

/** An element where its motion has it: faded, moved across the frame, scaled about its centre. */
export function motionStyle(motion: MotionState) {
	return {
		opacity: motion.opacity,
		transform: `translate(${motion.dx * PERCENT}cqw, ${motion.dy * PERCENT}cqh) scale(${motion.scale})`
	}
}

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
	const titleMotion =
		title &&
		animationAt(
			title.animation,
			title.startSeconds,
			title.startSeconds + title.durationSeconds,
			editedSeconds
		)
	const lower = overlays.lowerThird
	const lowerMotion =
		lower &&
		animationAt(
			LOWER_THIRD_ANIMATION,
			lower.startSeconds,
			lower.startSeconds + lower.durationSeconds,
			editedSeconds
		)
	const logo = watermark && watermarkRect(watermark, frame.width, frame.height)
	return (
		<div className="pointer-events-none absolute inset-0" style={{ containerType: 'size' }}>
			{title && titleMotion && (
				<div
					className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center font-bold"
					style={{
						height: `${TITLE_FONT_FRACTION * TITLE_BAND_SCALE * titleStyle.size * PERCENT}cqmin`,
						fontSize: `${TITLE_FONT_FRACTION * titleStyle.size * PERCENT}cqmin`,
						background: titleStyle.background ? bandColor(titleStyle.background) : 'none',
						color: titleStyle.color,
						fontFamily: fontFamily(titleStyle.font),
						...motionStyle(titleMotion)
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
			{lower && lowerMotion && (
				<div
					data-testid="lower-third"
					className="absolute flex flex-col items-start font-bold whitespace-nowrap"
					style={{
						left: `${LOWER_THIRD_LEFT_FRACTION * PERCENT}cqw`,
						bottom: `${LOWER_THIRD_BOTTOM_FRACTION * PERCENT}cqh`,
						fontSize: `${LOWER_THIRD_NAME_FRACTION * lower.style.size * PERCENT}cqmin`,
						lineHeight: LOWER_THIRD_LINE_SCALE,
						padding: `${LOWER_THIRD_PADDING_SCALE / 2}em ${LOWER_THIRD_PADDING_SCALE}em`,
						background: lower.style.background ? bandColor(lower.style.background) : 'none',
						color: lower.style.color,
						fontFamily: fontFamily(lower.style.font),
						transformOrigin: 'center',
						...motionStyle(lowerMotion)
					}}
				>
					<span>{lower.name}</span>
					{lower.subtitle && (
						<span
							style={{ fontSize: `${LOWER_THIRD_SUBTITLE_FRACTION / LOWER_THIRD_NAME_FRACTION}em` }}
						>
							{lower.subtitle}
						</span>
					)}
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
