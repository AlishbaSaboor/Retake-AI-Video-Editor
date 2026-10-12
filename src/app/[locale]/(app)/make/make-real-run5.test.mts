import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTranscript } from '../../editor/audio/transcript'
import {
	checkReplySchema,
	FACE_CORNER,
	makeReplySchema,
	planMake,
	webcamOverScreen,
	type MakeReply
} from './make-plan'
import type { MakeChoices } from './make-questions'

// The owner's fifth real run (2026-10-12): "make an ad" on the 4:41 screen
// recording, with the speaker in a webcam bubble. Gemini called it one
// person with a corner card, its face at the bottom left of every picture,
// and filled in a "bold" tone nobody asked for. Replayed with the fake AI.

const fixture = (name: string) =>
	JSON.parse(readFileSync(new URL(`../../../../../e2e/fixtures/${name}`, import.meta.url), 'utf8'))
const REAL = makeReplySchema.parse(fixture('real-run5-reply.json'))
const CHECK = checkReplySchema.parse(fixture('real-run5-check.json'))

// The recording's 79 sentences, as the replay tests stand them in.
const transcript = toTranscript(
	Array.from({ length: 79 }, (_, i) => ({
		word: `Step${i + 1}.`,
		start: i * 3.5,
		end: i * 3.5 + 3
	}))
)
const plan = (reply: MakeReply, request: string, choices: MakeChoices | null = null) =>
	planMake({
		reply,
		request,
		durationSeconds: 281,
		picture: { width: 1920, height: 1080 },
		transcript,
		fillerCuts: [],
		music: null,
		musicAvailable: false,
		choices
	})
/** The owner's clicks: vertical, 30 s, Bold, "Follow for more"; tone skipped. */
const CLICKED: MakeChoices = {
	kind: null,
	adShape: 'vertical',
	length: '30',
	style: 'bold',
	voice: null,
	music: null,
	tone: null,
	callToAction: 'Follow for more',
	asked: ['adShape', 'length', 'style', 'tone', 'callToAction']
}
const faces = (spots: Array<[number, number]>) => spots.map(([x, y], i) => ({ frame: i + 1, x, y }))

test('the saved real reply: a webcam bubble over a screen, as Gemini returned it', () => {
	assert.equal(REAL.subject, 'one_person')
	assert.equal(REAL.card, 'corner')
	assert.ok(REAL.faces.length > 0 && REAL.faces.every((f) => f.x === 100 && f.y === 750))
	assert.equal(REAL.brief.tone, 'bold')
	assert.equal(CHECK.problems.length, 1)
	assert.equal(webcamOverScreen(REAL), true)
})

test('a webcam bubble is a face in a corner in at least half its pictures; the limits are one constant', () => {
	assert.deepEqual(FACE_CORNER, { low: 300, high: 700, share: 0.5 })
	const person = (spots: Array<[number, number]>) =>
		({ subject: 'one_person', card: 'corner', faces: faces(spots) }) as const
	// A talking head, face centred: not a bubble.
	assert.equal(
		webcamOverScreen(
			person([
				[500, 400],
				[510, 390],
				[490, 410]
			])
		),
		false
	)
	// Off-centre, but not in a corner (the middle band either way): not a bubble.
	assert.equal(
		webcamOverScreen(
			person([
				[800, 450],
				[820, 460]
			])
		),
		false
	)
	assert.equal(
		webcamOverScreen(
			person([
				[500, 850],
				[480, 860]
			])
		),
		false
	)
	// In a corner in fewer than half the pictures: not a bubble; in half exactly, it is.
	const fourOfTen = [...Array(4).fill([100, 750]), ...Array(6).fill([500, 400])]
	assert.equal(webcamOverScreen(person(fourOfTen)), false)
	const fiveOfTen = [...Array(5).fill([100, 750]), ...Array(5).fill([500, 400])]
	assert.equal(webcamOverScreen(person(fiveOfTen)), true)
	// The limits themselves count as the corner.
	assert.equal(webcamOverScreen(person([[300, 700]])), true)
	assert.equal(webcamOverScreen(person([[301, 700]])), false)
	// No face positions: today's behaviour (the label decides).
	assert.equal(webcamOverScreen({ subject: 'one_person', card: 'corner', faces: [] }), false)
	// Only one person with a corner card: a hidden card, or another label, isn't one.
	assert.equal(webcamOverScreen({ ...person([[100, 750]]), card: 'hidden' }), false)
	assert.equal(webcamOverScreen({ ...person([[100, 750]]), subject: 'meeting' }), false)
	// Known limit: a speaker sitting in a corner of their own frame reads as a bubble too.
	assert.equal(
		webcamOverScreen(
			person([
				[150, 800],
				[160, 790]
			])
		),
		true
	)
})

