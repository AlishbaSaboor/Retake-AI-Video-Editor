import { writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { mockActions, openEditorWithVideo, seekTo, w } from './editor-helpers'

/**
 * What the fake microphone "says", looped by Chromium: 0.4 s of silence, an
 * 880 Hz tone for 0.8 s (the re-recorded sentence — an octave above the test
 * video's 440 Hz, so the two can be told apart in the export), then silence.
 */
function fakeMicWav(): string {
	const rate = 48_000
	const pieces: Array<[number, number]> = [
		[0.4, 0],
		[0.8, 0.3],
		[3, 0]
	]
	const samples: number[] = []
	for (const [seconds, amplitude] of pieces) {
		for (let i = 0; i < Math.round(seconds * rate); i++) {
			samples.push(amplitude * Math.sin((2 * Math.PI * 880 * samples.length) / rate))
		}
	}
	const wav = Buffer.alloc(44 + samples.length * 2)
	wav.write('RIFF', 0)
	wav.writeUInt32LE(36 + samples.length * 2, 4)
	wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16)
	wav.writeUInt16LE(1, 20)
	wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(rate, 24)
	wav.writeUInt32LE(rate * 2, 28)
	wav.writeUInt16LE(2, 32)
	wav.writeUInt16LE(16, 34)
	wav.write('data', 36)
	wav.writeUInt32LE(samples.length * 2, 40)
	for (const [i, sample] of samples.entries()) {
		wav.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * 2)
	}
	const path = join(tmpdir(), 'retake-e2e-fake-mic.wav')
	writeFileSync(path, wav)
	return path
}

test.use({
	launchOptions: {
		args: [
			'--use-fake-device-for-media-stream',
			'--use-fake-ui-for-media-stream',
			`--use-file-for-fake-audio-capture=${fakeMicWav()}`
		]
	}
})

// One test at a time: takes are recorded against the clock, and the undo
// test's nine real-time exports beside the other test starved its page (a
// 50 ms meter poll answered 370 ms late) and came out a take of 0.9 s, not 1.0.
test.describe.configure({ mode: 'default' })

// The pauses between the video's "sentences" hold a faint tone (~-57 dBFS)
// rather than digital silence, as a real room does: against digital
// silence, the encoder's fade-out after each tone reads as sound for ~0.3 s
// and pushes every pause's start back.
const ROOM_TONE = 0.002

/** Records a take for the open re-record panel: about 2 s, so one 0.8 s tone, watching the meter. */
async function recordTake(page: Page) {
	const panel = page.getByRole('region', { name: /^Re-record the sentence/ })
	const started = Date.now()
	await panel.getByRole('button', { name: /^Record/ }).click()
	await expect(panel.getByText(/^Recording…/)).toBeVisible()
	// The meter follows the mic: from silence to clearly above it (louder than
	// -42 dBFS) for the fake mic's tone, which the browser's noise suppression
	// then fades, as it does any steady tone; real speech isn't faded.
	const meter = panel.getByRole('meter', { name: 'Microphone level' })
	await expect
		.poll(async () => Number(await meter.getAttribute('aria-valuenow')), {
			intervals: [50],
			timeout: 2000
		})
		.toBeGreaterThan(30)
	await page.waitForTimeout(Math.max(0, 2000 - (Date.now() - started)))
	await panel.getByRole('button', { name: 'Stop' }).click()
	await expect(panel.getByText(/^New take: 1\.0 s/)).toBeVisible({ timeout: 10_000 })
	return panel
}

