// The event taxonomy. One source of truth for every event this app sends,
// shared by the client (track.ts) and server (server.ts) layers so a name
// or a property shape can only be defined in one place.
//
// The six standardisation rules this file enforces:
//  1. object_action — every name is a noun + past-tense verb (element_clicked).
//  2. snake_case — names and property keys, always.
//  3. past tense — the action already happened by the time we record it.
//  4. no variables in the name — names are fixed string literals, never
//     interpolated from runtime values. The only assembled names are the
//     process/notification ones, and those are built from closed enums
//     (see ProcessEventName / NotificationEventName), so the full set stays
//     finite and typed.
//  5. no PII, no free text — property values are ids, enums, or booleans
//     linked to an entity id. There is deliberately no `string` free-text
//     field anywhere in EventProps; a human-typed value never becomes a
//     property. See docs/rules/analytics.md.
//  6. common attributes are defined once — CommonPageAttributes / entity ids
//     here, common user attributes in attribution.ts / identify.ts.

export const ANALYTICS_EVENTS = {
	// Session / navigation
	APP_OPENED: 'app_opened',
	PAGE_VIEWED: 'page_viewed',
	// Element impressions and interactions
	ELEMENT_VIEWED: 'element_viewed',
	ELEMENT_CLICKED: 'element_clicked',
	FIELD_CHANGED: 'field_changed',
	// Flows / funnels
	FLOW_STARTED: 'flow_started',
	FLOW_STEP_STARTED: 'flow_step_started',
	// Filters / toggles
	FILTER_APPLIED: 'filter_applied',
	FILTER_REMOVED: 'filter_removed',
	TOGGLE_CHANGED: 'toggle_changed',
	// Backend / server-side
	REQUEST_FAILED: 'request_failed',
	ERROR_SHOWN: 'error_shown',
	PERMISSION_PROMPTED: 'permission_prompted',
	PERMISSION_APPROVED: 'permission_approved',
	PERMISSION_DENIED: 'permission_denied',
	JOB_STARTED: 'job_started',
	JOB_COMPLETED: 'job_completed',
	JOB_FAILED: 'job_failed'
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

// ---------------------------------------------------------------------------
// Enumerated dimensions — every property that isn't an id is one of these
// closed sets or a boolean, never free text (rule 5). Widen a union here when
// the product genuinely needs a new value; don't pass an off-list string.
// ---------------------------------------------------------------------------

export type ElementType =
	| 'primary_cta'
	| 'secondary_cta'
	| 'section'
	| 'modal'
	| 'header'
	| 'footer'
	| 'card'
	| 'link'
	| 'icon'
	| 'tab'
	| 'menu_item'

export type FieldType =
	| 'text'
	| 'email'
	| 'password'
	| 'number'
	| 'select'
	| 'checkbox'
	| 'radio'
	| 'file'
	| 'textarea'
	| 'date'
	| 'search'

export type FieldState = 'focused' | 'changed' | 'completed' | 'cleared' | 'error'

export type PermissionType = 'notifications' | 'location' | 'camera' | 'microphone' | 'contacts'

export type NotificationStatus = 'sent' | 'delivered' | 'clicked' | 'bounced'

// filter_cleared distinguishes "cleared everything" from "cleared these
// specific fields" — matches the [all] vs [specific, fields] shape in the spec.
export type FilterCleared = 'all' | string[]

// ---------------------------------------------------------------------------
// Entity + common attributes (rule 6). Every event may carry these; they are
// merged in automatically or passed explicitly, never redefined per event.
// entityId values are ids, not names — creator_id, not creator_name.
// ---------------------------------------------------------------------------

export type EntityIds = {
	creator_id?: string
	brand_id?: string
	campaign_id?: string
	payment_id?: string
}

// Attached to every client event by track(). timestamp_utc/session_id are
// filled in for you; page_name defaults to the pathname.
export type CommonPageAttributes = {
	session_id?: string
	page_name?: string
	timestamp_utc: string
}

// ---------------------------------------------------------------------------
// Per-event property contracts. The key set here IS the allowed event set for
// the strict track()/trackServer() APIs — a name not listed is a compile error.
// ---------------------------------------------------------------------------

export type EventProps = {
	app_opened: Record<string, never>
	page_viewed: { page_name: string }
	element_viewed: { element_type: ElementType; element_name: string }
	element_clicked: { element_type: ElementType; element_name: string }
	field_changed: { field_name: string; field_type: FieldType; field_state: FieldState }
	flow_started: { flow_name: string }
	flow_step_started: { flow_name: string; step_name: string }
	filter_applied: { filter_name: string; filter_type: string; filter_selection: string[] }
	filter_removed: { filter_name: string; filter_type: string; filter_cleared: FilterCleared }
	toggle_changed: { toggle_name: string; toggle_state: boolean }
	request_failed: { service_name: string; failure_reason: string }
	// error_type is a code/category (e.g. an AppError.code or error.name),
	// never the raw message — that would be free text and possibly PII.
	error_shown: { error_type: string; status?: number; is_expected?: boolean }
	permission_prompted: { permission_type: PermissionType }
	permission_approved: { permission_type: PermissionType }
	permission_denied: { permission_type: PermissionType }
	job_started: { job_id: string; platform?: string }
	job_completed: { job_id: string; platform?: string }
	job_failed: { job_id: string; platform?: string; failure_reason: string }
}

// Props for a given event, plus the entity ids any event may be linked to.
export type PropsFor<E extends AnalyticsEventName> = EventProps[E] & EntityIds

// ---------------------------------------------------------------------------
// Assembled-name events (rule 4 exception): built from closed enums so the
// name set stays finite and typed.
// ---------------------------------------------------------------------------

// Backend process / third-party dependency lifecycle. Enumerate one entry per
// real flow the project instruments (payment, kyc, withdrawal, ...) — the
// value is the event-name prefix, so PAYMENT: 'payment' yields payment_initiated
// / payment_succeeded / payment_failed. Starts with one example; extend it.
export const ANALYTICS_PROCESSES = {
	PAYMENT: 'payment'
} as const

export type AnalyticsProcess = (typeof ANALYTICS_PROCESSES)[keyof typeof ANALYTICS_PROCESSES]
export type ProcessPhase = 'initiated' | 'succeeded' | 'failed'
export type ProcessEventName = `${AnalyticsProcess}_${ProcessPhase}`

export type NotificationEventName = `notification_${NotificationStatus}`

export function processEventName(process: AnalyticsProcess, phase: ProcessPhase): ProcessEventName {
	return `${process}_${phase}`
}

export function notificationEventName(status: NotificationStatus): NotificationEventName {
	return `notification_${status}`
}
