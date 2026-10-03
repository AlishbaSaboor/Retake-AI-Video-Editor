import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	annotationsAt,
	blurGridSize,
	isBigEnough,
	MIN_ANNOTATION_SECONDS,
	MIN_ANNOTATION_SIZE,
	moveRect,
	moveSpan,
	moveSpanEdge,
	newSpan,
	rectBetween,
	regionRect,
	resizeRect,
	toPixels,
	type Annotation,
	type Rect
} from './annotations'

const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
const item = (id: string, startSeconds: number, endSeconds: number): Annotation => ({
	id,
	kind: 'blur',
	rect,
	startSeconds,
	endSeconds
})

const near = (actual: number, expected: number) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`)
const nearRect = (actual: Rect, expected: Rect) => {
	near(actual.x, expected.x)
	near(actual.y, expected.y)
	near(actual.width, expected.width)
	near(actual.height, expected.height)
}
const ids = (items: Annotation[]) => items.map((a) => a.id)

test('an item shows from its start up to, not at, its end, oldest first', () => {
	const items = [item('a', 1, 3), item('b', 2, 4)]
	assert.deepEqual(ids(annotationsAt(items, 0.9)), [])
	assert.deepEqual(ids(annotationsAt(items, 1)), ['a'])
	assert.deepEqual(ids(annotationsAt(items, 2.5)), ['a', 'b'])
	assert.deepEqual(ids(annotationsAt(items, 3)), ['b'])
	assert.deepEqual(ids(annotationsAt(items, 4)), [])
})

test('a drawn box spans the drag either way round, kept on the picture', () => {
	nearRect(rectBetween({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), {
		x: 0.2,
		y: 0.1,
		width: 0.4,
		height: 0.4
	})
	// A drag that leaves the picture stops at its edge.
	nearRect(rectBetween({ x: 0.8, y: 0.9 }, { x: 1.4, y: -0.2 }), {
		x: 0.8,
		y: 0,
		width: 0.2,
		height: 0.9
	})
	// A click, or a sliver, isn't a box.
	assert.equal(isBigEnough(rectBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })), false)
	assert.equal(isBigEnough({ ...rect, width: MIN_ANNOTATION_SIZE / 2 }), false)
	assert.equal(isBigEnough(rect), true)
})

test('moving keeps the size and stops at the edges; resizing keeps the corner and a minimum', () => {
	nearRect(moveRect(rect, 0.1, -0.1), { ...rect, x: 0.2, y: 0.1 })
	nearRect(moveRect(rect, 5, 5), { ...rect, x: 0.7, y: 0.6 })
	nearRect(moveRect(rect, -5, -5), { ...rect, x: 0, y: 0 })
	nearRect(resizeRect(rect, 0.5, 0.9), { ...rect, width: 0.4, height: 0.7 })
	nearRect(resizeRect(rect, 2, 2), { ...rect, width: 0.9, height: 0.8 })
	// Dragged back past its own corner: the smallest box, not a flipped one.
	nearRect(resizeRect(rect, 0, 0), {
		...rect,
		width: MIN_ANNOTATION_SIZE,
		height: MIN_ANNOTATION_SIZE
	})
})

test('a new item shows for 3 s from the playhead, cut short by the end of the edit', () => {
	assert.deepEqual(newSpan(1, 10), { startSeconds: 1, endSeconds: 4 })
	assert.deepEqual(newSpan(9, 10), { startSeconds: 9, endSeconds: 10 })
	// At the very end there's still the minimum to show it in.
	const atEnd = newSpan(10, 10)
	near(atEnd.endSeconds - atEnd.startSeconds, MIN_ANNOTATION_SECONDS)
	assert.equal(atEnd.endSeconds, 10)
})

test('an item slides in time as a whole, and its edges move without crossing', () => {
	const span = { startSeconds: 2, endSeconds: 5 }
	assert.deepEqual(moveSpan(span, 1.5, 10), { startSeconds: 3.5, endSeconds: 6.5 })
	assert.deepEqual(moveSpan(span, 20, 10), { startSeconds: 7, endSeconds: 10 })
	assert.deepEqual(moveSpan(span, -20, 10), { startSeconds: 0, endSeconds: 3 })
	assert.deepEqual(moveSpanEdge(span, 'start', 1, 10), { startSeconds: 1, endSeconds: 5 })
	assert.deepEqual(moveSpanEdge(span, 'end', 12, 10), { startSeconds: 2, endSeconds: 10 })
	near(moveSpanEdge(span, 'start', 9, 10).startSeconds, 5 - MIN_ANNOTATION_SECONDS)
	near(moveSpanEdge(span, 'end', 0, 10).endSeconds, 2 + MIN_ANNOTATION_SECONDS)
	assert.equal(moveSpanEdge(span, 'start', -3, 10).startSeconds, 0)
})

test('named regions: corners are a third of each side, halves are halves', () => {
	nearRect(regionRect('top-right'), { x: 2 / 3, y: 0, width: 1 / 3, height: 1 / 3 })
	nearRect(regionRect('bottom-left'), { x: 0, y: 2 / 3, width: 1 / 3, height: 1 / 3 })
	nearRect(regionRect('bottom'), { x: 0, y: 0.5, width: 1, height: 0.5 })
	nearRect(regionRect('full'), { x: 0, y: 0, width: 1, height: 1 })
})

test("a blur averages blocks 1/40 of the picture's width, whatever the box's size", () => {
	// 1920×1080: 48 px blocks. A 960×540 box is 20 × 11.25 blocks, rounded.
	const half = { x: 0, y: 0, width: 0.5, height: 0.5 }
	assert.deepEqual(blurGridSize(toPixels(half, 1920, 1080), 1920), { width: 20, height: 11 })
	// The same box on a 320-wide picture has the same blocks across it.
	assert.deepEqual(blurGridSize(toPixels(half, 320, 180), 320), { width: 20, height: 11 })
	// A box smaller than a block is still averaged, down to one.
	assert.deepEqual(blurGridSize({ x: 0, y: 0, width: 10, height: 10 }, 1920), {
		width: 1,
		height: 1
	})
})
