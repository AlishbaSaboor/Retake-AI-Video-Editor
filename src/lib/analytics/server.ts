import 'server-only'
import { getPostHogServerClient } from '@/lib/posthog/server'
import {
	ANALYTICS_EVENTS,
	notificationEventName,
	processEventName,
	type AnalyticsEventName,
	type AnalyticsProcess,
	type EntityIds,
	type NotificationStatus,
	type ProcessPhase,
	type PropsFor
} from './events'

// distinctId ties a server event to the same PostHog person as the client
// events (identifyUser in identify.ts). Use the authenticated user id where you
// have one; for a truly system-level job with no user, use a stable synthetic
// id like 'system' rather than a random value (which would spawn junk persons).
type ServerContext = { distinctId: string } & EntityIds

// The strict server API — mirror of client track(), but posthog-node so it
// never pulls server-only code into a client bundle. flushAt: 1 (server.ts)
// means each call sends immediately, which is what you want in serverless.
export function trackServer<E extends AnalyticsEventName>(
	event: E,
	context: ServerContext,
	props: PropsFor<E>
): void {
	const { distinctId, ...entityIds } = context
	try {
		getPostHogServerClient()?.capture({
			distinctId,
			event,
			properties: { timestamp_utc: new Date().toISOString(), ...entityIds, ...props }
		})
	} catch {
		// Analytics can never break the request it's reporting from.
	}
}

// Backend service failure (DB, cache, third party). Call it at the boundary
// that actually failed — captureError can't know which service that was.
// failure_reason is a short code/category ('timeout', 'connection_refused'),
// never a raw error message (free text / possible PII).
export function trackRequestFailed(
	context: ServerContext,
	props: { service_name: string; failure_reason: string }
): void {
	trackServer(ANALYTICS_EVENTS.REQUEST_FAILED, context, props)
}

// Async job lifecycle (IG/YT/TT refresh, account link, ...). One call per phase.
export function trackJob(
	context: ServerContext,
	props: {
		phase: 'started' | 'completed' | 'failed'
		job_id: string
		platform?: string
		failure_reason?: string
	}
): void {
	if (props.phase === 'started') {
		trackServer(ANALYTICS_EVENTS.JOB_STARTED, context, {
			job_id: props.job_id,
			platform: props.platform
		})
		return
	}
	if (props.phase === 'completed') {
		trackServer(ANALYTICS_EVENTS.JOB_COMPLETED, context, {
			job_id: props.job_id,
			platform: props.platform
		})
		return
	}
	trackServer(ANALYTICS_EVENTS.JOB_FAILED, context, {
		job_id: props.job_id,
		platform: props.platform,
		failure_reason: props.failure_reason ?? 'unknown'
	})
}

// Backend process / third-party dependency (payment, KYC, withdrawal). The
// event name is assembled from the enumerated process + phase in events.ts —
// add a real flow to ANALYTICS_PROCESSES before instrumenting it. failure_reason
// is a code/enum on the failed phase, never free text.
export function trackProcess(
	context: ServerContext,
	props: {
		process: AnalyticsProcess
		phase: ProcessPhase
		failure_reason?: string
	}
): void {
	const { distinctId, ...entityIds } = context
	try {
		getPostHogServerClient()?.capture({
			distinctId,
			event: processEventName(props.process, props.phase),
			properties: {
				timestamp_utc: new Date().toISOString(),
				...entityIds,
				...(props.phase === 'failed' ? { failure_reason: props.failure_reason ?? 'unknown' } : {})
			}
		})
	} catch {
		// Analytics can never break the process it's reporting on.
	}
}

// Comms / push notification lifecycle. sent/delivered/bounced are server-side;
// clicked is usually recorded on the client (@/lib/analytics/track capture),
// but the server path accepts it too for server-attributed opens.
export function trackNotification(
	context: ServerContext,
	props: {
		status: NotificationStatus
		comms_id: string
		comms_name: string
		failure_reason?: string
	}
): void {
	const { distinctId, ...entityIds } = context
	try {
		getPostHogServerClient()?.capture({
			distinctId,
			event: notificationEventName(props.status),
			properties: {
				timestamp_utc: new Date().toISOString(),
				...entityIds,
				comms_id: props.comms_id,
				comms_name: props.comms_name,
				...(props.status === 'bounced' && props.failure_reason
					? { failure_reason: props.failure_reason }
					: {})
			}
		})
	} catch {
		// Analytics can never break the send it's reporting on.
	}
}
