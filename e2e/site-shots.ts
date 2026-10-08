import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Browser, type Page } from '@playwright/test'
import type { HighlightPick } from '../src/app/[locale]/editor/highlights'
import type { MakeReply } from '../src/app/[locale]/(app)/make/make-plan'
import { editCommand, mockActions, openTool, w, type TimedWord } from './editor-helpers'
import { exportVideo } from './export-frames'
import { makeReply, mockMakeActions } from './make-helpers'

// The site's pictures of the app, taken from the app itself, for the slots
// the design gives them: the story's and How it works' device frames and the
// Features pictures (1100 × 710, the app's desktop layout, at 2x), the day and
// night comparison (1440 × 930 at 2x), stills of the clip for the hero's
// window, and the before and after videos of the Make it section, exported
// through the app. The AI is the tests' fake (no paid call): its transcript,
// plans, highlights and reply are written for this clip. Run against a
// running production build (see package.json, `shots`), with SHOTS_CLIP
// pointing at the downloaded footage (CREDITS.md). Writes public/site/;
// working files go to test-results/site-shots/.

const CLIP = process.env.SHOTS_CLIP ?? ''
/** ffmpeg, for the clip's stills and videos (cut from the full-resolution download). */
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const OUT = 'public/site'
const WORK = 'test-results/site-shots'
const THEMES = ['dark', 'light'] as const
/** The device frames' screens: wide enough for the desktop layout (from 1024), the frames' shape. */
const SLOT = { width: 1100, height: 710 }
/** The day and night comparison: the full width of the design's 1440 page. */
const WIDE = { width: 1440, height: 930 }
const SCALE = 2
const WEBP_QUALITY = 0.8
/** The clip's length, as recorded: Pexels 35571635 runs 13.4 s. */
const CLIP_SECONDS = 13

/**
 * The voice-over the clip is taken to have. The footage has no sound, so
 * the words are written for it (a sunrise over a ridge), with an "um" and an
 * "uh" and a pause for Clean up and the plans to find.
 */
const WORDS: TimedWord[] = [
	w('We', 0.3, 0.45),
	w('left', 0.45, 0.75),
	w('before', 0.75, 1.1),
	w('it', 1.1, 1.2),
	w('was', 1.2, 1.4),
	w('light.', 1.4, 1.9),
	w('Um,', 2.3, 2.6),
	w('the', 2.8, 2.9),
	w('plan', 2.9, 3.15),
	w('was', 3.15, 3.3),
	w('to', 3.3, 3.4),
	w('reach', 3.4, 3.7),
	w('the', 3.7, 3.8),
	w('ridge', 3.8, 4.1),
	w('by', 4.1, 4.3),
	w('six.', 4.3, 4.9),
	w('And', 6.3, 6.5),
	w('then,', 6.5, 6.85),
	w('uh,', 7.05, 7.3),
	w('the', 7.5, 7.6),
	w('sun', 7.6, 7.85),
	w('came', 7.85, 8.05),
	w('up', 8.05, 8.2),
	w('over', 8.2, 8.45),
	w('the', 8.45, 8.55),
	w('hills.', 8.55, 9.0),
	w("That's", 9.3, 9.55),
	w('the', 9.55, 9.65),
	w('last', 9.65, 9.95),
	w('ridge', 9.95, 10.25),
	w('before', 10.25, 10.55),
	w('sunrise.', 10.55, 11.2)
]

/** The plan for each of the Make it section's four styles (sentences numbered from 1). */
const STYLES: Record<'reel' | 'funny' | 'professional' | 'ad', Partial<MakeReply>> = {
	reel: {
		style: 'reel',
		summary: 'The climb to the ridge, cut to a vertical reel that ends on the sunrise.',
		captions: 'bold_words',
		zoomSentences: [3],
		title: 'Golden hour'
	},
	funny: {
		style: 'funny',
		summary: 'A quick cut with big captions and zoom cuts on the best lines.',
		captions: 'large',
		transition: 'zoom_cut',
		zoomSentences: [2, 4]
	},
	professional: {
		style: 'professional',
		summary: 'A calm, wide cut with the filler words and the pause gone.',
		captions: 'classic',
		vertical: false,
		zoomSentences: []
	},
	ad: {
		style: 'ad',
		summary: 'A short vertical ad that opens on the plan and ends on the sunrise.',
		captions: 'highlight',
		zoomSentences: [4],
		title: 'The last ridge'
	}
}

const planFor = (style: keyof typeof STYLES) =>
	makeReply({
		format: 'instagram_reel',
		subject: 'other',
		pictureMatters: true,
		// The pause between the second and third sentences goes.
		removeSpans: [{ startSeconds: 5.0, endSeconds: 6.2 }],
		...STYLES[style]
	})

