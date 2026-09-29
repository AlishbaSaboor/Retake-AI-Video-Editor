import 'server-only'
import { db } from '@/server/db/client'
import { log } from '@/server/lib/logger'
import { seatRoleForEmail } from '@/lib/rbac/staff-bootstrap'

// Idempotent user provisioning — call on first sign-in / from an auth webhook
// with the Supabase auth uuid + email. It (1) creates or refreshes the User row
// with id = the Supabase auth uuid (docs/rules/auth.md — never app-generated),
// and (2) if the email's domain maps to a staff seat (src/lib/rbac/staff-bootstrap),
// creates an AdminMember at that role. seatRoleForEmail returns the LOWEST role
// for 8x.social and null for everyone else, so a non-staff user gets a User row
// and no seat. An existing seat is never downgraded here — (re)seating or
// elevation is a deliberate access.manage action, not a side effect of signing in.
export async function provisionUser({ id, email }: { id: string; email: string }): Promise<void> {
	await db.user.upsert({
		where: { id },
		create: { id, email },
		update: { email }
	})

	const seatRole = seatRoleForEmail(email)
	if (!seatRole) return

	await db.adminMember.upsert({
		where: { userId: id },
		create: { userId: id, role: seatRole },
		update: {}
	})
	log.info('provisioned admin seat', { userId: id, role: seatRole })
}
