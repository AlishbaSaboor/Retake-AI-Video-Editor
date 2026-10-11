'use client'

import { useEffect, useRef } from 'react'
import { drawDesign, type DesignPalette } from '../../overlays/design'

/**
 * A designed frame's background in the preview: a canvas over the whole
 * frame, drawn at the playhead by the export's own drawDesign, at the
 * screen's pixel size, so the preview shows what the export records.
 */
export function DesignCanvas({
	palette,
	totalSeconds,
	seconds,
	speaking
}: {
	palette: DesignPalette
	totalSeconds: number
	seconds: number
	speaking: boolean
}) {
	const ref = useRef<HTMLCanvasElement>(null)
	useEffect(() => {
		const canvas = ref.current
		if (!canvas) return
		const box = canvas.getBoundingClientRect()
		const width = Math.max(1, Math.round(box.width * window.devicePixelRatio))
		const height = Math.max(1, Math.round(box.height * window.devicePixelRatio))
		if (canvas.width !== width) canvas.width = width
		if (canvas.height !== height) canvas.height = height
		const context = canvas.getContext('2d')
		if (context) {
			drawDesign(context, { palette, picture: 'corner', totalSeconds }, seconds, speaking)
		}
	}, [palette, totalSeconds, seconds, speaking])
	return (
		<canvas
			ref={ref}
			data-testid="design-background"
			aria-hidden
			className="absolute inset-0 h-full w-full"
		/>
	)
}
