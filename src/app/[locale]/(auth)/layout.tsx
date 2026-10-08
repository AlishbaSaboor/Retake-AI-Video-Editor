/** Logging in: a page of its own, with no site bar or footer (its own logo is on it). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return <div className="flex min-h-dvh flex-col">{children}</div>
}
