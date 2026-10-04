import { SiteHeader } from '@/components/site/site-header'

/** The signed-in pages: the app's top bar over the page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader app />
			<div className="flex flex-1 flex-col">{children}</div>
		</div>
	)
}
