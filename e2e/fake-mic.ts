import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'

// The fake microphone the re-record specs record with. Launch options can
// only be set at a spec file's top level, so each such spec spreads
// FAKE_MIC_LAUNCH into its own test.use().

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

/** Chromium flags that make the fake microphone the only one, already permitted. */
export const FAKE_MIC_LAUNCH = {
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
		`--use-file-for-fake-audio-capture=${fakeMicWav()}`
	]
}

/**
 * Records a take for the open re-record panel: about 2 s, so one 0.8 s tone,
 * watching the meter. The take keeps the original's pauses around that tone
 * (1.0 s here), or with joins set by ear is the tone alone.
 */
export async function recordTake(page: Page, takeSeconds = '1.0') {
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
	await expect(panel.getByText(`New take: ${takeSeconds} s (`)).toBeVisible({ timeout: 10_000 })
	return panel
}
