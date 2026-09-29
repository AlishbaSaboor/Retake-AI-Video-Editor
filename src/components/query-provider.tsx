'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// QueryClient MUST be created inside a useState initializer, never at
// module scope — a module-level client is shared across every request on
// the server, leaking one user's cached data into another's response. This
// is the org's own documented convention (see 8x-core's
// REVAMP_GUIDELINES.md); this template installs the dependency for real
// instead of leaving it as an aspirational rule with nothing behind it.
export function QueryProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient())

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
