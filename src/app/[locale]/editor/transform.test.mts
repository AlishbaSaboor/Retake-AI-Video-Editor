import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	apply,
	centredCrop,
	evenPixels,
	IDENTITY_TRANSFORM,
	invert,
	isIdentity,
	normalizeDegrees,
	outputSize,
	outputToPicture,
	pictureMatrix,
	refitCrop,
	resizeCrop,
	rotatedFrame,
	withRotation,
	type PictureTransform
} from './transform'

const picture = { width: 320, height: 180 }
const near = (actual: number, expected: number, within = 1e-6) =>
	assert.ok(Math.abs(actual - expected) <= within, `${actual} ≠ ${expected}`)
const nearPoint = (p: { x: number; y: number }, x: number, y: number) => {
	near(p.x, x)
	near(p.y, y)
}
const t = (fields: Partial<PictureTransform>): PictureTransform => ({
	...IDENTITY_TRANSFORM,
	...fields
})

test('the untouched picture maps onto itself', () => {
	assert.equal(isIdentity(IDENTITY_TRANSFORM), true)
	assert.deepEqual(outputSize(picture, IDENTITY_TRANSFORM), picture)
	const m = pictureMatrix(picture, IDENTITY_TRANSFORM)
	nearPoint(apply(m, 0, 0), 0, 0)
	nearPoint(apply(m, 320, 180), 320, 180)
})

test('angles fold into (-180, 180]', () => {
	assert.equal(normalizeDegrees(0), 0)
	assert.equal(normalizeDegrees(370), 10)
	assert.equal(normalizeDegrees(-190), 170)
	assert.equal(normalizeDegrees(180), 180)
	assert.equal(normalizeDegrees(-180), 180)
	assert.equal(normalizeDegrees(-90), -90)
})

test('a quarter turn swaps the frame, with no corners; any other angle frames the whole picture', () => {
	const quarter = rotatedFrame(picture, 90)
	near(quarter.width, 180)
	near(quarter.height, 320)
	// 90° clockwise: the top-left corner goes to the top-right.
	const m = pictureMatrix(picture, t({ rotation: 90 }))
	nearPoint(apply(m, 0, 0), 180, 0)
	nearPoint(apply(m, 0, 180), 0, 0)
	nearPoint(apply(m, 320, 180), 0, 320)
	// 15°: the frame is the turned picture's bounding box, and every corner lands inside it.
	const tilted = t({ rotation: 15 })
	const frame = rotatedFrame(picture, 15)
	near(frame.width, 320 * Math.cos(Math.PI / 12) + 180 * Math.sin(Math.PI / 12))
	const tm = pictureMatrix(picture, tilted)
	for (const [x, y] of [
		[0, 0],
		[320, 0],
		[0, 180],
		[320, 180]
	] as const) {
		const p = apply(tm, x, y)
		assert.ok(
			p.x >= -1e-9 && p.x <= frame.width + 1e-9 && p.y >= -1e-9 && p.y <= frame.height + 1e-9
		)
	}
	// The centre stays the centre.
	nearPoint(apply(tm, 160, 90), frame.width / 2, frame.height / 2)
})

test('flips mirror the picture in place', () => {
	nearPoint(apply(pictureMatrix(picture, t({ flipH: true })), 20, 60), 300, 60)
	nearPoint(apply(pictureMatrix(picture, t({ flipV: true })), 20, 60), 20, 120)
	// Flipped, then turned 90° clockwise: the top-left goes to the top-right
	// by the flip, then to the bottom-right of the 180×320 frame by the turn.
	nearPoint(apply(pictureMatrix(picture, t({ flipH: true, rotation: 90 })), 0, 0), 180, 320)
})

test('a crop shifts and sizes the output, and maps back to the picture', () => {
	const crop = { rect: { x: 0.25, y: 0, width: 0.5, height: 1 }, aspect: 'free' as const }
	const cropped = t({ crop })
	assert.deepEqual(outputSize(picture, cropped), { width: 160, height: 180 })
	nearPoint(apply(pictureMatrix(picture, cropped), 80, 0), 0, 0)
	// The output's centre is the picture's centre; its left edge is a quarter in.
	nearPoint(outputToPicture(picture, cropped, { x: 0.5, y: 0.5 }), 0.5, 0.5)
	nearPoint(outputToPicture(picture, cropped, { x: 0, y: 0 }), 0.25, 0)
	// And through a turn: the inverse undoes the matrix.
	const turned = t({ rotation: 33, flipV: true, crop })
	const m = pictureMatrix(picture, turned)
	const back = apply(invert(m), ...(Object.values(apply(m, 50, 70)) as [number, number]))
	nearPoint(back, 50, 70)
})

test('presets crop the largest centred rectangle of their shape, and keep it when the frame turns', () => {
	// 9:16 from 320×180: 101.25×180, centred.
	const portrait = centredCrop(9 / 16, picture)
	near(portrait.height, 1)
	near(portrait.width * 320, 101.25)
	near(portrait.x, (1 - portrait.width) / 2)
	const square = centredCrop(1, picture)
	near(square.width * 320, 180)
	// Turned 90° the frame is 180×320: a 9:16 preset now fills its width.
	const crop = { rect: portrait, aspect: '9:16' as const }
	const turned = withRotation(t({ crop }), 90, picture)
	const out = outputSize(picture, turned)
	near(out.width / out.height, 9 / 16)
	near(out.width, 180)
	// A free crop keeps its fractions.
	const free = { rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, aspect: 'free' as const }
	assert.deepEqual(refitCrop(free, rotatedFrame(picture, 90)), free)
	assert.equal(withRotation(t({}), 450, picture).rotation, 90)
})

test('resizing a crop keeps a preset shape and stays inside the frame', () => {
	const rect = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }
	const free = resizeCrop(rect, 0.5, 0.3, null, picture)
	near(free.width, 0.4)
	near(free.height, 0.2)
	const square = resizeCrop(rect, 0.5, 0.9, 1, picture)
	near((square.width * 320) / (square.height * 180), 1)
	assert.ok(square.y + square.height <= 1 + 1e-9)
})

test('canvas sizes are whole even pixels', () => {
	assert.deepEqual(evenPixels({ width: 101.25, height: 180 }), { width: 102, height: 180 })
	assert.deepEqual(evenPixels({ width: 0.3, height: 357.1 }), { width: 2, height: 358 })
})
