import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { APIResponse, Page, Route } from '@playwright/test'
import type { Transcript } from '../src/app/[locale]/editor/audio/transcript'

// For tests and scripts run against a real recording: its transcript is paid
// for once (a real Deepgram call) and every later run is answered from that,
// for nothing. Kept by a hash of the audio sent, so the same recording always
// finds it and nothing else (a spoken command) ever does. Kept outside the
// repo (it's the recording's words): RETAKE_TRANSCRIPT_CACHE, else the
// system's temp folder.

export const TRANSCRIPT_CACHE_DIR =
	process.env.RETAKE_TRANSCRIPT_CACHE ?? join(tmpdir(), 'retake-transcripts')

/** An editor Server Action's own reply, with the result inside swapped for `data`. */
async function answerWith(route: Route, body: string, data: Transcript) {
	// The request reaches the real server with its audio emptied, which fails
	// validation before any paid call: the reply keeps this build's real format.
	const response = await route.fetch({
		postData: body.replace(/"audioBase64":"[^"]*"/, '"audioBase64":""')
	})
	await route.fulfill({
		response,
		body: (await response.text()).replace(
			/\{"ok":false[^\n]*\}/,
			JSON.stringify({ ok: true, data })
		)
	})
}

type Reply = { response: APIResponse; text: string }

/** The paid call, as the editor would make it. */
async function realCall(route: Route): Promise<Reply> {
	const response = await route.fetch()
	return { response, text: await response.text() }
}

/** The transcript inside a Server Action's reply, if it holds one. */
function transcriptIn(text: string): Transcript | null {
	const match = /\{"ok":true,"data":(\{"segments":.*?\})\}\s*$/m.exec(text)
	if (!match?.[1]) return null
	try {
		return JSON.parse(match[1]) as Transcript
	} catch {
		return null
	}
}

/**
 * Answers the editor's transcript requests from the cache. A recording not
 * seen before goes to `transcribe` (the real call, by default) once, and its
 * transcript is kept. Returns how many paid calls this page made.
 */
export async function reuseTranscript(
	page: Page,
	{
		dir = TRANSCRIPT_CACHE_DIR,
		transcribe = realCall
	}: { dir?: string; transcribe?: (route: Route) => Promise<Reply> } = {}
): Promise<{ paidCalls: () => number }> {
	mkdirSync(dir, { recursive: true })
	let paid = 0
	await page.route(
		(url) => url.pathname.endsWith('/editor'),
		async (route) => {
			const request = route.request()
			const body = request.postData() ?? ''
			const audio = /"audioBase64":"([^"]*)"/.exec(body)?.[1]
			if (!request.headers()['next-action'] || !audio) return route.fallback()
			const file = join(dir, `${createHash('sha256').update(audio).digest('hex')}.json`)
			if (existsSync(file)) {
				return answerWith(route, body, JSON.parse(readFileSync(file, 'utf8')) as Transcript)
			}
			paid++
			const { response, text } = await transcribe(route)
			const transcript = transcriptIn(text)
			// Only a transcript is kept: a spoken command's text, or an error, isn't.
			if (transcript) writeFileSync(file, JSON.stringify(transcript))
			await route.fulfill({ response, body: text })
		}
	)
	return { paidCalls: () => paid }
}
