import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shown } from './project-filter.ts'

const projects = [
	{ id: 'a', name: 'Weekend trip', savedAt: 3 },
	{ id: 'b', name: 'Ocean reel', savedAt: 2 },
	{ id: 'c', name: 'City promo trip', savedAt: 1 }
]
const names = (list: { name: string }[]) => list.map(({ name }) => name)

test('nothing typed: every project, newest first as given', () => {
	assert.deepEqual(names(shown(projects, '  ', 'edited')), [
		'Weekend trip',
		'Ocean reel',
		'City promo trip'
	])
})

test('every word typed must be in the name, in any case and order', () => {
	assert.deepEqual(names(shown(projects, 'TRIP', 'edited')), ['Weekend trip', 'City promo trip'])
	assert.deepEqual(names(shown(projects, 'trip city', 'edited')), ['City promo trip'])
	assert.deepEqual(names(shown(projects, 'mountain', 'edited')), [])
})

test('by name: alphabetical, without changing the list given', () => {
	assert.deepEqual(names(shown(projects, '', 'name')), [
		'City promo trip',
		'Ocean reel',
		'Weekend trip'
	])
	assert.equal(projects[0]?.name, 'Weekend trip')
})
