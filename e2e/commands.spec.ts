import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import type { EditCommand } from '../src/app/[locale]/editor/edit-command'
import {
	editCommand,
	mockActions,
	openThreeSentences,
	playheadSeconds,
	recordTestVideo,
	seekTo,
	w
} from './editor-helpers'

// Every editor action as a typed command. The parse is mocked (the shapes
// were checked against real Gemini separately); what's tested here is that
// each command shows its plan or its reason, and Apply does exactly what the
// editor's own button does.

const reply = (page: Page) => page.getByRole('status').filter({ hasText: 'You asked' })

/** Types `text`, answered as `fields`; returns the reply once it's shown. */
async function ask(
	page: Page,
	text: string,
	fields: Partial<EditCommand> & Pick<EditCommand, 'action'>
) {
	await mockActions(page, { words: [], command: editCommand(fields) })
	await page.getByRole('textbox', { name: 'Edit command' }).fill(text)
	await page.getByRole('button', { name: 'Run' }).click()
	await expect(reply(page)).toBeVisible()
	return reply(page)
}

/** Asks, checks the plan, and applies it. */
async function apply(
	page: Page,
	text: string,
	fields: Partial<EditCommand> & Pick<EditCommand, 'action'>,
	plan: string
) {
	const answer = await ask(page, text, fields)
	await expect(answer).toContainText(plan)
	await answer.getByRole('button', { name: 'Apply' }).click()
	await expect(reply(page)).toHaveCount(0)
}

/** Asks, and checks it's refused with `reason` and no Apply. */
async function refused(
	page: Page,
	text: string,
	fields: Partial<EditCommand> & Pick<EditCommand, 'action'>,
	reason: string
) {
	const answer = await ask(page, text, fields)
	await expect(answer).toContainText(reason)
	await expect(answer.getByRole('button', { name: 'Apply' })).toHaveCount(0)
	await answer.getByRole('button', { name: 'OK' }).click()
}

