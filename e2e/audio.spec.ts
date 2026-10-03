import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { editCommand, mockActions, openEditorWithVideo, seekTo } from './editor-helpers'

// A 4 s take of one steady 440 Hz tone at amplitude 0.5 (RMS 0.354), split
// at 2 s into two clips. Levels are read from the exported file's audio:
// RMS over 50 ms windows, as a share of the tone's own.

// One test at a time: each records and exports in real time.
test.describe.configure({ mode: 'default' })

const TONE_RMS = 0.5 / Math.SQRT2
const clipRow = (page: Page, n: number) =>
	page
		.getByRole('region', { name: 'Clip sound and speed' })
		.getByRole('group', { name: `Clip ${n}` })

async function openTwoClips(page: Page) {
	await mockActions(page, { words: [] })
	const duration = await openEditorWithVideo(page, [[4, true]])
	await seekTo(page, 2)
	await page
		.getByRole('region', { name: 'Clips' })
		.getByRole('button', { name: 'Split at playhead' })
		.click()
	await expect(clipRow(page, 2)).toBeVisible()
	return duration
}

/** Sets a clip's volume with its slider: one change, on release. */
async function setVolume(page: Page, n: number, percent: number) {
	const slider = clipRow(page, n).getByRole('slider')
	await slider.fill(String(percent))
	await slider.blur()
	await expect(clipRow(page, n)).toContainText(`Volume ${percent}%`)
}

async function setFade(
	page: Page,
	n: number,
	field: 'Fade in (s)' | 'Fade out (s)',
	seconds: number
) {
	const input = clipRow(page, n).getByLabel(field)
	await input.fill(String(seconds))
	await input.press('Enter')
}

/** Exports and returns the exported audio's level (as a share of the tone's) at each time. */
async function exportedLevels(page: Page, times: number[]) {
	const downloading = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Export video' }).click()
	const bytes = await readFile(await (await downloading).path())
	await expect(page.getByRole('button', { name: 'Export video' })).toBeVisible()
	const levels = await page.evaluate(
		async ({ bytes, times }) => {
			const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
				await new Blob([new Uint8Array(bytes)], { type: 'video/webm' }).arrayBuffer()
			)
			const samples = audio.getChannelData(0)
			return times.map((at) => {
				const from = Math.max(0, Math.floor((at - 0.025) * audio.sampleRate))
				const to = Math.min(samples.length, Math.floor((at + 0.025) * audio.sampleRate))
				let sum = 0
				for (let i = from; i < to; i++) sum += (samples[i] ?? 0) ** 2
				return Math.sqrt(sum / Math.max(1, to - from))
			})
		},
		{ bytes: [...bytes], times }
	)
	return levels.map((rms) => rms / TONE_RMS)
}

