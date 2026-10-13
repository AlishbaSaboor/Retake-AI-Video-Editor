import { test, expect, type Page } from '@playwright/test'
import { openEditorWithVideo, recordTestVideo, w } from './editor-helpers'
import { makeReply, mockMakeActions, submitMake } from './make-helpers'

// The editor fits the window: at a 1366 × 768 laptop and a 1920 × 1080
// screen, nothing that edits is below the fold. In the full editor the
// picture, the tools on it, the timeline's clip tools and its lanes are all
// on screen with no page scroll; in the chat-only view after Make it, the
// box to type the next request in, the mic and send are always in view.

const SCREENS = [
	{ width: 1366, height: 768 },
	{ width: 1920, height: 1080 }
] as const

const WORDS = [
	w('Hello.', 0.1, 0.9),
	w('This', 1.7, 2.1),
	w('is', 2.1, 2.4),
	w('the', 2.4, 2.7),
	w('key', 2.7, 3.1),
	w('point.', 3.1, 3.5),
	w('Bye.', 5.1, 5.9)
]

/** Whether the page itself scrolls (beyond a pixel of rounding). */
const pageScrolls = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1)

for (const screen of SCREENS) {
	test(`the full editor fits ${screen.width} × ${screen.height}: picture, tools and timeline in view`, async ({
		page
	}) => {
		await page.setViewportSize(screen)
		await openEditorWithVideo(page)
		const player = page.getByTestId('player')
		await expect(player).toBeInViewport({ ratio: 1 })
		// As large as the room allows: well past the old fixed size at either screen.
		const box = await player.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThan(200)
		await expect(
			page.getByRole('toolbar', { name: 'On the video' }).getByRole('button', { name: 'Crop' })
		).toBeInViewport({ ratio: 1 })
		const clips = page.getByRole('region', { name: 'Clips' })
		for (const tool of ['Split at playhead', 'Merge clips', 'Duplicate', 'Delete'])
			await expect(clips.getByRole('button', { name: tool })).toBeInViewport({ ratio: 1 })
		const timeline = page.getByRole('region', { name: 'Timeline' })
		await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeInViewport()
		for (const lane of ['Text', 'Audio'])
			await expect(timeline.getByRole('group', { name: lane })).toBeInViewport()
		expect(await pageScrolls(page)).toBe(false)
	})

	test(`after Make it, the chat's box, mic and send stay in view at ${screen.width} × ${screen.height}`, async ({
		page
	}) => {
		await page.setViewportSize(screen)
		// A long plan, so the chat's first message is tall.
		await mockMakeActions(page, WORDS, [
			makeReply({
				faces: [{ frame: 1, x: 500, y: 500 }],
				keyLines: [
					{ sentence: 2, text: 'This is the key point' },
					{ sentence: 1, text: 'Hello' }
				],
				zoomSentences: [2],
				transition: 'fade'
			})
		])
		await page.goto('/make')
		await page.getByLabel('Video to make into something').setInputFiles({
			name: 'talk.webm',
			mimeType: 'video/webm',
			buffer: await recordTestVideo(page)
		})
		await page.getByRole('textbox', { name: 'What should it become?' }).fill('make this a reel')
		await submitMake(page, 'make this a reel')
		await page
			.getByRole('status', { name: 'The plan' })
			.getByRole('button', { name: 'Apply' })
			.click()
		const chat = page.getByRole('region', { name: 'Chat' })
		await expect(chat).toBeVisible({ timeout: 60_000 })
		for (const control of [
			chat.getByRole('textbox', { name: 'Edit command' }),
			chat.getByRole('button', { name: 'Speak a command' }),
			chat.getByRole('button', { name: 'Run' })
		])
			await expect(control).toBeInViewport({ ratio: 1 })
		expect(await pageScrolls(page)).toBe(false)
	})
}

test("on a phone, the chat after Make it scrolls its messages and keeps its box at the panel's foot", async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await mockMakeActions(page, WORDS, [makeReply({ faces: [{ frame: 1, x: 500, y: 500 }] })])
	await page.goto('/make')
	await page.getByLabel('Video to make into something').setInputFiles({
		name: 'talk.webm',
		mimeType: 'video/webm',
		buffer: await recordTestVideo(page)
	})
	await page.getByRole('textbox', { name: 'What should it become?' }).fill('make this a reel')
	await submitMake(page, 'make this a reel')
	await page
		.getByRole('status', { name: 'The plan' })
		.getByRole('button', { name: 'Apply' })
		.click()
	const chat = page.getByRole('region', { name: 'Chat' })
	await expect(chat).toBeVisible({ timeout: 60_000 })
	// The chat panel is its own height on a phone: scrolled to, all of it is on screen.
	await chat.evaluate((element) => element.scrollIntoView({ block: 'end' }))
	for (const control of [
		chat.getByRole('textbox', { name: 'Edit command' }),
		chat.getByRole('button', { name: 'Speak a command' }),
		chat.getByRole('button', { name: 'Run' })
	])
		await expect(control).toBeInViewport({ ratio: 1 })
})
