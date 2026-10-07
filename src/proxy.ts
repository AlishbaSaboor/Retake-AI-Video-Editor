import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'
import type { AuthOnlySupabaseClient } from '@/lib/supabase/auth-only'

const intlProxy = createIntlMiddleware(routing)

// Refreshes the Supabase session cookie on every request, then hands off to
// next-intl's locale routing. Order matters: Supabase's cookie writes have
// to survive whatever next-intl's proxy does next (redirect or rewrite), so
// we run Supabase first and copy its Set-Cookie headers onto whatever
// response next-intl produces — not the other way around.
export default async function proxy(request: NextRequest) {
	let supabaseResponse = NextResponse.next({ request })

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
	// Signed in, signed out, or unknown (accounts off, or Supabase unreachable:
	// then nothing is guarded, as nothing could be checked).
	let signedIn: boolean | null = null

	if (supabaseUrl && supabasePublishableKey) {
		// Typed to the auth surface like the wrappers in src/lib/supabase/ —
		// this is the one other place the SDK is constructed, and it exists
		// only to refresh the session cookie.
		const supabase: AuthOnlySupabaseClient = createServerClient(
			supabaseUrl,
			supabasePublishableKey,
			{
				cookies: {
					getAll() {
						return request.cookies.getAll()
					},
					setAll(cookiesToSet) {
						cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
						supabaseResponse = NextResponse.next({ request })
						cookiesToSet.forEach(({ name, value, options }) =>
							supabaseResponse.cookies.set(name, value, options)
						)
					}
				}
			}
		)

		// Talking to Supabase here is a real network call — never let it take
		// the whole site down. A landing-page clone with placeholder
		// Supabase env vars, or Supabase itself being briefly unreachable,
		// should still serve pages; it just means the session isn't refreshed
		// on this request.
		try {
			const { data, error } = await supabase.auth.getUser()
			// Only an unreachable Supabase leaves it unknown; no session, or a
			// bad one, is signed out.
			signedIn = data.user ? true : error?.name === 'AuthRetryableFetchError' ? null : false
		} catch {
			// Fail open — see comment above.
		}
	}

	const redirectTo = guardRedirect(request, signedIn)
	if (redirectTo) {
		const response = NextResponse.redirect(redirectTo)
		supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
		return response
	}

	const intlResponse = intlProxy(request)
	// Copy the whole cookie object, not just (name, value): the options carry
	// httpOnly / secure / sameSite / maxAge / path, and dropping them would
	// downgrade a freshly refreshed session cookie into a permissive one.
	supabaseResponse.cookies.getAll().forEach((cookie) => {
		intlResponse.cookies.set(cookie)
	})

	return intlResponse
}

// The pages behind a sign-in, and where signing in lands.
const SIGNED_IN_PAGES = ['/home', '/make', '/projects', '/editor']
const SIGN_IN_PAGE = '/login'
const AFTER_SIGN_IN = '/home'

/** Where a request should go instead, if anywhere: signed-out visitors to sign in, signed-in ones past it. */
function guardRedirect(request: NextRequest, signedIn: boolean | null): URL | null {
	if (signedIn === null) return null
	// The default locale is unprefixed; strip any other locale's prefix to match.
	const { pathname, search } = request.nextUrl
	const [, first] = pathname.split('/')
	const prefix = first && (routing.locales as readonly string[]).includes(first) ? `/${first}` : ''
	const path = pathname.slice(prefix.length) || '/'
	const under = (page: string) => path === page || path.startsWith(`${page}/`)
	if (!signedIn && SIGNED_IN_PAGES.some(under)) {
		const url = new URL(`${prefix}${SIGN_IN_PAGE}`, request.url)
		url.searchParams.set('next', `${path}${search}`)
		return url
	}
	if (signedIn && under(SIGN_IN_PAGE)) return new URL(`${prefix}${AFTER_SIGN_IN}`, request.url)
	return null
}

export const config = {
	// Skip API routes, static files, and Next internals — locale routing
	// only applies to actual pages.
	matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
}
