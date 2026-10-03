import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOriginalEdit, ORIGINAL_EDIT, type EditSnapshot } from './edit-snapshot'
import { mergeClips, moveClip, splitClipAt, wholeTake } from './sequence'

const DURATION = 10
const newId = () => crypto.randomUUID()
const original: EditSnapshot<{ takeSeconds: number }> = { ...ORIGINAL_EDIT, replacements: [] }

test('the edit right after upload is the original', () => {
	assert.equal(isOriginalEdit(ORIGINAL_EDIT, DURATION), true)
})

test('any trim, cut, split, take, title, watermark, captions or annotation is something to reset', () => {
	const split = splitClipAt(wholeTake(DURATION), 4, newId)
	assert.equal(
		isOriginalEdit({ ...original, trim: { startSeconds: 1, endSeconds: 10 } }, DURATION),
		false
	)
	assert.equal(
		isOriginalEdit({ ...original, cuts: [{ startSeconds: 2, endSeconds: 3 }] }, DURATION),
		false
	)
	assert.equal(isOriginalEdit({ ...original, clips: split }, DURATION), false)
	assert.equal(isOriginalEdit({ ...original, replacements: [{ takeSeconds: 1 }] }, DURATION), false)
	assert.equal(
		isOriginalEdit(
			{ ...original, title: { text: 'Hi', startSeconds: 0, durationSeconds: 3 } },
			DURATION
		),
		false
	)
	assert.equal(
		isOriginalEdit(
			{ ...original, watermark: { image: '', aspect: 1, corner: 'top-left' } },
			DURATION
		),
		false
	)
	assert.equal(isOriginalEdit({ ...original, captionsOn: true }, DURATION), false)
	const blur = {
		id: 'a',
		kind: 'blur',
		rect: { x: 0, y: 0, width: 1, height: 1 },
		startSeconds: 0,
		endSeconds: 1
	} as const
	assert.equal(isOriginalEdit({ ...original, annotations: [blur] }, DURATION), false)
})

test('a trim dragged back to the edges, or a split merged again, is the original', () => {
	const split = splitClipAt(wholeTake(DURATION), 4, newId) ?? []
	assert.equal(
		isOriginalEdit({ ...original, trim: { startSeconds: 0, endSeconds: 10 } }, DURATION),
		true
	)
	assert.equal(isOriginalEdit({ ...original, clips: mergeClips(split, 0, 1) }, DURATION), true)
	// Reordered and merged, the clip plays the take out of order: not the original.
	assert.equal(
		isOriginalEdit({ ...original, clips: mergeClips(moveClip(split, 0, 1), 0, 1) }, DURATION),
		false
	)
})
