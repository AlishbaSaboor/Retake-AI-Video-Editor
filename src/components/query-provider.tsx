'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// QueryClient MUST be created inside a useState initializer, never at
// module scope — a module-level client is shared across every request on
// the server, leaking one user's cached data into another's response.
export function QueryProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => new QueryClient())

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
