'use client'

import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AttachIcon, LockIcon, UploadIcon } from '@/components/ui/icons'
import { VoiceCommandButton } from '@/app/[locale]/editor/components/assistant/voice-command-button'
import { formatTimecode } from '@/app/[locale]/editor/model/timeline-scale'
import { cn } from '@/lib/cn'
import { MAX_MAKE_SECONDS, MAX_REQUEST_LENGTH } from './make-plan'

/** The starting points, each with its dot's colour. */
const EXAMPLES = [
	{ key: 'reel', dot: 'bg-brand-violet' },
	{ key: 'funny', dot: 'bg-brand-purple' },
	{ key: 'professional', dot: 'bg-brand-blue' },
	{ key: 'ad', dot: 'bg-brand-lilac' }
] as const

/**
 * Make it's first step: the video (picked, dropped or replaced) and the
 * request (typed, spoken or an example), with what's wrong with either.
 * `start` reads the video and goes on; the form only ever calls it, and
 * `pick` and `setRequest`, which MakeIt owns.
 */
export function MakeRequestForm({
	file,
	request,
	setRequest,
	overLimit,
	problem,
	pick,
	start
}: {
	file: File | null
	request: string
	setRequest: Dispatch<SetStateAction<string>>
	overLimit: boolean
	problem: 'notVideo' | 'tooLong' | null
	pick: (next: File) => void
	start: () => Promise<void>
}) {
	const t = useTranslations('Make')
	const inputRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)
	return (
		<form
			className="flex flex-col gap-5"
			onSubmit={(event) => {
				event.preventDefault()
				void start()
			}}
		>
			<div className="w-full">
				<section
					onDragOver={(event) => {
						event.preventDefault()
						setDragging(true)
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault()
						setDragging(false)
						const dropped = event.dataTransfer.files[0]
						if (dropped) pick(dropped)
					}}
					className={cn(
						'flex flex-col gap-4 rounded-[18px] transition-shadow',
						dragging && 'ring-accent-glow ring-4'
					)}
				>
					{file ? (
						<AttachedVideo
							key={`${file.name}|${file.size}|${file.lastModified}`}
							file={file}
							onReplace={() => inputRef.current?.click()}
						/>
					) : (
						<button
							type="button"
							onClick={() => inputRef.current?.click()}
							className="border-border-strong text-text-muted hover:border-accent hover:bg-accent-soft focus-visible:outline-accent flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed px-6 py-[18px] text-center transition-colors focus-visible:outline-2"
						>
							<span className="text-accent-fg">
								<UploadIcon size={26} />
							</span>
							<span className="text-text text-[15px] font-semibold">{t('chooseVideo')}</span>
							<span className="text-text-faint text-[13px]">{t('dropHint')}</span>
						</button>
					)}
					<input
						ref={inputRef}
						type="file"
						accept="video/*"
						className="sr-only"
						tabIndex={-1}
						aria-label={t('videoLabel')}
						onChange={(event) => {
							const picked = event.target.files?.[0]
							event.target.value = ''
							if (picked) pick(picked)
						}}
					/>
					<div className="border-border-strong bg-surface-inset focus-within:border-accent flex flex-col gap-1 rounded-[14px] border px-3.5 py-3">
						<label
							htmlFor="make-request"
							className="text-text-faint font-mono text-[11.5px] tracking-[0.08em] uppercase"
						>
							{t('requestLabel')}
						</label>
						<textarea
							id="make-request"
							value={request}
							onChange={(event) => setRequest(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && !event.shiftKey) {
									event.preventDefault()
									void start()
								}
							}}
							rows={2}
							aria-describedby="make-request-count"
							aria-invalid={overLimit}
							placeholder={t('placeholder')}
							className="text-text placeholder:text-text-faint font-display w-full resize-none bg-transparent text-xl tracking-[-0.015em] focus-visible:outline-none"
						/>
						<p
							id="make-request-count"
							role={overLimit ? 'alert' : undefined}
							className={cn('text-xs', overLimit ? 'text-danger font-semibold' : 'text-text-faint')}
						>
							{overLimit
								? t('requestOver', {
										count: request.length - MAX_REQUEST_LENGTH,
										max: MAX_REQUEST_LENGTH
									})
								: t('requestLeft', { count: MAX_REQUEST_LENGTH - request.length })}
						</p>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{EXAMPLES.map(({ key }) => (
							<button
								key={key}
								type="button"
								onClick={() => setRequest(t(`examples.${key}`))}
								className={cn(
									'focus-visible:outline-accent inline-flex items-center rounded-full border px-3 py-1.5 text-[13.5px] transition-colors focus-visible:outline-2',
									request === t(`examples.${key}`)
										? 'border-accent bg-accent-soft text-text font-semibold'
										: 'border-border-strong text-text-muted hover:border-accent hover:text-text'
								)}
							>
								{t(`examples.${key}`)}
							</button>
						))}
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-label={t('attach')}
							title={t('attach')}
							onClick={() => inputRef.current?.click()}
							className="border-border-strong text-text-muted hover:text-text hover:bg-border focus-visible:outline-accent flex size-11 items-center justify-center rounded border transition-colors focus-visible:outline-2"
						>
							<AttachIcon size={17} />
						</button>
						<VoiceCommandButton
							onText={(text) =>
								setRequest((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
							}
						/>
						<Button
							type="submit"
							className="ml-auto"
							disabled={!file || !request.trim() || overLimit}
						>
							{t('makeIt')}
						</Button>
					</div>
				</section>
			</div>
			{problem && (
				<p role="alert" className="text-danger text-center text-sm">
					{t(`errors.${problem}`, { minutes: MAX_MAKE_SECONDS / 60 })}
				</p>
			)}
			<p className="text-text-faint flex items-start gap-2 text-[13px]">
				<LockIcon size={14} className="mt-0.5 shrink-0" />
				{t('steps.note')}
			</p>
		</form>
	)
}

