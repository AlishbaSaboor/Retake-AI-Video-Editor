'use client'

import { useTranslations } from 'next-intl'

/**
 * The visually hidden `<input type="file">` behind both the drop zone and the
 * "Replace video" button. Render it inside a `<label>` — clicking the label
 * opens the picker, so neither caller needs a ref.
 */
export function VideoFileInput({ onFile }: { onFile: (file: File) => void }) {
	const t = useTranslations('Editor.dropzone')
	return (
		<input
			type="file"
			accept="video/*"
			className="sr-only"
			aria-label={t('inputLabel')}
			onChange={(event) => {
				const file = event.target.files?.[0]
				if (file) onFile(file)
				// Cleared so picking the same file again still fires onChange.
				event.target.value = ''
			}}
		/>
	)
}
