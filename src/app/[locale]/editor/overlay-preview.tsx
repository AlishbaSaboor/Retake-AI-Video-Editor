'use client'

import { useTranslations } from 'next-intl'
import { captionAt, highlightColor, spokenWordAt } from './captions'
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
	titleCentre,
	TITLE_MAX_WIDTH_FRACTION,
	watermarkRect,
	type Overlays
} from './overlays'
import { animationAt, LOWER_THIRD_ANIMATION, revealedWords, type MotionState } from './motion'
import type { TitleCard } from './overlays'
import { bandColor, DEFAULT_TEXT_STYLE, fontFamily } from './text-style'

/** An element where its motion has it: faded, moved across the frame, scaled about its centre. */
export function motionStyle(motion: MotionState) {
	return {
		opacity: motion.opacity,
		transform: `translate(${motion.dx * PERCENT}cqw, ${motion.dy * PERCENT}cqh) scale(${motion.scale})`
	}
}

const PERCENT = 100

/** Text as the export draws it: whole, or word by word while a word-by-word entrance is under way. */
export function RevealText({ text, reveal }: { text: string; reveal: number | undefined }) {
	if (reveal === undefined) return text
	return revealedWords(text, reveal).map(({ word, opacity, rise }, index) => (
		<span key={index}>
			{index > 0 && ' '}
			<span className="inline-block" style={{ opacity, transform: `translateY(${rise}em)` }}>
				{word}
			</span>
		</span>
	))
}

/** A title card (the title, or a key line) while it's on screen: its band and its text. */
function TitlePreview({ title, editedSeconds }: { title: TitleCard; editedSeconds: number }) {
	const style = title.style ?? DEFAULT_TEXT_STYLE
	const motion = animationAt(
		title.animation,
		title.startSeconds,
		title.startSeconds + title.durationSeconds,
		editedSeconds
	)
	if (!motion) return null
	const centre = titleCentre(title)
	return (
		<>
			{style.background && (
				<div
					aria-hidden
					className="absolute inset-x-0 -translate-y-1/2"
					style={{
						top: `${centre.y * PERCENT}%`,
						height: `${TITLE_FONT_FRACTION * TITLE_BAND_SCALE * style.size * PERCENT}cqmin`,
						background: bandColor(style.background),
						transformOrigin: `${centre.x * PERCENT}% 50%`,
						...motionStyle(motion)
					}}
				/>
			)}
			<div
				data-title-text
				className="absolute -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap"
				style={{
					left: `${centre.x * PERCENT}%`,
					top: `${centre.y * PERCENT}%`,
					maxWidth: `${TITLE_MAX_WIDTH_FRACTION * PERCENT}%`,
					fontSize: `${TITLE_FONT_FRACTION * style.size * PERCENT}cqmin`,
					color: style.color,
					fontFamily: fontFamily(style.font),
					...motionStyle(motion)
				}}
			>
				<RevealText text={title.text} reveal={motion.reveal} />
			</div>
		</>
	)
}

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
	const spoken = caption ? spokenWordAt(caption, editedSeconds) : null
	// Each line's first word, counted across the lines, for which one is being said.
	const firstWords = caption?.lines.map((_, index) =>
		caption.lines.slice(0, index).reduce((sum, line) => sum + line.split(' ').length, 0)
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
			{[title, ...(overlays.autoTitles ?? [])].map(
				(card, index) =>
					card && <TitlePreview key={index} title={card} editedSeconds={editedSeconds} />
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
					{caption.lines.map((line, lineIndex) => (
						<span
							key={lineIndex}
							style={{
								background: captionStyle.background ? bandColor(captionStyle.background) : 'none',
								padding: `0 ${CAPTION_PADDING_SCALE}em`
							}}
						>
							{spoken === null
								? line
								: line.split(' ').map((word, index) => (
										<span
											key={index}
											style={
												(firstWords?.[lineIndex] ?? 0) + index === spoken
													? { color: highlightColor(captionStyle.color) }
													: undefined
											}
										>
											{index > 0 && ' '}
											{word}
										</span>
									))}
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
						height: `${(logo.height / frame.height) * PERCENT}%`,
						transform: watermark.rotation ? `rotate(${watermark.rotation}deg)` : undefined
					}}
				/>
			)}
		</div>
	)
}
