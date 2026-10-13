import { AppHeader } from '@/components/site/app-header'

/** The signed-in pages: the app's top bar over the page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
			<AppHeader />
			<div className="flex flex-1 flex-col">{children}</div>
		</div>
	)
}
