import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type SessionUser = { id: string; email: string }

/**
 * Whether accounts are switched on: the Supabase URL and key are set. They
 * aren't in CI's e2e job, and then nothing asks anyone to sign in (proxy.ts).
 */
export function authConfigured(): boolean {
	return Boolean(
		process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
	)
}

/** Who is signed in, or null (also when accounts are off, or Supabase can't be reached). */
export async function currentUser(): Promise<SessionUser | null> {
	if (!authConfigured()) return null
	try {
		const supabase = await createServerSupabaseClient()
		const { data } = await supabase.auth.getUser()
		return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null
	} catch {
		return null
	}
}

/**
 * The signed-in user, or a 401: for anything that spends money (every paid AI
 * action). Fails closed: no session, accounts off, or Supabase unreachable
 * all refuse, whatever the page's redirect did (docs/rules/auth.md).
 */
export async function requireUser(): Promise<SessionUser> {
	const user = await currentUser()
	if (!user) throw new AppError('Sign in to use this.', { status: 401, code: 'unauthorized' })
	return user
}
