'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon, AttachIcon, SpinnerIcon, UploadIcon } from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/editor-start'
import { VoiceCommandButton } from '@/app/[locale]/editor/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'

const EXAMPLES = ['cleanup', 'captions', 'trim', 'title', 'zoom'] as const

/**
 * Where a project starts: type (or say) what to change, attach the video,
 * and the editor opens with both. The command is only asked there, against
 * the loaded video, and still waits for Apply.
 */
export function StartBox() {
	const t = useTranslations('Site.home')
	const tDropzone = useTranslations('Editor.dropzone')
	const router = useRouter()
	const inputRef = useRef<HTMLInputElement>(null)
	const [command, setCommand] = useState('')
	const [dragging, setDragging] = useState(false)
	const [opening, setOpening] = useState<string | null>(null)

	function start(file: File) {
		handOffStart({ file, command: command.trim() || null })
		setOpening(file.name)
		router.push('/editor')
	}

	return (
		<div className="flex flex-col gap-5">
			<form
				aria-label={t('boxLabel')}
				onSubmit={(event) => {
					event.preventDefault()
					inputRef.current?.click()
				}}
				onDragOver={(event) => {
					event.preventDefault()
					setDragging(true)
				}}
				onDragLeave={(event) => {
					if (
						event.relatedTarget instanceof Node &&
						event.currentTarget.contains(event.relatedTarget)
					)
						return
					setDragging(false)
				}}
				onDrop={(event) => {
					event.preventDefault()
					setDragging(false)
					const file = event.dataTransfer.files[0]
					if (file) start(file)
				}}
				className={cn(
					'bg-surface relative flex flex-col rounded-lg border shadow-xl transition-colors',
					'focus-within:border-accent focus-within:ring-accent-glow focus-within:ring-4',
					dragging ? 'border-accent ring-accent-glow ring-4' : 'border-border'
				)}
			>
				<textarea
					value={command}
					onChange={(event) => setCommand(event.target.value)}
					rows={3}
					aria-label={t('commandLabel')}
					placeholder={t('placeholder')}
					disabled={opening !== null}
					className="text-text placeholder:text-text-faint min-h-28 w-full resize-none rounded-t-lg bg-transparent px-5 pt-5 text-base focus-visible:outline-none"
				/>
				<div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">
					<label className="text-text-muted hover:bg-surface-hover hover:text-text has-[:focus-visible]:outline-accent inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2">
						<AttachIcon size={18} />
						{t('attach')}
						<input
							ref={inputRef}
							type="file"
							accept="video/*"
							className="sr-only"
							aria-label={tDropzone('inputLabel')}
							onChange={(event) => {
								const file = event.target.files?.[0]
								if (file) start(file)
								event.target.value = ''
							}}
						/>
					</label>
					<VoiceCommandButton
						disabled={opening !== null}
						onText={(text) =>
							setCommand((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
						}
					/>
					<span className="text-text-faint hidden text-xs sm:inline">{t('dropHint')}</span>
					<Button type="submit" className="ml-auto" disabled={opening !== null}>
						{opening ? <SpinnerIcon /> : <UploadIcon />}
						{t('start')}
						{!opening && <ArrowRightIcon />}
					</Button>
				</div>
				{dragging && (
					<div className="bg-accent-soft text-accent pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-sm font-semibold">
						{t('dropHere')}
					</div>
				)}
			</form>
			{opening && (
				<p role="status" className="text-text-muted flex items-center gap-2 text-sm">
					<SpinnerIcon />
					{t('opening', { name: opening })}
				</p>
			)}
			<div className="flex flex-col gap-3">
				<p className="text-text-faint text-xs font-medium tracking-wide uppercase">
					{t('examplesLabel')}
				</p>
				<ul className="flex flex-wrap gap-2">
					{EXAMPLES.map((example) => (
						<li key={example}>
							<button
								type="button"
								onClick={() => setCommand(t(`examples.${example}`))}
								className="border-border bg-surface text-text-muted hover:border-accent hover:text-text focus-visible:outline-accent rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2"
							>
								{t(`examples.${example}`)}
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}
