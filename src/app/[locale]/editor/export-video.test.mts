import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportFileName, pickMimeType, totalSeconds } from './export-video'

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
