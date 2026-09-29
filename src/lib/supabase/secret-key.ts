import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { AuthOnlySupabaseClient } from './auth-only'

// Supabase secret key (sb_secret_…, the replacement for the legacy
// service_role JWT). Bypasses auth entirely — server-only, for admin auth
// operations (deleting a user's auth account, an auth webhook with no
// session). Never call this
// from anything reachable by a request that hasn't already been verified as
// trusted (a webhook signature check, a cron secret check). This client has
// no business touching application data either way — that's Prisma's job,
// and the return type makes a data call a compile error.
export function createSecretKeyClient(): AuthOnlySupabaseClient {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}
