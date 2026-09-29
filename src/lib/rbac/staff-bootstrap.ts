import type { AdminRole } from '@prisma/client'
import { LOWEST_ROLE } from './roles'

// Auto-provisioning rule: an internal email domain maps to a DEFAULT admin seat
// role; every other domain gets no seat at all. Shipped with 8x.social → the
// LOWEST role, so internal staff are recognised automatically but at least
// privilege, to be elevated deliberately. Change or extend the map in one line,
// or empty it to require fully manual granting. This is deliberately the LOWEST
// seat — no email string is ever a path to elevated access.
const STAFF_DOMAIN_ROLE: Record<string, AdminRole> = {
	'8x.social': LOWEST_ROLE
}

// The admin role a newly provisioned user should get from their email, or null
// for "no admin seat" (the normal case — creators/brands/end-users). Called by
// provisionUser on first sign-in. Case-insensitive on the domain; a malformed
// address returns null rather than throwing.
export function seatRoleForEmail(email: string): AdminRole | null {
	const domain = email.split('@').at(-1)?.toLowerCase() ?? ''
	return STAFF_DOMAIN_ROLE[domain] ?? null
}