test('a clip at 50% is 6 dB down, a muted one silent, one at 200% 6 dB up, in the export', async ({
	page
}) => {
	test.setTimeout(150_000)
	await openTwoClips(page)
	await setVolume(page, 1, 50)
	await clipRow(page, 2).getByRole('button', { name: 'Mute' }).click()
	const [half, muted] = await exportedLevels(page, [1, 3])
	expect(Math.abs((half ?? 0) - 0.5), `clip 1 at ${half?.toFixed(3)} of the tone`).toBeLessThan(
		0.06
	)
	expect(muted, 'clip 2 muted').toBeLessThan(0.02)

	await clipRow(page, 2).getByRole('button', { name: 'Mute' }).click()
	await setVolume(page, 2, 200)
	const [, double] = await exportedLevels(page, [1, 3])
	expect(Math.abs((double ?? 0) - 2), `clip 2 at ${double?.toFixed(3)} of the tone`).toBeLessThan(
		0.15
	)

	// Each change was one undo step; reset takes them all off.
	const undo = page.getByRole('button', { name: 'Undo last change' })
	await undo.click()
	await expect(clipRow(page, 2)).toContainText('Volume 100%')
	await undo.click()
	await expect(clipRow(page, 2).getByRole('button', { name: 'Mute' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await page.getByRole('button', { name: 'Redo' }).click()
	await page.getByRole('button', { name: 'Reset to original' }).click()
	await page.getByRole('button', { name: 'Reset', exact: true }).click()
	await expect(clipRow(page, 1)).toContainText('Volume 100%')
	await expect(clipRow(page, 2)).toHaveCount(0)
})

test('fades rise and fall in straight lines over their length, in the export and the preview', async ({
	page
}) => {
	test.setTimeout(150_000)
	// The preview's clip level: every target the editor sets on it, logged.
	await page.addInitScript(() => {
		const targets: number[] = []
		const set = AudioParam.prototype.setTargetAtTime
		AudioParam.prototype.setTargetAtTime = function (value, at, constant) {
			targets.push(value)
			document.documentElement.dataset.levelTargets = JSON.stringify(targets.slice(-400))
			return set.call(this, value, at, constant)
		}
	})
	const duration = await openTwoClips(page)
	await setFade(page, 1, 'Fade in (s)', 1)
	await setFade(page, 2, 'Fade out (s)', 1)
	const times = [0.25, 0.5, 0.75, 1.5, duration - 0.75, duration - 0.5, duration - 0.25]
	const levels = await exportedLevels(page, times)
	const expected = [0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]
	console.log('FADE LEVELS', JSON.stringify(levels.map((l) => +l.toFixed(3))))
	for (const [index, level] of levels.entries()) {
		const want = expected[index] ?? 0
		expect(
			Math.abs(level - want),
			`at ${times[index]?.toFixed(2)} s: ${level.toFixed(3)} for ${want}`
		).toBeLessThan(0.1)
	}

	// The preview: played through the fade in, its level rises through the
	// same values (logged targets, 0 to 1).
	// Not 0: the very left of the timeline is the trim handle, which a click doesn't seek.
	await seekTo(page, 0.05)
	await page.evaluate(() => (document.documentElement.dataset.levelTargets = '[]'))
	await page.locator('video').evaluate(async (v: HTMLVideoElement) => {
		v.muted = false
		await v.play()
		await new Promise((resolve) => setTimeout(resolve, 1300))
		v.pause()
	})
	const targets: number[] = JSON.parse(
		(await page.evaluate(() => document.documentElement.dataset.levelTargets)) ?? '[]'
	)
	expect(targets.length, 'the preview set its level each frame').toBeGreaterThan(20)
	expect(Math.min(...targets.slice(0, 3)), 'starting near silence').toBeLessThan(0.15)
	expect(
		targets.some((t) => t > 0.4 && t < 0.6),
		'passing half way'
	).toBe(true)
	expect(Math.max(...targets), 'reaching full').toBeGreaterThan(0.95)
})

test('mute, fade and louder work as typed commands, each confirmed first and one undo step', async ({
	page
}) => {
	const command = page.getByRole('textbox', { name: 'Edit command' })
	const reply = page.getByRole('status').filter({ hasText: 'You asked' })
	await openTwoClips(page)
	const run = async (text: string, fields: Parameters<typeof editCommand>[0], shown: string) => {
		await mockActions(page, { words: [], command: editCommand(fields) })
		await command.fill(text)
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(reply).toContainText(shown)
		await reply.getByRole('button', { name: 'Apply' }).click()
		await expect(reply).toHaveCount(0)
	}
	await run('mute clip 2', { action: 'mute', fromClip: 2 }, "I'll mute clip 2.")
	await expect(clipRow(page, 2).getByRole('button', { name: 'Mute' })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await run(
		'fade out the last 2 seconds',
		{ action: 'fade_out', seconds: 2 },
		"I'll fade clip 2 out over its last 2 s."
	)
	await expect(clipRow(page, 2).getByLabel('Fade out (s)')).toHaveValue('2')
	await run(
		'make it louder',
		{ action: 'louder' },
		"I'll make the whole video louder (×1.5, up to 200%)."
	)
	await expect(clipRow(page, 1)).toContainText('Volume 150%')
	await expect(clipRow(page, 2)).toContainText('Volume 150%')
	const undo = page.getByRole('button', { name: 'Undo last change' })
	for (let i = 0; i < 3; i++) await undo.click()
	await expect(clipRow(page, 2).getByRole('button', { name: 'Mute' })).toHaveAttribute(
		'aria-pressed',
		'false'
	)
	await expect(clipRow(page, 1)).toContainText('Volume 100%')
})
