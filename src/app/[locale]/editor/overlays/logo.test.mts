import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	angleTo,
	clampLogoSize,
	inCorner,
	logoBox,
	MAX_LOGO_SIZE,
	MIN_LOGO_SIZE,
	movedLogo,
	normalDegrees,
	resizedLogo,
	resizedTo,
	rotatedLogo,
	unturned
} from './logo'
import { watermarkRect, type Watermark } from './overlays'

const FRAME = { width: 320, height: 180 }
// A 2:1 logo, 15% of the frame's width: 48×24 px, bottom-right.
const LOGO: Watermark = { image: 'data:', aspect: 2, corner: 'bottom-right' }

const near = (actual: number | undefined, expected: number, within = 1e-9) =>
	assert.ok(Math.abs((actual ?? NaN) - expected) < within, `${actual} ≠ ${expected}`)

test('a logo sits in its corner until placed by hand, then where it was put', () => {
	assert.deepEqual(watermarkRect(LOGO, 320, 180), {
		x: 320 - 9.6 - 48,
		y: 180 - 9.6 - 24,
		width: 48,
		height: 24
	})
	const placed = { ...LOGO, at: { x: 0.25, y: 0.5 } }
	assert.deepEqual(watermarkRect(placed, 320, 180), { x: 80, y: 90, width: 48, height: 24 })
	// Kept inside a frame narrower than the one it was placed in.
	const far = { ...LOGO, at: { x: 0.95, y: 0.95 } }
	assert.deepEqual(watermarkRect(far, 320, 180), { x: 272, y: 156, width: 48, height: 24 })
})

test('a drag moves the logo from where it is, never past the frame', () => {
	const moved = movedLogo(LOGO, FRAME, -0.5, -0.5)
	const before = logoBox(LOGO, FRAME)
	near(moved.at?.x, before.x - 0.5)
	near(moved.at?.y, before.y - 0.5)
	assert.deepEqual(movedLogo(LOGO, FRAME, -2, -2).at, { x: 0, y: 0 })
	const box = logoBox(LOGO, FRAME)
	assert.deepEqual(movedLogo(LOGO, FRAME, 2, 2).at, { x: 1 - box.width, y: 1 - box.height })
})

test('resizing keeps the shape: from the top-left by its corner, in its corner from the field', () => {
	const placed = { ...LOGO, at: { x: 0.1, y: 0.1 } }
	const bigger = resizedTo(placed, FRAME, { x: 0.5, y: 0.2 })
	near(bigger.size, 0.4)
	assert.deepEqual(bigger.at, { x: 0.1, y: 0.1 })
	near(logoBox(bigger, FRAME).height, (0.4 * 320) / 2 / 180)
	// Dragged down further than across: the height decides.
	near(resizedTo(placed, FRAME, { x: 0.12, y: 0.4 }).size, (0.3 * 180 * 2) / 320)
	const sized = resizedLogo(LOGO, FRAME, 0.3)
	near(sized.size, 0.3)
	assert.equal(sized.at, undefined)
	assert.equal(sized.corner, 'bottom-right')
})

test('a logo is 5–60% of the frame wide, and never taller than it', () => {
	assert.equal(clampLogoSize(0.01, LOGO, FRAME), MIN_LOGO_SIZE)
	assert.equal(clampLogoSize(0.9, LOGO, FRAME), MAX_LOGO_SIZE)
	// A tall 1:2 logo in a 16:9 frame: at most 180/2 = 90 px wide, 0.28 of 320.
	const tall = { ...LOGO, aspect: 0.5 }
	near(clampLogoSize(0.5, tall, FRAME), (0.5 * 180) / 320)
	// Grown near the edge: pushed back inside.
	const edge = resizedLogo({ ...LOGO, at: { x: 0.9, y: 0.1 } }, FRAME, 0.4)
	near(edge.at?.x, 0.6)
})

test('a corner puts a placed logo back, keeping its size', () => {
	const placed = { ...LOGO, size: 0.3, at: { x: 0.2, y: 0.2 } }
	assert.deepEqual(inCorner(placed, 'top-left'), {
		image: 'data:',
		aspect: 2,
		corner: 'top-left',
		size: 0.3
	})
})

test('a turned logo keeps its angle the short way round, and upright drops it', () => {
	assert.equal(normalDegrees(190), -170)
	assert.equal(normalDegrees(-190), 170)
	assert.equal(normalDegrees(540), 180)
	assert.equal(rotatedLogo(LOGO, 30).rotation, 30)
	assert.equal(rotatedLogo(LOGO, 360.2).rotation, undefined)
	assert.ok(!('rotation' in rotatedLogo({ ...LOGO, rotation: 10 }, 0)))
})

test('the rotate handle’s angle is measured in pixels, clockwise from straight up', () => {
	const centre = { x: 0.5, y: 0.5 }
	near(angleTo(centre, { x: 0.5, y: 0.2 }, FRAME), 0)
	near(angleTo(centre, { x: 0.8, y: 0.5 }, FRAME), 90)
	near(angleTo(centre, { x: 0.5, y: 0.9 }, FRAME), 180)
	// 90 px right and 90 px up, in a 320×180 frame: 45°, though the fractions differ.
	near(angleTo(centre, { x: 0.5 + 90 / 320, y: 0.5 - 90 / 180 }, FRAME), 45)
})

test('a point turned back about a centre lands where it is on the upright box', () => {
	const centre = { x: 0.5, y: 0.5 }
	// 32 px right of the centre, on a logo turned 90°: straight above it, unturned.
	const point = unturned({ x: 0.6, y: 0.5 }, centre, 90, FRAME)
	near(point.x, 0.5)
	near(point.y, 0.5 - 32 / 180)
})
