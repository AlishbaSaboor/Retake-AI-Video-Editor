'use client'

import type { ReactNode } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { ErrorPage, errorPageActionClassName } from '@/components/error-page'

function Fallback({ resetErrorBoundary }: FallbackProps) {
	return (
		<ErrorPage
			title="This section couldn't load"
			description="Try again, or refresh the page if it keeps happening."
			action={
				<button onClick={resetErrorBoundary} className={errorPageActionClassName}>
					Try again
				</button>
			}
		/>
	)
}

// Wrap a subtree that can fail independently of the rest of the page — a
// widget backed by a flaky embed, a chart that might choke on malformed
// data — so one broken component doesn't take down the whole route. For
// whole-route failures, the [locale]/error.tsx boundary already handles
// it; reach for this only when you want a smaller blast radius. See
// docs/rules/error-handling.md.
export function ErrorBoundary({ children }: { children: ReactNode }) {
	return (
		<ReactErrorBoundary
			FallbackComponent={Fallback}
			onError={(error) => {
				// notFound()/redirect() are implemented as thrown errors — this
				// must run first: it rethrows for one of those (so Next's own
				// boundary handles it instead of this one swallowing it into a
				// generic fallback) and returns normally for a real error, which
				// is when it falls through to actually get reported.
				unstable_rethrow(error)
				captureClientError(error)
			}}
		>
			{children}
		</ReactErrorBoundary>
	)
}
