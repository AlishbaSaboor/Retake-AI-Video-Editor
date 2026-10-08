import { AppHeader } from '@/components/site/app-header'

/** The signed-in pages: the app's top bar over the page, on the page's soft glow. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
			<div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_70%_at_50%_0%,var(--glow-violet),transparent_70%),radial-gradient(40%_50%_at_85%_10%,var(--glow-blue),transparent_70%)]" />
				<div className="bg-orb-violet absolute top-[240px] -left-28 size-[520px] rounded-full opacity-40 blur-[120px]" />
				<div className="bg-orb-blue absolute top-[88px] -right-24 size-[480px] rounded-full opacity-30 blur-[120px]" />
			</div>
			<AppHeader />
			<div className="flex flex-1 flex-col">{children}</div>
		</div>
	)
}