/** The highlights Find highlights shows for this clip (sentences numbered from 1). */
const HIGHLIGHTS: HighlightPick[] = [
	{
		firstSentence: 2,
		lastSentence: 2,
		title: 'Up before six',
		description: 'The plan in one line: a strong opener for a short.'
	},
	{
		firstSentence: 3,
		lastSentence: 3,
		title: 'The sun comes up',
		description: 'The moment the light breaks over the hills.'
	},
	{
		firstSentence: 4,
		lastSentence: 4,
		title: 'The last ridge',
		description: 'A clean ending, said simply.'
	}
]

/** The hero window's picture: 2x its 540 × 405, a 4:3 band of the upright clip. */
const HERO_PICTURE = { at: 1.5, width: 1080, height: 810 }
/** The hero timeline's clips: 640 × 360 (2x their widest, 265 × 40), at their moments. */
const THUMBS = [1.5, 5.5, 9.5]
/** Make it's "before": a 16:9 band of the clip, as its 1160 × 653 slot crops it. */
const BEFORE = { width: 1920, height: 1080, crf: 34 }
/** Make it's "after": 2x its 314 × 559 phone card. */
const AFTER_WIDTH = 720
/** Stills' WebP quality (ffmpeg's libwebp, 0–100). */
const STILL_QUALITY = 85

const shotPath = (name: string, theme: string) => join(WORK, `${name}-${theme}.png`)

test.describe.configure({ mode: 'serial' })
test.setTimeout(600_000)

test('the clip: a working copy with a stand-in sound track, and the pictures cut from the original', async () => {
	expect(CLIP, 'set SHOTS_CLIP to the downloaded footage (see CREDITS.md)').not.toBe('')
	await mkdir(WORK, { recursive: true })
	await mkdir(join(OUT, 'clip'), { recursive: true })
	// The app's copy: the footage at 1080 × 1920, 30 fps, with the stand-in voice.
	await writeFile(join(WORK, 'voice.wav'), standInVoice())
	ffmpeg([
		'-i',
		CLIP,
		'-i',
		join(WORK, 'voice.wav'),
		'-t',
		String(CLIP_SECONDS),
		'-vf',
		'scale=1080:1920,fps=30',
		'-c:v',
		'libvpx-vp9',
		'-crf',
		'28',
		'-b:v',
		'0',
		'-row-mt',
		'1',
		'-deadline',
		'good',
		'-cpu-used',
		'4',
		'-c:a',
		'libopus',
		'-b:a',
		'96k',
		'-shortest',
		join(WORK, 'clip.webm')
	])
	// Make it's "before": the original's middle band, 16:9, sharp, silent.
	const band = 'crop=iw:iw*9/16'
	ffmpeg([
		'-i',
		CLIP,
		'-t',
		String(CLIP_SECONDS),
		'-an',
		'-vf',
		`${band},scale=${BEFORE.width}:${BEFORE.height},fps=30`,
		'-c:v',
		'libvpx-vp9',
		'-crf',
		String(BEFORE.crf),
		'-b:v',
		'0',
		'-row-mt',
		'1',
		'-deadline',
		'good',
		'-cpu-used',
		'2',
		join(OUT, 'clip', 'before.webm')
	])
	frame(CLIP, 0.5, `${band},scale=2160:-2`, join(OUT, 'clip', 'before-poster.webp'))
	frame(
		CLIP,
		HERO_PICTURE.at,
		`crop=iw:iw*3/4,scale=${HERO_PICTURE.width}:${HERO_PICTURE.height}`,
		join(OUT, 'clip', 'hero-picture.webp')
	)
	for (const [index, seconds] of THUMBS.entries()) {
		frame(CLIP, seconds, `${band},scale=640:360`, join(OUT, 'clip', `thumb-${index + 1}.webp`))
	}
})

