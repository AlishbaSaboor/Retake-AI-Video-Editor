'use client'

import { track } from './track'
import { ANALYTICS_EVENTS, type PermissionType } from './events'

// Typed wrappers for the permission-prompt funnel: prompted -> approved/denied.
// Call trackPermissionPrompted right before you invoke the browser/OS prompt,
// then the matching outcome. Kept as plain functions (not tied to a specific
// API) so they work for any permission type in the enum.
export function trackPermissionPrompted(permissionType: PermissionType): void {
	track(ANALYTICS_EVENTS.PERMISSION_PROMPTED, { permission_type: permissionType })
}

export function trackPermissionApproved(permissionType: PermissionType): void {
	track(ANALYTICS_EVENTS.PERMISSION_APPROVED, { permission_type: permissionType })
}

export function trackPermissionDenied(permissionType: PermissionType): void {
	track(ANALYTICS_EVENTS.PERMISSION_DENIED, { permission_type: permissionType })
}

// Worked example: request the browser notification permission and record the
// whole funnel in one call. Copy this shape for location/camera/etc. — prompt,
// then branch the outcome to approved/denied. Returns the raw permission so the
// caller can act on it.
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (typeof Notification === 'undefined') return 'denied'
	trackPermissionPrompted('notifications')
	const result = await Notification.requestPermission()
	if (result === 'granted') {
		trackPermissionApproved('notifications')
	} else {
		trackPermissionDenied('notifications')
	}
	return result
}
