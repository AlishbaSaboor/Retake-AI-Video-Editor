import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { AuthOnlySupabaseClient } from './auth-only'

// Auth only — this project's data still goes through Prisma
// (@/server/db/client). See docs/rules/auth.md for why these stay separate.
// The return type is what enforces it: the auth surface, no `.from()`.
// Use this in Server Components, route handlers and server actions that need
// to know who's signed in. In a Server Component it reads the session from
// cookies but can't save a refreshed one (Server Components can't set
// cookies), so proxy.ts refreshes it on page loads first. In a server action
// it can: a session refreshed here is written to the response's cookies,
// which is why proxy.ts skips its own lookup for actions posted to signed-in
// pages.
export async function createServerSupabaseClient(): Promise<AuthOnlySupabaseClient> {
	const cookieStore = await cookies()

	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll()
				},
				setAll(cookiesToSet) {
					try {
						cookiesToSet.forEach(({ name, value, options }) =>
							cookieStore.set(name, value, options)
						)
					} catch {
						// Called from a Server Component with no way to set cookies —
						// safe to ignore: proxy.ts refreshes the session on page loads.
					}
				}
			}
		}
	)
}
