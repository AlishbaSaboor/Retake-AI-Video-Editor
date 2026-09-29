import 'server-only'

function postToSlack(text: string): void {
	const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL
	if (!webhookUrl) return

	// Fire-and-forget, never awaited by the caller — alerting a human about a
	// bug must never become a second bug (a slow/down Slack webhook can't be
	// allowed to delay or fail the request it's reporting from).
	fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	}).catch(() => {})
}

// Called from capture-error.ts for every unexpected (non-AppError) error in
// production — see docs/rules/error-handling.md. No-ops until
// SLACK_ALERT_WEBHOOK_URL is set, same "off until configured" convention as
// Sentry/PostHog (src/lib/env.ts). Unlike the userMessage shown to a user,
// this can include real detail: Slack is a broadcast channel to the team,
// not the public.
//
// This posts every occurrence with no de-duplication — fine for a
// low-traffic template, but the org's own production repos (8x-payout,
// legacy 8x) learned the hard way that a hot error loop floods the channel
// until nobody reads it. If this project reaches that scale, replace the
// body of this function with a fingerprinted digest (track last-seen-at per
// `error.name`+`context`, only post on first occurrence and again after a
// cooldown) rather than adding a second, uncoordinated alert path.
export function notifyUnexpectedError(error: unknown, context?: Record<string, unknown>): void {
	const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
	const contextLine = context ? `\ncontext: ${JSON.stringify(context)}` : ''
	postToSlack(`🚨 Unexpected error\n\`\`\`${detail}\`\`\`${contextLine}`)
}