for (const theme of THEMES) {
	test(`Make it, ${theme}: the upload screen, the request, the plan, and the chat-only view`, async ({
		browser
	}) => {
		const page = await themedPage(browser, theme)
		await mockMakeActions(page, WORDS, [planFor('reel')])
		await page.goto('/home')
		await settle(page)
		await page.screenshot({ path: shotPath('upload', theme) })

		await page.goto('/make')
		await page.getByLabel('Video to make into something').setInputFiles(join(WORK, 'clip.webm'))
		await page
			.getByRole('textbox', { name: 'What should it become?' })
			.fill('Make this an Instagram reel')
		await expect(page.getByText(/\d+p ·/)).toBeVisible({ timeout: 30_000 })
		await settle(page)
		await page.screenshot({ path: shotPath('say', theme) })

		await page.getByRole('button', { name: 'Make it', exact: true }).click()
		const plan = page.getByRole('status', { name: 'The plan' })
		await expect(plan).toBeVisible({ timeout: 120_000 })
		await settle(page)
		await page.screenshot({ path: shotPath('plan', theme) })

		await plan.getByRole('button', { name: 'Apply' }).click()
		await expect(page.getByRole('group', { name: 'Editor mode' })).toBeVisible({
			timeout: 60_000
		})
		await showFrame(page, 3.0)
		await page.screenshot({ path: shotPath('studio', theme) })
		await page.context().close()
	})

	test(`the editor, ${theme}: clean up, captions, the full editor, highlights`, async ({
		browser
	}) => {
		const page = await themedPage(browser, theme)
		await mockActions(page, {
			words: WORDS,
			highlights: HIGHLIGHTS,
			command: editCommand({ action: 'captions_on' })
		})
		await page.goto('/home')
		await page.getByLabel('Video to edit by hand').setInputFiles(join(WORK, 'clip.webm'))
		await expect(page.getByRole('slider', { name: 'Playhead position' })).toBeVisible({
			timeout: 60_000
		})
		await expect(page.getByLabel('Timeline').getByText('2 filler words')).toBeVisible({
			timeout: 60_000
		})

		await openTool(page, 'Clean up')
		await showFrame(page, 2.4)
		await page.screenshot({ path: shotPath('tidy', theme) })

		await page.getByRole('tab', { name: 'Captions' }).click()
		await page
			.getByRole('region', { name: 'Captions' })
			.getByRole('button', { name: 'Captions' })
			.click()
		await showFrame(page, 3.9)
		await page.screenshot({ path: shotPath('yours', theme) })

		await openTool(page, 'Transcript')
		await showFrame(page, 7.8)
		await page.screenshot({ path: shotPath('manual', theme) })

		await openTool(page, 'Assistant')
		await page.getByRole('textbox', { name: 'Edit command' }).fill('Turn captions on')
		await page.getByRole('button', { name: 'Run' }).click()
		await expect(
			page
				.getByRole('status')
				.filter({ hasText: 'You asked' })
				.getByRole('button', { name: 'Apply' })
		).toBeVisible({ timeout: 60_000 })
		await showFrame(page, 8.3)
		await page.screenshot({ path: shotPath('assistant', theme) })
		await page.setViewportSize(WIDE)
		await showFrame(page, 8.3)
		await page.screenshot({ path: shotPath('daynight', theme) })
		await page.setViewportSize(SLOT)

		await openTool(page, 'Find highlights')
		await page.getByRole('button', { name: 'Find highlights', exact: true }).click()
		const dialog = page.getByRole('dialog', { name: 'Highlights' })
		await expect(dialog.getByRole('listitem')).toHaveCount(HIGHLIGHTS.length, { timeout: 60_000 })
		await settle(page, 2500)
		await page.screenshot({ path: shotPath('share', theme) })
		await page.context().close()
	})
}

test('Make it, each style applied and exported through the app: the "after" videos', async ({
	browser
}) => {
	for (const style of Object.keys(STYLES) as (keyof typeof STYLES)[]) {
		const page = await themedPage(browser, 'dark', 1)
		await mockMakeActions(page, WORDS, [planFor(style)])
		await page.goto('/make')
		await page.getByLabel('Video to make into something').setInputFiles(join(WORK, 'clip.webm'))
		await page.getByRole('textbox', { name: 'What should it become?' }).fill(`make it ${style}`)
		await page.getByRole('button', { name: 'Make it', exact: true }).click()
		const plan = page.getByRole('status', { name: 'The plan' })
		await expect(plan).toBeVisible({ timeout: 120_000 })
		await plan.getByRole('button', { name: 'Apply' }).click()
		await expect(page.getByRole('group', { name: 'Editor mode' })).toBeVisible({
			timeout: 60_000
		})
		const exported = await exportVideo(page)
		const raw = join(WORK, `after-${style}.webm`)
		await writeFile(raw, exported)
		ffmpeg([
			'-i',
			raw,
			'-an',
			'-vf',
			`scale=${AFTER_WIDTH}:-2,fps=30`,
			'-c:v',
			'libvpx-vp9',
			'-crf',
			'32',
			'-b:v',
			'0',
			'-row-mt',
			'1',
			'-deadline',
			'good',
			'-cpu-used',
			'2',
			join(OUT, 'clip', `after-${style}.webm`)
		])
		frame(raw, 1, `scale=${AFTER_WIDTH}:-2`, join(OUT, 'clip', `after-${style}-poster.webp`))
		await page.context().close()
	}
})

