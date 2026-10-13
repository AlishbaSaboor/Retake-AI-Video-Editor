import type { AdminRole } from '@prisma/client'

// Auto-provisioning rule: an internal email domain maps to a DEFAULT admin seat
// role; every other domain gets no seat at all. Empty in Retake: sign-up has no
// email confirmation (supabase/config.toml), so anyone could type an address at
// a listed domain and get its seat. Every seat is granted by hand. A domain may
// only be added here once sign-up confirms the address, and then only at the
// LOWEST role (roles.ts): no email string is ever a path to elevated access.
const STAFF_DOMAIN_ROLE: Record<string, AdminRole> = {}

// The admin role a newly provisioned user should get from their email, or null
// for "no admin seat" (the normal case — creators/brands/end-users). Called by
// provisionUser on first sign-in. Case-insensitive on the domain; a malformed
// address returns null rather than throwing.
export function seatRoleForEmail(email: string): AdminRole | null {
	const domain = email.split('@').at(-1)?.toLowerCase() ?? ''
	return STAFF_DOMAIN_ROLE[domain] ?? null
}