test('a re-recorded take replaces only its sentence, in playback and export, and cancel or undo restore it', async ({
	page
}) => {
	test.setTimeout(120_000)
	// Four "sentences" of 440 Hz tone: B (2 s) gets a shorter take, so its
	// picture is cut short; C (0.5 s) a longer one, so its last frame holds.
	await mockActions(page, {
		words: [
			w('Alpha.', 0, 1),
			w('Bravo', 1.6, 2.6),
			w('words.', 2.6, 3.6),
			w('Charlie.', 4.2, 4.7),
			w('Delta.', 5.5, 6.5)
		]
	})
	const duration = await openEditorWithVideo(
		page,
		[
			[1, true],
			[0.6, false],
			[2, true],
			[0.6, false],
			[0.5, true],
			[0.8, false],
			[1, true]
		],
		ROOM_TONE
	)
	const reRecord = (at: string) =>
		page.getByRole('button', { name: `Re-record the sentence at ${at}` })
	await expect(reRecord('0:01')).toBeVisible({ timeout: 30_000 })
	const clip = page.getByRole('region', { name: 'Clips' }).getByRole('option')

	// A sentence with no pause before it can't be re-recorded, and says why.
	await reRecord('0:00').click()
	const blocked = page.getByRole('region', { name: 'Re-record the sentence at 0:00' })
	await expect(blocked.getByText(/no clear pause before this sentence/)).toBeVisible()
	await expect(blocked.getByRole('button', { name: 'Record' })).toBeDisabled()
	await blocked.getByRole('button', { name: 'Cancel' }).click()

	// Cancel after recording leaves everything as it was.
	await reRecord('0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Cancel' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toHaveCount(0)
	await expect(clip).toHaveAttribute('aria-label', /plays 0:06,/)

	// Use the take for B, then one for C.
	await reRecord('0:01').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await reRecord('0:04').click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(2)
	// 6.5 s, less the 1.2 s of B's tone the shorter take doesn't fill, plus
	// the 0.3 s C's longer take holds the picture for.
	await expect(clip).toHaveAttribute('aria-label', /plays 0:05,/)

	// In the editor, the video goes quiet under C's take, holds C's last
	// frame while the take finishes, then plays on into D with its sound back.
	const video = page.locator('video')
	await seekTo(page, 3.9)
	const samples = await video.evaluate(async (element: HTMLVideoElement) => {
		element.muted = true
		await element.play()
		const seen: Array<{ at: number; paused: boolean; volume: number }> = []
		const started = performance.now()
		while (performance.now() - started < 3000) {
			seen.push({ at: element.currentTime, paused: element.paused, volume: element.volume })
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		element.pause()
		return seen
	})
	const inC = samples.filter((s) => s.at > 4.3 && s.at < 4.6)
	expect(inC.length).toBeGreaterThan(0)
	expect(inC.every((s) => s.volume === 0)).toBe(true)
	const holding = samples.filter((s) => s.paused && s.volume === 0)
	expect(holding.length * 20).toBeGreaterThan(150)
	expect(samples.some((s) => s.at > 5.6 && !s.paused && s.volume === 1)).toBe(true)

	// The export: the take's 880 Hz is heard only where B and C were, the
	// original 440 Hz everywhere else, and it is as long as the edit.
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	const measured = await page.evaluate(
		async (bytes) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			// Goertzel: the strength of one frequency over 100 ms around `at`.
			const strength = (at: number, hz: number) => {
				const from = Math.floor((at - 0.05) * audio.sampleRate)
				const n = Math.floor(0.1 * audio.sampleRate)
				const coeff = 2 * Math.cos((2 * Math.PI * hz) / audio.sampleRate)
				let s1 = 0
				let s2 = 0
				for (let i = 0; i < n; i++) {
					const s0 = (samples[from + i] ?? 0) + coeff * s1 - s2
					s2 = s1
					s1 = s0
				}
				return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / n
			}
			// Export times: A's tone; B's take; the pause after B; C's take; D's tone.
			const probes = [0.5, 2.0, 2.7, 3.4, 5.0]
			return {
				audioSeconds: audio.duration,
				probes: probes.map((at) => ({ at, low: strength(at, 440), high: strength(at, 880) }))
			}
		},
		[...bytes]
	)
	expect(Math.abs(measured.audioSeconds - (duration - 1.2 + 0.3))).toBeLessThan(0.25)
	const [a, b, pause, c, d] = measured.probes
	for (const original of [a, d]) {
		expect(original?.low, `440 Hz at ${original?.at}s`).toBeGreaterThan(0.05)
		expect(original?.high, `no 880 Hz at ${original?.at}s`).toBeLessThan(0.01)
	}
	for (const take of [b, c]) {
		expect(take?.high, `880 Hz at ${take?.at}s`).toBeGreaterThan(0.05)
		expect(take?.low, `no 440 Hz at ${take?.at}s`).toBeLessThan(0.01)
	}
	expect(Math.max(pause?.low ?? 1, pause?.high ?? 1), 'quiet between takes').toBeLessThan(0.01)

	// Undo takes back the last take (C); B's stays, one more Undo away.
	await page.getByRole('button', { name: 'Undo last change' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
	await expect(page.getByRole('button', { name: 'Undo last change' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Redo' })).toBeVisible()
})

/** Exports the edit and returns the exported file's length in seconds (its audio track). */
async function exportedSeconds(page: Page): Promise<number> {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	return page.evaluate(
		async (bytes) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await blob.arrayBuffer()
			)
			return audio.duration
		},
		[...bytes]
	)
}

test('undo steps back through several edits, a re-record among them, and redo replays them all', async ({
	page
}) => {
	test.setTimeout(300_000)
	// A, B (2 s, re-recorded with a 0.8 s take) and D, with pauses between.
	await mockActions(page, {
		words: [w('Alpha.', 0, 1), w('Bravo', 1.6, 2.6), w('words.', 2.6, 3.6), w('Delta.', 4.2, 5.2)]
	})
	const duration = await openEditorWithVideo(
		page,
		[
			[1, true],
			[0.6, false],
			[2, true],
			[0.6, false],
			[1, true]
		],
		ROOM_TONE
	)
	const reRecordB = page.getByRole('button', { name: 'Re-record the sentence at 0:01' })
	await expect(reRecordB).toBeVisible({ timeout: 30_000 })
	const clips = page.getByRole('region', { name: 'Clips' }).getByRole('option')
	const trimEnd = page.getByRole('slider', { name: 'Trim end' })
	const undoButton = page.getByRole('button', { name: 'Undo last change' })
	const redoButton = page.getByRole('button', { name: 'Redo' })
	// Exact, where the clips' m:ss labels would round: the trim, every
	// clip's label in order, and how many sentences are re-recorded.
	const timeline = async () => ({
		trimEnd: await trimEnd.getAttribute('aria-valuenow'),
		clips: await clips.evaluateAll((options) => options.map((o) => o.getAttribute('aria-label'))),
		reRecorded: await page.getByText('re-recorded', { exact: true }).count()
	})

	// Each step: its timeline, and how long its export should be.
	const steps = [{ timeline: await timeline(), seconds: duration }]
	// 1. Re-record B: its 2 s become the take's 0.8 s.
	await reRecordB.click()
	await (await recordTake(page)).getByRole('button', { name: 'Use new take' }).click()
	await expect(page.getByText('re-recorded', { exact: true })).toHaveCount(1)
	steps.push({ timeline: await timeline(), seconds: duration - 1.2 })
	// 2. Trim a second off the end, from the keyboard.
	await trimEnd.press('Shift+ArrowLeft')
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// 3. Split at 0.8 s, inside A.
	await seekTo(page, 0.8)
	await page.getByRole('button', { name: 'Split at playhead' }).click()
	await expect(clips).toHaveCount(2)
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// 4. Move the first clip after the second.
	await clips.first().press('Alt+ArrowRight')
	await expect(clips.first()).toHaveAttribute('aria-label', /from 0:00–0:05 of/)
	steps.push({ timeline: await timeline(), seconds: duration - 2.2 })
	// Every step looks different on the timeline, so each restore is checked.
	expect(new Set(steps.map((s) => JSON.stringify(s.timeline))).size).toBe(steps.length)

	const expectStep = async (index: number) => {
		const step = steps[index]
		if (!step) throw new Error(`no step ${index}`)
		await expect.poll(timeline).toEqual(step.timeline)
		const seconds = await exportedSeconds(page)
		expect(
			Math.abs(seconds - step.seconds),
			`step ${index}: exported ${seconds.toFixed(2)} s, expected ${step.seconds.toFixed(2)} s`
		).toBeLessThan(0.25)
	}
	await expectStep(4)

	// Ctrl+Z in the command bar is the text field's own undo, not the editor's.
	const command = page.getByRole('textbox', { name: 'Edit command' })
	await command.fill('cut')
	await command.press('Control+z')
	await expect(redoButton).toHaveCount(0)
	await expect.poll(timeline).toEqual(steps[4]?.timeline)

	// Undo all four, by button and by Ctrl+Z.
	await undoButton.click()
	await expectStep(3)
	for (const index of [2, 1, 0]) {
		await page.keyboard.press('Control+z')
		await expectStep(index)
	}
	await expect(undoButton).toHaveCount(0)

	// Redo all four, by button, Ctrl+Shift+Z and Ctrl+Y. The re-recorded take
	// comes back from the redo branch: no new recording is made.
	await redoButton.click()
	await expectStep(1)
	await page.keyboard.press('Control+Shift+z')
	await expectStep(2)
	await page.keyboard.press('Control+y')
	await expectStep(3)
	await redoButton.click()
	await expectStep(4)
	await expect(redoButton).toHaveCount(0)

	// A new edit after an undo ends the redo branch.
	await undoButton.click()
	await expectStep(3)
	await clips.first().press('Alt+ArrowRight')
	await expect(redoButton).toHaveCount(0)
})