test('the screenshots, as small WebP files', async ({ browser }) => {
	await mkdir(join(OUT, 'shots'), { recursive: true })
	const page = await browser.newPage()
	for (const name of SHOTS) {
		for (const theme of THEMES) {
			const png = await readFile(shotPath(name, theme))
			await writeFile(join(OUT, 'shots', `${name}-${theme}.webp`), await toWebp(page, png))
		}
	}
	await page.close()
})

/** Every screenshot taken, each in both themes. */
const SHOTS = [
	'upload',
	'say',
	'plan',
	'studio',
	'tidy',
	'yours',
	'manual',
	'assistant',
	'share',
	'daynight'
] as const

/** A signed-in page in one theme, the size of the design's slots, at 2x unless told otherwise. */
async function themedPage(browser: Browser, theme: string, scale = SCALE): Promise<Page> {
	const context = await browser.newContext({
		viewport: SLOT,
		deviceScaleFactor: scale,
		reducedMotion: 'reduce',
		storageState: 'e2e/.auth/user.json'
	})
	await context.addInitScript((value) => {
		try {
			localStorage.setItem('retake-theme', value)
		} catch {
			// Nothing to remember it in: the default theme.
		}
	}, theme)
	return context.newPage()
}

/** Lets fonts, pictures and transitions settle before a picture is taken. */
async function settle(page: Page, ms = 1200) {
	await page.evaluate(() => document.fonts.ready)
	await page.waitForTimeout(ms)
}

/** Shows the moment at `seconds` in the preview (paused), then settles. */
async function showFrame(page: Page, seconds: number) {
	await page.evaluate((at) => {
		for (const video of document.querySelectorAll('video')) {
			video.pause()
			if (video.duration > at) video.currentTime = at
		}
	}, seconds)
	await settle(page, 1500)
}

/** A PNG screenshot as a WebP of the same size, encoded by the browser. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
	const webp = await page.evaluate(
		async ({ base64, quality }) => {
			const image = new Image()
			image.src = `data:image/png;base64,${base64}`
			await image.decode()
			const canvas = Object.assign(document.createElement('canvas'), {
				width: image.naturalWidth,
				height: image.naturalHeight
			})
			canvas.getContext('2d')?.drawImage(image, 0, 0)
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/webp', quality)
			)
			const bytes = new Uint8Array(await (blob as Blob).arrayBuffer())
			let text = ''
			for (let i = 0; i < bytes.length; i += 0x8000)
				text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
			return btoa(text)
		},
		{ base64: png.toString('base64'), quality: WEBP_QUALITY }
	)
	return Buffer.from(webp, 'base64')
}

/** Runs ffmpeg, quietly, and fails loudly. */
function ffmpeg(args: string[]) {
	const result = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' })
	if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr || result.error}`)
}

/** One frame of `path` at `seconds`, through `filter`, as a WebP. */
function frame(path: string, seconds: number, filter: string, out: string) {
	ffmpeg([
		'-ss',
		String(seconds),
		'-i',
		path,
		'-frames:v',
		'1',
		'-vf',
		filter,
		'-c:v',
		'libwebp',
		'-quality',
		String(STILL_QUALITY),
		out
	])
}

/**
 * A stand-in sound track for the silent footage, as a 48 kHz mono WAV: noise
 * shaped like syllables where WORDS are, near silence between them, so the
 * editor's pauses and filler gaps fall where the words say.
 */
function standInVoice(): Buffer {
	const rate = 48_000
	const count = Math.ceil(CLIP_SECONDS * rate)
	const data = Buffer.alloc(count * 2)
	for (let i = 0; i < count; i++) {
		const t = i / rate
		const word = WORDS.find((each) => t >= each.start && t < each.end)
		const level = word ? 0.35 * (0.55 + 0.45 * Math.sin(Math.PI * 10 * (t - word.start))) : 0.004
		data.writeInt16LE(Math.round((Math.random() * 2 - 1) * level * 32767), i * 2)
	}
	const header = Buffer.alloc(44)
	header.write('RIFF', 0)
	header.writeUInt32LE(36 + data.length, 4)
	header.write('WAVEfmt ', 8)
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(1, 20)
	header.writeUInt16LE(1, 22)
	header.writeUInt32LE(rate, 24)
	header.writeUInt32LE(rate * 2, 28)
	header.writeUInt16LE(2, 32)
	header.writeUInt16LE(16, 34)
	header.write('data', 36)
	header.writeUInt32LE(data.length, 40)
	return Buffer.concat([header, data])
}
