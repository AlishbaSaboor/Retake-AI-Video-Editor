import type { Page } from '@playwright/test'
import type { CheckReply, FollowUpReply, MakeReply } from '../src/app/[locale]/(app)/make/make-plan'
import { toTranscript } from '../src/app/[locale]/editor/transcript'
import type { TimedWord } from './editor-helpers'

// Make it's AI, answered with canned results: shared by the Make it tests
// and the script that takes the site's screenshots (site-shots.ts).

/** A Make it reply: a plain reel unless `fields` says otherwise. */
export const makeReply = (fields: Partial<MakeReply> = {}): MakeReply => ({
	questions: [],
	style: 'reel',
	format: 'instagram_reel',
	subject: 'one_person',
	summary: 'A short talk, cut into a vertical reel.',
	pictureMatters: false,
	moments: [],
	removeSentences: [],
	removeSpans: [],
	captions: 'bold_words',
	zoomSentences: [2],
	transition: 'none',
	keyLines: [],
	vertical: true,
	faces: [],
	card: 'corner',
	music: null,
	title: null,
	cannotDo: [],
	...fields
})

/** The second check's answer: nothing to fix, unless a test says otherwise. */
export const NOTHING_TO_FIX: CheckReply = {
	problems: [],
	title: null,
	keyLines: [],
	captions: 'classic',
	transition: 'none',
	dropSentences: [],
	tooShort: false
}

/**
 * Answers the transcript, plan, check and follow-up requests with canned results, on
 * the Make it page and in the editor. Each request still reaches the real
 * server, which decodes it as it would any other, with one field emptied so
 * validation stops it before any AI call (the audio; the request's text,
 * leaving the pictures whole); only the result inside the reply is
 * swapped. Returns what was asked.
 */
export async function mockMakeActions(
	page: Page,
	words: TimedWord[],
	replies: MakeReply[],
	tracks: string[] = [],
	checks: CheckReply[] = [NOTHING_TO_FIX],
	followUps: FollowUpReply[] = []
) {
	const seen = {
		plans: [] as string[],
		checks: [] as string[],
		followUps: [] as string[],
		editorTranscripts: 0
	}
	await page.route(
		(url) => url.pathname.endsWith('/make') || url.pathname.endsWith('/editor'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			const body = request.postData() ?? ''
			const isTranscript = body.includes('"audioBase64"')
			const isPlan = body.includes('"frames"')
			const isCheck = body.includes('"planText"')
			const isFollowUp = body.includes('"followUp"')
			if (!isTranscript && !isPlan && !isCheck && !isFollowUp) return route.continue()
			if (isTranscript && request.url().includes('/editor')) seen.editorTranscripts++
			const data = isTranscript
				? toTranscript(words)
				: isPlan
					? { reply: replies[Math.min(seen.plans.length, replies.length - 1)], tracks }
					: isFollowUp
						? { reply: followUps[Math.min(seen.followUps.length, followUps.length - 1)] ?? null }
						: checks[Math.min(seen.checks.length, checks.length - 1)]
			if (isPlan) seen.plans.push(body)
			if (isCheck) seen.checks.push(body)
			if (isFollowUp) seen.followUps.push(body)
			const response = await route.fetch({
				postData: !isTranscript
					? body.replace(/"request":"(?:[^"\\]|\\.)*"/, '"request":""')
					: body.replace(/"audioBase64":"[^"]*"/, '"audioBase64":""')
			})
			await route.fulfill({
				response,
				body: (await response.text()).replace(
					/\{"ok":false[^\n]*\}/,
					JSON.stringify({ ok: true, data })
				)
			})
		}
	)
	return seen
}
