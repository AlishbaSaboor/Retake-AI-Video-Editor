import 'server-only'
import { db } from '@/server/db/client'

// Idempotent user provisioning, called on sign-in and sign-up with the
// Supabase auth uuid and email: creates or refreshes the User row, with
// id = the Supabase auth uuid (docs/rules/auth.md — never app-generated).
export async function provisionUser({ id, email }: { id: string; email: string }): Promise<void> {
	await db.user.upsert({
		where: { id },
		create: { id, email },
		update: { email }
	})
}
