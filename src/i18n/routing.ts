import { defineRouting } from 'next-intl/routing'
import { createNavigation } from 'next-intl/navigation'

// Add locales here as the project needs them. Keep the list short at
// launch — every locale added here needs a matching messages/<locale>.json
// or it silently falls back to the default (see request.ts), and
// `pnpm test` includes an i18n-completeness check once real message keys
// exist (see scripts/ once the project has more than the example page).
export const routing = defineRouting({
	locales: ['en'],
	defaultLocale: 'en',
	// The default locale is served unprefixed (/about, not /en/about); every
	// other locale keeps its prefix (/de/about). /en/... redirects to /...
	localePrefix: 'as-needed'
})

// Locale-aware Link/router/redirect — components that need navigation MUST
// import these instead of next/navigation, or locale switching breaks in
// production (client components resolve routes without the locale prefix
// otherwise). This bit 8x-marketing in production.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
