import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	BAND_OPACITY,
	bandColor,
	bandOpacity,
	setTextShadow,
	TEXT_SHADOW,
	textShadow,
	wordColour
} from './text-style'

test('a soft shadow only under text that asks for one, the same in the preview and the export', () => {
	assert.equal(textShadow({ shadow: true }), '0 0.06em 0.35em rgba(0, 0, 0, 0.8)')
	assert.equal(textShadow({}), 'none')
	const context = { shadowColor: '', shadowBlur: -1, shadowOffsetY: -1 }
	setTextShadow(context as unknown as CanvasRenderingContext2D, { shadow: true }, 100)
	assert.deepEqual(context, {
		shadowColor: TEXT_SHADOW.color,
		shadowBlur: 100 * TEXT_SHADOW.blur,
		shadowOffsetY: 100 * TEXT_SHADOW.drop
	})
	// Cleared for text without one, so it never carries over.
	setTextShadow(context as unknown as CanvasRenderingContext2D, {}, 100)
	assert.deepEqual(context, { shadowColor: 'transparent', shadowBlur: 0, shadowOffsetY: 0 })
})

test('one word at a time in a designed frame: the word is the one being said, in the highlight', () => {
	const style = { color: '#ffffff', highlight: '#a6e88f' }
	assert.equal(wordColour(style, 'words', true), '#a6e88f')
	// Over the picture, in lines, or with no highlight of its own: the text colour.
	assert.equal(wordColour(style, 'words', false), '#ffffff')
	assert.equal(wordColour(style, 'lines', true), '#ffffff')
	assert.equal(wordColour(style, 'highlight', true), '#ffffff')
	assert.equal(wordColour({ color: '#ffffff' }, 'words', true), '#ffffff')
	assert.equal(wordColour(style, undefined, true), '#ffffff')
})

test('a band is see-through unless solid', () => {
	assert.equal(bandColor('#123456', bandOpacity({ solidBand: true })), 'rgba(18, 52, 86, 1)')
	assert.equal(bandColor('#123456', bandOpacity({})), `rgba(18, 52, 86, ${BAND_OPACITY})`)
})
