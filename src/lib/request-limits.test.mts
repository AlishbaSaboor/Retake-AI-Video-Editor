import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ACTION_REQUEST_BYTES } from './request-limits'
import { MAX_AUDIO_BASE64_LENGTH } from '@/app/[locale]/editor/audio/take-audio'
import { MAX_VOICE_BASE64_LENGTH } from '@/app/[locale]/editor/assistant/voice-command'
import {
	FRAME_SEPARATOR,
	MAX_ANSWER_LENGTH,
	MAX_FRAME_BASE64_LENGTH,
	MAX_FRAMES,
	MAX_MAKE_SECONDS,
	MAX_QUESTIONS,
	MAX_REQUEST_LENGTH
} from '@/app/[locale]/(app)/make/make-plan'

// Every Server Action request has to fit in one request to a Vercel Function
// (4.5 MB), whatever its inputs, up to the limits each action's own
// validation allows. A Server Action's arguments travel as JSON; each worst
// case below is built at those limits and measured as the bytes sent. Text
// is a 3-byte UTF-8 character throughout, the most a character costs.

/** As sent: the action's arguments, as JSON, in UTF-8. */
const requestBytes = (...args: unknown[]) => Buffer.byteLength(JSON.stringify(args), 'utf8')
const text = (length: number) => '€'.repeat(length)
/** The transcript action's and Make it's own caps on the transcript sent (actions.ts). */
const MAX_SENTENCES = 400
const MAX_SENTENCE_LENGTH = 1000

test('the longest inline take fits in one request', () => {
	const bytes = requestBytes({ audioBase64: 'A'.repeat(MAX_AUDIO_BASE64_LENGTH) })
	assert.ok(bytes < MAX_ACTION_REQUEST_BYTES, `${bytes} bytes`)
})

test('the longest spoken command fits in one request', () => {
	const bytes = requestBytes({ audioBase64: 'A'.repeat(MAX_VOICE_BASE64_LENGTH) })
	assert.ok(bytes < MAX_ACTION_REQUEST_BYTES, `${bytes} bytes`)
})

test('Make it’s plan with five minutes of pictures and the longest transcript fits in one request', () => {
	const bytes = requestBytes({
		request: text(MAX_REQUEST_LENGTH),
		answers: Array.from({ length: MAX_QUESTIONS }, () => ({
			question: text(MAX_ANSWER_LENGTH),
			answer: text(MAX_ANSWER_LENGTH)
		})),
		durationSeconds: MAX_MAKE_SECONDS,
		sentences: Array.from({ length: MAX_SENTENCES }, (_, i) => ({
			startSeconds: i * 0.75,
			endSeconds: i * 0.75 + 0.7,
			text: text(MAX_SENTENCE_LENGTH)
		})),
		frames: Array.from({ length: MAX_FRAMES }, () => 'A'.repeat(MAX_FRAME_BASE64_LENGTH)).join(
			FRAME_SEPARATOR
		)
	})
	assert.ok(bytes < MAX_ACTION_REQUEST_BYTES, `${bytes} bytes`)
})
