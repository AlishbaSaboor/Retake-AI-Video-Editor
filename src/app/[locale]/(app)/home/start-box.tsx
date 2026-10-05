'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
	ImageIcon,
	ManualIcon,
	SoundIcon,
	SparkleIcon,
	SpinnerIcon,
	SplitIcon,
	TextIcon,
	UploadIcon
} from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/editor-layout-store'
import { VoiceCommandButton } from '@/app/[locale]/editor/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'

const EXAMPLES = ['cleanup', 'captions', 'trim', 'title', 'zoom'] as const
/** What the manual editor puts in front, shown on its card. */
const HAND_TOOLS = [
	{ key: 'cut', icon: SplitIcon },
	{ key: 'picture', icon: ImageIcon },
	{ key: 'sound', icon: SoundIcon },
	{ key: 'graphics', icon: TextIcon }
] as const

type Way = 'ai' | 'hand'

/**
 * Where a project starts: two ways in, side by side. With AI, the video
 * opens with the chat (and any command typed here, asked there and still
 * waiting for Apply); by hand, with the chat put away and the tools in front.
 */
export function StartBox() {
	const t = useTranslations('Site.home')
	const router = useRouter()
	const [command, setCommand] = useState('')
	const [opening, setOpening] = useState<{ way: Way; name: string } | null>(null)

	function start(file: File, way: Way) {
		// The editor remembers its columns; this choice sets them for this video.
		setSideOpen('chat', way === 'ai')
		if (way === 'hand') setSideOpen('tools', true)
		handOffStart({ file, command: way === 'ai' ? command.trim() || null : null })
		setOpening({ way, name: file.name })
		router.push('/editor')
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid gap-5 md:grid-cols-2">
				<Choice
					way="ai"
					icon={<SparkleIcon size={22} />}
					title={t('ai.title')}
					body={t('ai.body')}
					inputLabel={t('ai.inputLabel')}
					opening={opening}
					onFile={(file) => start(file, 'ai')}
				>
					<div className="border-border bg-surface-inset focus-within:border-accent focus-within:ring-accent-glow flex flex-col rounded-lg border transition-shadow focus-within:ring-2">
						<textarea
							value={command}
							onChange={(event) => setCommand(event.target.value)}
							rows={2}
							aria-label={t('commandLabel')}
							placeholder={t('placeholder')}
							disabled={opening !== null}
							className="text-text placeholder:text-text-faint w-full resize-none bg-transparent px-3 pt-2.5 text-sm focus-visible:outline-none"
						/>
						<div className="flex items-center justify-between px-1.5 pb-1.5">
							<span className="text-text-faint px-1.5 text-xs">{t('ai.optional')}</span>
							<VoiceCommandButton
								disabled={opening !== null}
								onText={(text) =>
									setCommand((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
								}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<p className="text-text-faint text-xs font-medium tracking-wide uppercase">
							{t('examplesLabel')}
						</p>
						<ul className="flex flex-wrap gap-1.5">
							{EXAMPLES.map((example) => (
								<li key={example}>
									<button
										type="button"
										onClick={() => setCommand(t(`examples.${example}`))}
										className="border-border text-text-muted hover:border-accent hover:text-text focus-visible:outline-accent rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2"
									>
										{t(`examples.${example}`)}
									</button>
								</li>
							))}
						</ul>
					</div>
				</Choice>
				<Choice
					way="hand"
					icon={<ManualIcon size={22} />}
					title={t('hand.title')}
					body={t('hand.body')}
					inputLabel={t('hand.inputLabel')}
					opening={opening}
					onFile={(file) => start(file, 'hand')}
				>
					<ul className="grid flex-1 grid-cols-2 gap-3">
						{HAND_TOOLS.map(({ key, icon: Icon }) => (
							<li
								key={key}
								className="border-border bg-surface-inset flex flex-col justify-between gap-3 rounded-lg border p-3.5"
							>
								<Icon size={20} className="text-accent" />
								<span className="text-text text-sm font-medium">{t(`hand.items.${key}`)}</span>
							</li>
						))}
					</ul>
				</Choice>
			</div>
			{opening && (
				<p role="status" className="text-text-muted flex items-center justify-center gap-2 text-sm">
					<SpinnerIcon />
					{t('opening', { name: opening.name })}
				</p>
			)}
		</div>
	)
}

/** One way in: what it is, what it's for, and its upload (a button, or a video dropped on it). */
function Choice({
	way,
	icon,
	title,
	body,
	inputLabel,
	opening,
	onFile,
	children
}: {
	way: Way
	icon: React.ReactNode
	title: string
	body: string
	inputLabel: string
	opening: { way: Way; name: string } | null
	onFile: (file: File) => void
	children: React.ReactNode
}) {
	const t = useTranslations('Site.home')
	const inputRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)
	const headingId = `start-${way}`
	return (
		<section
			aria-labelledby={headingId}
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
				if (file) onFile(file)
			}}
			className={cn(
				'bg-surface relative flex flex-col gap-5 rounded-lg border p-6 shadow-xl transition-colors',
				dragging
					? 'border-accent ring-accent-glow ring-4'
					: 'border-border hover:border-border-strong'
			)}
		>
			<div className="flex items-start gap-4">
				<span className="bg-accent-soft text-accent flex size-11 shrink-0 items-center justify-center rounded-lg">
					{icon}
				</span>
				<div className="flex flex-col gap-1">
					<h2 id={headingId} className="font-display text-text text-xl font-semibold">
						{title}
					</h2>
					<p className="text-text-muted text-sm leading-relaxed">{body}</p>
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-4">{children}</div>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					size="lg"
					className="flex-1 sm:flex-none"
					disabled={opening !== null}
					onClick={() => inputRef.current?.click()}
				>
					{opening?.way === way ? <SpinnerIcon /> : <UploadIcon />}
					{t('upload')}
				</Button>
				<span className="text-text-faint text-xs">{t('dropHint')}</span>
				<input
					ref={inputRef}
					type="file"
					accept="video/*"
					className="sr-only"
					tabIndex={-1}
					aria-label={inputLabel}
					onChange={(event) => {
						const file = event.target.files?.[0]
						event.target.value = ''
						if (file) onFile(file)
					}}
				/>
			</div>
			{dragging && (
				<div className="bg-accent-soft text-accent pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-sm font-semibold">
					{t('dropHere')}
				</div>
			)}
		</section>
	)
}
