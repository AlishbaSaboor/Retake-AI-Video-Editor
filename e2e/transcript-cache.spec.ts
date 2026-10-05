import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Route } from '@playwright/test'
import { recordTestVideo, w, openTool } from './editor-helpers'
import { toTranscript } from '../src/app/[locale]/editor/transcript'
import { reuseTranscript } from './transcript-cache'

// A real recording's transcript is paid for once and reused after: the first
// load here makes the "paid" call (stood in for by a canned transcript, so CI
// pays nothing), the second, of the same recording, is answered from the
// cache and makes none.

const SPOKEN = toTranscript([w('Paid', 0.2, 0.6), w('once.', 0.6, 1.0)])

/** Stands in for Deepgram: the real server reply, with this transcript inside. */
async function cannedCall(route: Route) {
	const body = route.request().postData() ?? ''
	const response = await route.fetch({
		postData: body.replace(/"audioBase64":"[^"]*"/, '"audioBase64":""')
	})
	const text = (await response.text()).replace(
		/\{"ok":false[^\n]*\}/,
		JSON.stringify({ ok: true, data: SPOKEN })
	)
	return { response, text }
}

test('a recording is transcribed once; opened again, its saved transcript is used for nothing', async ({
	page
}) => {
	const dir = mkdtempSync(join(tmpdir(), 'transcripts-'))
	await page.goto('/editor')
	const video = await recordTestVideo(page, [[2, true]])
	const open = async () => {
		await page
			.getByLabel('Choose a video file')
			.first()
			.setInputFiles({ name: 'same.webm', mimeType: 'video/webm', buffer: video })
		await openTool(page, 'Transcript')
		await expect(page.getByRole('button', { name: /Paid once\./ }).first()).toBeVisible({
			timeout: 30_000
		})
	}

	const first = await reuseTranscript(page, { dir, transcribe: cannedCall })
	await open()
	expect(first.paidCalls()).toBe(1)
	expect(readdirSync(dir)).toHaveLength(1)

	// The same recording again, in a fresh editor: no call, the same words.
	await page.unrouteAll()
	await page.goto('/editor')
	const second = await reuseTranscript(page, {
		dir,
		transcribe: () => Promise.reject(new Error('the cache should have answered'))
	})
	await open()
	expect(second.paidCalls()).toBe(0)
})
