import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	exportFileName,
	isUsableExport,
	lengthMismatch,
	MIN_EXPORT_BYTES,
	nextFrame,
	pickMimeType,
	totalSeconds
} from './export-video'

test('the export uses the best format the browser can record', () => {
	assert.equal(
		pickMimeType(() => true),
		'video/webm;codecs=vp9,opus'
	)
	// Safari records MP4 only.
	assert.equal(
		pickMimeType((type) => type === 'video/mp4'),
		'video/mp4'
	)
	assert.equal(
		pickMimeType(() => false),
		null
	)
})

test('the exported file is named after the take, with the recorded format', () => {
	assert.equal(exportFileName('take.mov', 'video/webm;codecs=vp9,opus'), 'take-edited.webm')
	assert.equal(exportFileName('my.talk.mp4', 'video/mp4'), 'my.talk-edited.mp4')
	assert.equal(exportFileName('noext', 'video/webm'), 'noext-edited.webm')
	assert.equal(exportFileName('.mp4', 'video/webm'), 'video-edited.webm')
})

test('the export runs as long as its segments laid end to end', () => {
	assert.equal(
		totalSeconds([
			{ startSeconds: 4, endSeconds: 6.5 },
			{ startSeconds: 0, endSeconds: 1 }
		]),
		3.5
	)
	assert.equal(totalSeconds([]), 0)
})

test('an export more than 0.25 s off the edit is flagged, with its direction', () => {
	// Healthy exports measure within ~40 ms, and up to 0.25 s either way is let through.
	assert.equal(lengthMismatch(2.96, 2.92), null)
	assert.equal(lengthMismatch(2.68, 2.92), null)
	assert.equal(lengthMismatch(3.16, 2.92), null)
	assert.ok((lengthMismatch(2.66, 2.92) ?? 0) < 0)
	assert.ok((lengthMismatch(3.18, 2.92) ?? 0) > 0)
	// The misses measured under memory pressure (PROGRESS_NOTES.md 4f, 4c).
	assert.ok(Math.abs((lengthMismatch(2.4, 2.92) ?? 0) + 0.52) < 1e-9)
	assert.ok(Math.abs((lengthMismatch(3.35, 2.96) ?? 0) - 0.39) < 1e-9)
})

test('an export with nothing recorded in it is not offered', () => {
	// A recorder that stopped as it began: a WebM header, no frames (110 bytes, as seen).
	assert.equal(isUsableExport({ size: 0 }), false)
	assert.equal(isUsableExport({ size: 110 }), false)
	assert.equal(isUsableExport({ size: MIN_EXPORT_BYTES - 1 }), false)
	// The smallest real export, a second of a small picture, is tens of kilobytes.
	assert.equal(isUsableExport({ size: MIN_EXPORT_BYTES }), true)
	assert.equal(isUsableExport({ size: 40_000 }), true)
})

test("waiting for the next frame ends when the export is stopped, though no frame ever comes (a hidden tab's)", async () => {
	// A hidden tab: frames are asked for and never drawn.
	const cancelled: number[] = []
	globalThis.requestAnimationFrame = () => 7
	globalThis.cancelAnimationFrame = (id) => void cancelled.push(id)
	const controller = new AbortController()
	const waiting = nextFrame(controller.signal)
	controller.abort('tab hidden')
	await assert.rejects(waiting, (reason) => reason === 'tab hidden')
	assert.deepEqual(cancelled, [7])
	// A frame that does come: it's waited for as before.
	globalThis.requestAnimationFrame = (draw) => {
		queueMicrotask(() => draw(0))
		return 8
	}
	await nextFrame(new AbortController().signal)
})