test('replayed: "make an ad" on the bubble recording is designed, with no picture of the screen', () => {
	const { edit, summary } = plan(REAL, 'make an ad', CLICKED)
	assert.equal(summary.shape.how, 'designed')
	assert.deepEqual(summary.screen, { treatment: 'designed', why: 'promo' })
	assert.equal(edit.design?.picture, 'hidden')
	assert.equal(summary.card, 'hidden')
	assert.equal(summary.shape.target, 'vertical')
	// The clicks still hold: Bold, at most 30 s.
	assert.deepEqual(summary.look, { preset: 'bold', said: true })
	assert.equal(summary.maxSeconds, 30)
	assert.ok(summary.editedSeconds <= 30)
})

test('replayed: "shorten this walkthrough" on the bubble recording shows the whole screen, never zoomed', () => {
	const { edit, summary } = plan(REAL, 'shorten this walkthrough')
	assert.equal(summary.screen?.treatment, 'whole')
	assert.equal(edit.design, null)
	assert.equal(edit.autoZooms.filter((z) => z.direction === 'in').length, 0)
})

test('a talking head filling the frame keeps today’s plan: not a screen, never designed', () => {
	const centred = { ...REAL, faces: faces(Array(29).fill([500, 400])) }
	assert.equal(webcamOverScreen(centred), false)
	const { edit, summary } = plan(centred, 'make an ad', CLICKED)
	assert.equal(summary.screen, null)
	assert.notEqual(summary.shape.how, 'designed')
	assert.equal(edit.design, null)
	// Exactly what it planned before this rule: one person, whole with bars in an ad.
	assert.equal(summary.shape.how, 'whole')
})

test('a clicked look never counts as the user’s words: Gemini’s “bold” tone is chosen for them', () => {
	const { summary } = plan(REAL, 'make an ad', CLICKED)
	assert.equal(summary.brief.tone, 'bold')
	assert.equal(summary.brief.said.tone, false)
	// An ad reads as a promo: the card says "Chosen for a promo: bold tone".
	assert.equal(summary.brief.chosenFor, 'promo')
	// What was typed or clicked as the brief still is theirs.
	assert.equal(summary.brief.callToAction, 'Follow for more')
	assert.equal(summary.brief.said.callToAction, true)
	// A tone the user types themselves reads as theirs.
	const typed = plan(REAL, 'make an ad', { ...CLICKED, tone: 'bold' })
	assert.equal(typed.summary.brief.said.tone, true)
	// So does one in the request.
	assert.equal(plan(REAL, 'make a bold ad', CLICKED).summary.brief.said.tone, true)
})

test('no brief part is the user’s from a look click alone', () => {
	const brief = {
		audience: 'playful people',
		tone: 'cinematic',
		length: null,
		show: 'clean demo',
		callToAction: null
	}
	for (const style of ['clean', 'bold', 'cinematic', 'playful'] as const) {
		const { summary } = plan({ ...REAL, brief }, 'make an ad', {
			...CLICKED,
			style,
			callToAction: null
		})
		assert.deepEqual(
			[summary.brief.said.audience, summary.brief.said.tone, summary.brief.said.show],
			[false, false, false],
			style
		)
	}
})
