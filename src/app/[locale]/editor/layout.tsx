/** The editor is the whole window: its own top bar (editor-shell.tsx) stands in for the site's. */
export default function EditorLayout({ children }: { children: React.ReactNode }) {
	return <div className="flex min-h-dvh flex-col">{children}</div>
}
