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
				'group flex aspect-video w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors',
				'has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-2',
				isDragging
					? 'border-accent bg-surface'
					: 'border-border-strong bg-surface-inset hover:bg-surface'
			)}
		>
			<span className="border-border bg-surface text-accent mb-4 flex size-16 items-center justify-center rounded-lg border shadow-md transition-transform group-hover:scale-105 motion-reduce:transition-none">
				<UploadIcon size={UPLOAD_ICON_SIZE} />
			</span>
			<span className="text-text mb-1 text-base font-semibold">{t('title')}</span>
			<span className="text-text-muted mb-4 max-w-sm text-xs">{t('hint')}</span>
			{/* Decorative: the whole drop zone is the label that opens the picker. */}
			<span className="border-border bg-surface text-text-muted group-hover:border-accent group-hover:bg-accent group-hover:text-accent-ink rounded-lg border px-4 py-2 text-xs font-medium transition-colors">
				{t('browse')}
			</span>
			<VideoFileInput onFile={onFile} />
		</label>
	)
}
