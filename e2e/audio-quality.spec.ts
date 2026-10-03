import { test, expect, type Page } from '@playwright/test'
import { mockActions, playheadSeconds } from './editor-helpers'

// A 36 s take recorded in the page, its sound a 200 Hz tone in syllable-like
// bursts (0.3 s on, 0.2 s off) with one problem at a known time each:
const SECTIONS = {
	clipped: { from: 6, to: 9 }, // driven 15.6 dB past full scale, hard-clipped
	quiet: { from: 12, to: 18 }, // 20 dB down
	noisy: { from: 21, to: 33 } // white noise 10 dB under the tone
}
const SECONDS = 36

/** Records the take: a plain picture, and the sound above through Opus, as a real upload would be. */
async function recordProblemTake(page: Page): Promise<Buffer> {
	const bytes = await page.evaluate(
		async ({ seconds, sections }) => {
			const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })
			const context = canvas.getContext('2d')
			if (!context) throw new Error('no 2d context')
			const stream = canvas.captureStream(30)
			const audio = new AudioContext()
			await audio.resume()
			const destination = audio.createMediaStreamDestination()
			const tone = audio.createOscillator()
			tone.frequency.value = 200
			const bursts = audio.createGain()
			// Clamps at full scale, as a recorder's converter does.
			const ceiling = audio.createWaveShaper()
			ceiling.curve = new Float32Array([-1, 1])
			tone.connect(bursts).connect(ceiling).connect(destination)
			const noise = audio.createBufferSource()
			const noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
			const channel = noiseBuffer.getChannelData(0)
			for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
			noise.buffer = noiseBuffer
			noise.loop = true
			const noiseLevel = audio.createGain()
			noiseLevel.gain.value = 0
			noise.connect(noiseLevel).connect(destination)

			const start = audio.currentTime + 0.2
			const inSection = (t: number, s: { from: number; to: number }) => t >= s.from && t < s.to
			for (let t = 0; t < seconds; t += 0.5) {
				const amplitude = inSection(t, sections.clipped)
					? 6
					: inSection(t, sections.quiet)
						? 0.05
						: 0.5
				bursts.gain.setValueAtTime(amplitude, start + t)
				bursts.gain.setValueAtTime(0, start + t + 0.3)
			}
			// Uniform noise in ±a has RMS a/√3; the tone's is 0.5/√2. Noise 10 dB under it:
			const noiseAmplitude = (0.5 / Math.SQRT2) * 10 ** (-10 / 20) * Math.sqrt(3)
			noiseLevel.gain.setValueAtTime(noiseAmplitude, start + sections.noisy.from)
			noiseLevel.gain.setValueAtTime(0, start + sections.noisy.to)
			for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)

			const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
			const chunks: Blob[] = []
			recorder.ondataavailable = (event) => chunks.push(event.data)
			const stopped = new Promise((resolve) => (recorder.onstop = resolve))
			const draw = setInterval(() => {
				context.fillStyle = '#112233'
				context.fillRect(0, 0, 320, 180)
			}, 1000 / 30)
			tone.start(start)
			noise.start(start)
			// Started on the audio clock's schedule, so section times are file times.
			await new Promise((resolve) => setTimeout(resolve, (start - audio.currentTime) * 1000))
			recorder.start(100)
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
			recorder.stop()
			await stopped
			clearInterval(draw)
			void audio.close()
			return [...new Uint8Array(await new Blob(chunks).arrayBuffer())]
		},
		{ seconds: SECONDS, sections: SECTIONS }
	)
	return Buffer.from(bytes)
}

/** The m:ss labels a flag can carry for a time, give or take `slack` seconds. */
const near = (seconds: number, slack: number) => {
	const labels = new Set<string>()
	for (let s = Math.floor(seconds - slack); s <= Math.floor(seconds + slack); s++) {
		labels.add(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
	}
	return `(${[...labels].join('|')})`
}

test('clipping, quiet speech and a loud background are flagged where they are, and nowhere else', async ({
	page
}) => {
	test.setTimeout(120_000)
	await mockActions(page, { words: [] })
	await page.goto('/editor')
	const take = await recordProblemTake(page)
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'problem-take.webm', mimeType: 'video/webm', buffer: take })
	await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
		timeout: 30_000
	})
	const timeline = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Timeline' }) })
	const flags = (prefix: string) =>
		timeline.getByRole('button', { name: new RegExp(`^${prefix} from`) })

	// Exactly one of each, each where its problem is (the noise is judged
	// over 10 s windows, so its edges get a second of slack).
	const { clipped, quiet, noisy } = SECTIONS
	await expect(flags('Clipping')).toHaveCount(1, { timeout: 30_000 })
	await expect(flags('Quiet speech')).toHaveCount(1)
	await expect(flags('Loud background')).toHaveCount(1)
	await expect(flags('Clipping')).toHaveAccessibleName(
		new RegExp(
			`^Clipping from ${near(clipped.from, 0.5)} to ${near(clipped.to, 0.5)}: the sound hit the maximum level`
		)
	)
	await expect(flags('Quiet speech')).toHaveAccessibleName(
		new RegExp(`^Quiet speech from ${near(quiet.from, 1)} to ${near(quiet.to, 1)}: much quieter`)
	)
	await expect(flags('Loud background')).toHaveAccessibleName(
		new RegExp(`^Loud background from ${near(noisy.from, 1.5)} to ${near(noisy.to, 1.5)}: `)
	)

	// Each kind is counted and said plainly, with no claim of a fix.
	await expect(timeline.getByText('1 clipped stretch', { exact: true })).toBeVisible()
	await expect(timeline.getByText('1 quiet stretch', { exact: true })).toBeVisible()
	await expect(timeline.getByText('1 noisy stretch', { exact: true })).toBeVisible()
	await expect(timeline).toContainText(
		'Clipping: the sound hit the maximum level the recording can hold'
	)
	await expect(timeline).toContainText(
		"These flags only point things out: nothing has been changed, and the editor can't fix them yet."
	)

	// A flag jumps the playhead to where its stretch starts.
	await flags('Quiet speech').click()
	const at = await playheadSeconds(page)
	expect(at).toBeGreaterThan(quiet.from - 1)
	expect(at).toBeLessThan(quiet.from + 1)

	// The (mocked) transcript settles before the page closes.
	await expect(page.getByText('No speech detected.')).toBeVisible({ timeout: 30_000 })

	// They're not edits: nothing to undo.
	await expect(page.getByRole('button', { name: 'Undo last change' })).toHaveCount(0)
})