const BYTES_PER_MB = 1024 * 1024

/**
 * The picked video as an attachment: a still from it with its length, its
 * name, its picture size and file size, and Replace. Read from the file in
 * the browser, only to show it.
 */
function AttachedVideo({ file, onReplace }: { file: File; onReplace: () => void }) {
	const t = useTranslations('Make')
	const [meta, setMeta] = useState<{ seconds: number; height: number } | null>(null)
	const size = `${(file.size / BYTES_PER_MB).toFixed(file.size < 10 * BYTES_PER_MB ? 1 : 0)} MB`
	return (
		<div className="bg-surface-hover flex flex-wrap items-center gap-3 rounded p-2">
			<span className="bg-night relative aspect-video w-[76px] shrink-0 overflow-hidden rounded-lg">
				<video
					// The file's own URL, for as long as this shows it.
					ref={(element) => {
						if (!element) return
						const url = URL.createObjectURL(file)
						element.src = `${url}#t=0.5`
						return () => URL.revokeObjectURL(url)
					}}
					muted
					playsInline
					preload="metadata"
					aria-hidden
					onLoadedMetadata={(event) => {
						const { duration, videoHeight } = event.currentTarget
						setMeta({ seconds: Number.isFinite(duration) ? duration : 0, height: videoHeight })
					}}
					className="size-full object-cover"
				/>
				{meta && meta.seconds > 0 && (
					<span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
						{formatTimecode(meta.seconds)}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-text truncate font-semibold">{file.name}</span>
				<span className="text-text-faint text-[13px]">
					{meta && meta.height > 0 ? t('ready', { quality: `${meta.height}p`, size }) : size}
				</span>
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label={t('changeVideo')}
				onClick={onReplace}
			>
				{t('replace')}
			</Button>
		</div>
	)
}
