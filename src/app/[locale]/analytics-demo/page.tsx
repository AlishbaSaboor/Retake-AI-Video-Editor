import { AnalyticsDemoClient } from './analytics-demo-client'

// Reference page for the analytics taxonomy (docs/rules/analytics.md). It's a
// living example, not product — delete this whole folder once you've read it.
export default function AnalyticsDemoPage() {
	return (
		<main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
			<AnalyticsDemoClient />
		</main>
	)
}
