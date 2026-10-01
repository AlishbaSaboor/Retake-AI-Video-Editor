'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UploadIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { VideoFileInput } from './video-file-input'

const UPLOAD_ICON_SIZE = 32

/** Click-to-choose or drag-and-drop target for the first video. */
export function UploadDropzone({ onFile }: { onFile: (file: File) => void }) {
	const t = useTranslations('Editor.dropzone')
	const [isDragging, setIsDragging] = useState(false)

	return (
		<label
			onDragOver={(event) => {
				event.preventDefault()
				setIsDragging(true)
			}}
			onDragLeave={(event) => {
				// dragleave also fires when the pointer moves onto a child; only
				// clear the highlight once it has actually left the drop zone.
				if (
					event.relatedTarget instanceof Node &&
					event.currentTarget.contains(event.relatedTarget)
				) {
					return
				}
				setIsDragging(false)
			}}
			onDrop={(event) => {
				event.preventDefault()
				setIsDragging(false)
				const file = event.dataTransfer.files[0]
				if (file) onFile(file)
			}}
			className={cn(
				'flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-colors',
				'has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2',
				isDragging
					? 'border-accent bg-surface-hover'
					: 'border-border-strong bg-surface hover:bg-surface-hover'
			)}
		>
			<UploadIcon size={UPLOAD_ICON_SIZE} className="text-text-muted" />
			<span className="text-text font-medium">{t('title')}</span>
			<span className="text-text-muted text-sm">{t('hint')}</span>
			<VideoFileInput onFile={onFile} />
		</label>
	)
}