test('clean-up, undo, redo, reset, speed, export and re-record work as commands, each confirmed first', async ({
	page
}) => {
	test.setTimeout(120_000)
	// The clean-up test's take: "um" (1.15–1.45 s) has a clear gap either side.
	await mockActions(page, {
		words: [
			w('Hello,', 0, 1.0),
			w('um,', 1.15, 1.45),
			w('world.', 1.6, 3.0),
			w('So', 3.0, 3.4),
			w('uh', 3.4, 3.7),
			w('done.', 3.7, 4.5)
		]
	})
	await page.goto('/editor')
	const video = await recordTestVideo(page, [
		[1, true],
		[0.15, false],
		[0.3, true],
		[0.15, false],
		[2.9, true]
	])
	await page
		.getByLabel('Choose a video file')
		.setInputFiles({ name: 'take.webm', mimeType: 'video/webm', buffer: video })
	await expect(page.getByText('2 filler words', { exact: true })).toBeVisible({ timeout: 30_000 })
	const umIsCut = async () => {
		await seekTo(page, 1.3)
		return (await playheadSeconds(page)) > 1.4
	}
	const undoButton = page.getByRole('button', { name: 'Undo last change' })

	// Nothing to undo yet; Cancel leaves the edit alone.
	await refused(page, 'undo', { action: 'undo' }, "There's nothing to undo.")
	const cancelled = await ask(page, 'clean up the recording', { action: 'cleanup' })
	await expect(cancelled).toContainText(
		"I'll remove about 1 second of long silences and filler words."
	)
	await cancelled.getByRole('button', { name: 'Cancel' }).click()
	expect(await umIsCut()).toBe(false)

	// Clean-up, then undo, redo and reset by command: each one step.
	await apply(page, 'clean up the recording', { action: 'cleanup' }, "I'll remove about 1 second")
	await expect.poll(umIsCut).toBe(true)
	await apply(page, 'undo that', { action: 'undo' }, "I'll undo the last change.")
	await expect.poll(umIsCut).toBe(false)
	await expect(undoButton).toHaveCount(0)
	await apply(page, 'redo', { action: 'redo' }, "I'll redo the change you undid.")
	await expect.poll(umIsCut).toBe(true)
	await refused(page, 'redo', { action: 'redo' }, "There's nothing to redo.")
	await refused(page, 'clean up', { action: 'cleanup' }, "There's nothing clean-up can remove")
	await apply(page, 'start over', { action: 'reset' }, "I'll reset to the original take")
	await expect.poll(umIsCut).toBe(false)
	await refused(page, 'reset', { action: 'reset' }, 'The edit is already the original take.')
	// The reset is one step: undoing it brings the clean-up back.
	await undoButton.click()
	await expect.poll(umIsCut).toBe(true)

	// Speed: only the preview speeds there are.
	await apply(page, 'play at 2x', { action: 'speed', rate: 2 }, "I'll preview at 2×.")
	await expect(page.getByRole('button', { name: '2×', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	)
	await refused(page, 'play at 3x', { action: 'speed', rate: 3 }, 'The preview plays at 0.5×')

	// Re-record: the first sentence starts the take, so there's no pause to
	// join in. The command still opens it: its join can be set by ear there.
	await apply(
		page,
		're-record the sentence at 0:00',
		{ action: 'rerecord', startSeconds: 0 },
		"I'll open the re-record panel for “Hello, um, world.” at 0:00."
	)
	const noPause = page.getByRole('region', { name: 'Re-record the sentence at 0:00' })
	await expect(noPause).toContainText('There is no clear pause before this sentence')
	await expect(noPause.getByRole('button', { name: 'Set the join by ear' })).toBeVisible()
	await expect(noPause.getByRole('button', { name: 'Record' })).toBeDisabled()
	await noPause.getByRole('button', { name: 'Cancel' }).click()
	await refused(
		page,
		're-record the sentence at 0:30',
		{ action: 'rerecord', startSeconds: 30 },
		"I can't find a sentence at that time"
	)

	// Export: confirmed, then the same export the button starts, at 1× whatever the preview speed.
	const downloading = page.waitForEvent('download')
	await apply(
		page,
		'export the video',
		{ action: 'export' },
		"I'll export the edit as a video file."
	)
	const bytes = await readFile(await (await downloading).path())
	const seconds = await page.evaluate(
		async (bytes) => {
			const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
			return (await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(await blob.arrayBuffer()))
				.duration
		},
		[...bytes]
	)
	// The take less the cut "um" (~0.3 s, from gap to gap).
	expect(seconds).toBeGreaterThan(3.9)
	expect(seconds).toBeLessThan(4.4)

	// What it can't do, it says, and lists what it can.
	const unsupported = await ask(page, 'make the colours warmer', { action: 'unsupported' })
	await expect(unsupported).toContainText("I can't do that yet.")
	for (const ability of [
		'Split a clip',
		'Reorder clips',
		'Undo, redo',
		'Export the edit',
		'Cover, blur or pixelate part of the picture',
		'Rotate, flip or crop the video'
	]) {
		await expect(unsupported).toContainText(ability)
	}
	await expect(unsupported).toContainText('Compare the edit with the original')
	await expect(unsupported).toContainText('Draw boxes, blurs, pixelates and text on the video')
	await expect(unsupported).toContainText('Drag a crop box or a rotation handle on the video')
})

test('split, move and merge work as commands, each one undo step; re-record opens its panel', async ({
	page
}) => {
	test.setTimeout(120_000)
	await openThreeSentences(page)
	const clips = page.getByRole('region', { name: 'Clips' }).getByRole('option')
	const undoButton = page.getByRole('button', { name: 'Undo last change' })

	// Re-record opens the panel for the sentence, ready to record.
	await apply(
		page,
		're-record the sentence at 0:01',
		{ action: 'rerecord', startSeconds: 1 },
		"I'll open the re-record panel for “Bravo words.” at 0:01."
	)
	const panel = page.getByRole('region', { name: 'Re-record the sentence at 0:01' })
	await expect(panel.getByRole('button', { name: 'Record' })).toBeEnabled()
	await panel.getByRole('button', { name: 'Cancel' }).click()

	await refused(
		page,
		'split at 0.05 seconds',
		{ action: 'split', startSeconds: 0.05 },
		"I can't split there"
	)
	await apply(
		page,
		'split at 1.3 seconds',
		{ action: 'split', startSeconds: 1.3 },
		"I'll split the clip at 0:01."
	)
	await expect(clips).toHaveCount(2)
	await apply(
		page,
		'split at 3.9 seconds',
		{ action: 'split', startSeconds: 3.9 },
		"I'll split the clip at 0:03."
	)
	await expect(clips).toHaveCount(3)
	await apply(
		page,
		'move clip 3 to the start',
		{ action: 'move', fromClip: 3, toClip: 1 },
		"I'll move clip 3 to position 1."
	)
	await expect(clips.first()).toHaveAttribute('aria-label', /from 0:03–0:05 of/)
	await refused(
		page,
		'move clip 1 to the start',
		{ action: 'move', fromClip: 1, toClip: 1 },
		'That clip is already there.'
	)
	await refused(
		page,
		'merge clips 1 and 5',
		{ action: 'merge', fromClip: 1, toClip: 5 },
		"There's no clip with that number."
	)
	// Clips 2 and 3 are 0–1.3 and 1.3–3.9 again, side by side: merged, they're one range.
	await apply(
		page,
		'merge clips 2 and 3',
		{ action: 'merge', fromClip: 2, toClip: 3 },
		"I'll merge clips 2 to 3 into one."
	)
	await expect(clips).toHaveCount(2)
	await expect(clips.nth(1)).toHaveAttribute('aria-label', /from 0:00–0:03 of/)

	// Four edits, four undo steps, back to the one clip it started as.
	for (const count of [3, 3, 2, 1]) {
		await undoButton.click()
		await expect(clips).toHaveCount(count)
	}
	await expect(undoButton).toHaveCount(0)
})
