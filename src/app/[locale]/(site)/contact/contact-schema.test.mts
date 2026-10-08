import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactSchema, storedMessage } from './contact-schema.ts'

test('a name is optional, and an empty one is kept as none', () => {
	const base = { email: 'sam@example.com', message: 'Hello' }
	assert.equal(contactSchema.parse(base).name, null)
	assert.equal(contactSchema.parse({ ...base, name: '   ' }).name, null)
	assert.equal(contactSchema.parse({ ...base, name: ' Sam ' }).name, 'Sam')
	assert.throws(() => contactSchema.parse({ ...base, name: 'x'.repeat(101) }))
})

test('the topic is one of the form’s, a question when not given', () => {
	const base = { email: 'sam@example.com', message: 'Hello' }
	assert.equal(contactSchema.parse(base).topic, 'question')
	assert.equal(contactSchema.parse({ ...base, topic: 'broken' }).topic, 'broken')
	assert.throws(() => contactSchema.parse({ ...base, topic: 'spam' }))
})

test('the message still needs an email and some words', () => {
	assert.throws(() => contactSchema.parse({ email: 'nope', message: 'Hello' }))
	assert.throws(() => contactSchema.parse({ email: 'sam@example.com', message: '  ' }))
})

test('the stored message starts with its topic', () => {
	assert.equal(storedMessage('idea', 'Add a dark mode'), '[idea] Add a dark mode')
})
