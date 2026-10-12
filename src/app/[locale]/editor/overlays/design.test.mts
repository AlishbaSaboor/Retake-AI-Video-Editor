import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawDesign } from './design'

/** A canvas that records the colour each shape is filled in. */
function recordingCanvas(width: number, height: number) {
	const fills: string[] = []
	let fillStyle: unknown = ''
	const gradient = { addColorStop: () => undefined }
	const context = new Proxy(
		{},
		{
			get(_, key) {
				if (key === 'canvas') return { width, height }
				if (key === 'fillStyle') return fillStyle
				if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient
				if (key === 'fill')
					return () => fills.push(typeof fillStyle === 'string' ? fillStyle : 'gradient')
				return () => undefined
			},
			set(_, key, value) {
				if (key === 'fillStyle') fillStyle = value
				return true
			}
		}
	)
	return { context: context as CanvasRenderingContext2D, fills }
}

test('a designed frame’s progress bar and wave are drawn in the look’s accent', () => {
	const look = {
		from: '#0a1a0a',
		to: '#102810',
		shape: '#1a4a1a',
		accent: '#a6e88f',
		bar: 'thick' as const,
		wave: true
	}
	const { context, fills } = recordingCanvas(1080, 1920)
	drawDesign(context, { palette: 'reel', picture: 'hidden', look, totalSeconds: 10 }, 5, true)
	// The bar's track, then its progress in the accent; the wave's bars stay in it.
	assert.equal(fills[0], 'rgba(255, 255, 255, 0.25)')
	assert.ok(fills.length > 2)
	for (const fill of fills.slice(1)) assert.equal(fill, '#a6e88f')
})
