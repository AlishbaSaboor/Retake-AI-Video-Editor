'use client'

import type { RefObject } from 'react'
import { cn } from '@/lib/cn'
import { NO_ZOOM, type ZoomView } from './motion'
import { fitInside } from './overlays'
import { outputSize, rotatedFrame, type PictureTransform, type Size } from './transform'

/** The editor's player box, `aspect-video`. */
const PLAYER_RATIO = 16 / 9
/**
 * As wide as the column, but no taller than leaves the timeline in view
 * below it: the player and the row of controls under it share this.
 */
export const PLAYER_WIDTH =
	'w-full max-w-[min(100%,calc((100dvh-24rem)*16/9))] min-w-[min(100%,28rem)]'
const PERCENT = 100

type PictureFrameProps = {
	/** The source picture's size; a 16:9 stand-in until the video's metadata is in. */
	picture: Size
	/** What the preview shows: the edit's transform, or none for the original. */
	transform: PictureTransform
	/** The output frame: what the export's canvas holds, letterboxed in the player. */
	frameRef: RefObject<HTMLDivElement | null>
	/** The <video>, which must keep its place in the tree so it never reloads. */
	video: React.ReactNode
	/** Laid over the picture and turned with it: annotations, the rotation handle. */
	onPicture?: React.ReactNode
	/** Laid over the output frame, unturned: title, captions, watermark, the crop box. */
	onFrame?: React.ReactNode
	/** What the zoom shows now: how much the picture is magnified, and about where. */
	zoom?: ZoomView
}

/**
 * The preview's picture, as the export draws it: the output frame (the
 * crop of the rotated frame) fitted in the player, and the picture placed
 * in it from the same numbers as pictureMatrix, turned and flipped with
 * CSS about its centre. With no transform the picture simply fills it.
 */
export function PictureFrame({
	picture,
	transform,
	frameRef,
	video,
	onPicture,
	onFrame,
	zoom = NO_ZOOM
}: PictureFrameProps) {
	const output = outputSize(picture, transform)
	const frame = rotatedFrame(picture, transform.rotation)
	const crop = transform.crop?.rect ?? { x: 0, y: 0, width: 1, height: 1 }
	const box = fitInside(output.width / output.height, PLAYER_RATIO)
	// The picture's centre in the output, as pictureMatrix places it.
	const centreX = frame.width / 2 - crop.x * frame.width
	const centreY = frame.height / 2 - crop.y * frame.height
	const flip = `scale(${transform.flipH ? -1 : 1}, ${transform.flipV ? -1 : 1})`
	return (
		<div
			data-testid="player"
			className={cn(
				'border-border relative mx-auto aspect-video shrink-0 overflow-hidden rounded-lg border bg-black shadow-2xl',
				PLAYER_WIDTH
			)}
		>
			<div
				ref={frameRef}
				data-testid="output-frame"
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black"
				style={{
					width: `${box.widthPercent}%`,
					height: `${box.heightPercent}%`,
					containerType: 'size'
				}}
			>
				{/* The zoom: the picture (and what's pinned to it) magnified, its centre moved to the middle. */}
				<div
					data-testid="zoom"
					className="absolute inset-0"
					style={
						zoom.scale === 1
							? undefined
							: {
									transform: `scale(${zoom.scale}) translate(${(0.5 - zoom.centre.x) * PERCENT}%, ${(0.5 - zoom.centre.y) * PERCENT}%)`
								}
					}
				>
					<div
						data-testid="picture"
						className="absolute"
						style={{
							left: `${((centreX - picture.width / 2) / output.width) * PERCENT}%`,
							top: `${((centreY - picture.height / 2) / output.height) * PERCENT}%`,
							width: `${(picture.width / output.width) * PERCENT}%`,
							height: `${(picture.height / output.height) * PERCENT}%`,
							transform: `rotate(${transform.rotation}deg) ${flip}`,
							containerType: 'size'
						}}
					>
						{video}
						{onPicture}
					</div>
				</div>
				{onFrame}
			</div>
		</div>
	)
}
