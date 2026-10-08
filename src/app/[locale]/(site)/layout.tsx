import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

/** The public pages, and those reached from the menu: the top bar, the page, the footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col overflow-x-clip">
			<SiteHeader />
			<div className="flex flex-1 flex-col">{children}</div>
			<SiteFooter />
		</div>
	)
}
