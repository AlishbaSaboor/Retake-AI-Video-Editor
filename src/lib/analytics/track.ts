'use client'

import posthog from 'posthog-js'
import { trackEvent } from '@/lib/posthog/client'
import {
	ANALYTICS_EVENTS,
	type AnalyticsEventName,
	type CommonPageAttributes,
	type ElementType,
	type FieldState,
	type FieldType,
	type FilterCleared,
	type PropsFor
} from './events'

// Common page attributes (rule 6), computed once per call so no call site has
// to remember them. session_id comes from PostHog; page_name defaults to the
// pathname (override it with a stable human name where you have one).
function commonPageAttributes(): CommonPageAttributes {
	let sessionId: string | undefined
	try {
		sessionId = posthog.get_session_id()
	} catch {
		sessionId = undefined
	}
	return {
		session_id: sessionId,
		page_name: typeof window === 'undefined' ? undefined : window.location.pathname,
		timestamp_utc: new Date().toISOString()
	}
}

// The strict client API. `event` must be a cataloged name and `props` must
// match that event's contract in events.ts — a typo or an off-list property is
// a compile error. Common attributes are merged in; anything you pass wins over
// the defaults (e.g. a real page_name over the pathname fallback).
export function track<E extends AnalyticsEventName>(event: E, props: PropsFor<E>): void {
	trackEvent(event, { ...commonPageAttributes(), ...props })
}

// The escape hatch. Use for a genuinely one-off or experimental event that
// isn't worth adding to the catalog yet. Prefer track() — every event that
// outlives an experiment should graduate into events.ts so it's typed and
// documented. Named `capture` (not a second `trackEvent`) so there's one
// low-level posthog wrapper, in @/lib/posthog/client, and this sits above it.
export function capture(event: string, props?: Record<string, unknown>): void {
	trackEvent(event, { ...commonPageAttributes(), ...(props ?? {}) })
}

// ---------------------------------------------------------------------------
// Convenience wrappers — thin, typed shortcuts for the common client events so
// call sites read as one line. Each is just track() with the event name fixed.
// ---------------------------------------------------------------------------

export function trackElementClicked(props: PropsFor<'element_clicked'>): void {
	track(ANALYTICS_EVENTS.ELEMENT_CLICKED, props)
}

export function trackElementViewed(props: PropsFor<'element_viewed'>): void {
	track(ANALYTICS_EVENTS.ELEMENT_VIEWED, props)
}

export function trackFieldChanged(props: {
	field_name: string
	field_type: FieldType
	field_state: FieldState
}): void {
	track(ANALYTICS_EVENTS.FIELD_CHANGED, props)
}

export function trackFlowStarted(flowName: string): void {
	track(ANALYTICS_EVENTS.FLOW_STARTED, { flow_name: flowName })
}

export function trackFlowStep(props: { flow_name: string; step_name: string }): void {
	track(ANALYTICS_EVENTS.FLOW_STEP_STARTED, props)
}

export function trackFilterApplied(props: {
	filter_name: string
	filter_type: string
	filter_selection: string[]
}): void {
	track(ANALYTICS_EVENTS.FILTER_APPLIED, props)
}

export function trackFilterRemoved(props: {
	filter_name: string
	filter_type: string
	filter_cleared: FilterCleared
}): void {
	track(ANALYTICS_EVENTS.FILTER_REMOVED, props)
}

export function trackToggleChanged(props: { toggle_name: string; toggle_state: boolean }): void {
	track(ANALYTICS_EVENTS.TOGGLE_CHANGED, props)
}

export type { ElementType }
