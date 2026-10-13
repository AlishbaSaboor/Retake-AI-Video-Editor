import { useEffect, useEffectEvent } from 'react'

/** The editor's keyboard shortcuts: undo and redo, from anywhere on the page. */
export function useEditorShortcuts({
	showOriginal,
	undoEdit,
	redoEdit
}: {
	showOriginal: boolean
	undoEdit: () => void
	redoEdit: () => void
}) {
	// Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z or Ctrl+Y redoes: in the Edited view,
	// and not while typing (there they're the field's own).
	const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
		if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return
		const target = event.target instanceof HTMLElement ? event.target : null
		if (target && (target.isContentEditable || target.closest('input, textarea, select, dialog')))
			return
		if (showOriginal) return
		const key = event.key.toLowerCase()
		const action =
			key === 'z' ? (event.shiftKey ? redoEdit : undoEdit) : key === 'y' ? redoEdit : null
		if (!action) return
		event.preventDefault()
		action()
	})

	useEffect(() => {
		window.addEventListener('keydown', handleShortcut)
		return () => window.removeEventListener('keydown', handleShortcut)
	}, [])
}
