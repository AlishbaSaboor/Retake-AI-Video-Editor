import { SiteHeader } from '@/components/site/site-header'

export default function EditorLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader app wide />
			{children}
		</div>
	)
}
