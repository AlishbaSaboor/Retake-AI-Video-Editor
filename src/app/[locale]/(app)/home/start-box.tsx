'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
	AiIcon,
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
import { handOffMake } from '../make/make-start'

const EXAMPLES = ['cleanup', 'captions', 'trim', 'title', 'zoom'] as const
/** Make it's starting points, each with its dot's colour. */
const MAKE_EXAMPLES = [
	{ key: 'reel', dot: 'bg-brand-violet' },
	{ key: 'funny', dot: 'bg-brand-purple' },
	{ key: 'professional', dot: 'bg-brand-blue' },
	{ key: 'ad', dot: 'bg-brand-lilac' }
] as const
/** What the manual editor puts in front, shown on its card. */
const HAND_TOOLS = [
	{ key: 'cut', icon: SplitIcon },
	{ key: 'picture', icon: ImageIcon },
	{ key: 'sound', icon: SoundIcon },
	{ key: 'graphics', icon: TextIcon }
] as const

type Way = 'make' | 'hand' | 'ai'

const chip =
	'border-border text-text-muted hover:border-border-strong hover:text-text focus-visible:outline-accent inline-flex items-center gap-2 rounded-full border px-[11px] py-1.5 text-[12.5px] font-bold transition-colors focus-visible:outline-2'

/**
 * Where a project starts. Two ways in, side by side: Make it with AI (the
 * video and what it should become go to the Make it page, which plans the
 * whole edit) and Edit by hand (straight to the tools and the timeline).
 * Under them, a third: open the video with the assistant and a first change
 * waiting for Apply.
 */
export function StartBox() {
	const t = useTranslations('Site.home')
	const examples = useTranslations('Make.examples')
	const router = useRouter()
	const [request, setRequest] = useState('')
	const [command, setCommand] = useState('')
	const [opening, setOpening] = useState<{ way: Way; name: string } | null>(null)

	function start(file: File, way: Way) {
		setOpening({ way, name: file.name })
		if (way === 'make') {
			handOffMake({ file, request: request.trim() })
			router.push('/make')
			return
		}
		// The editor remembers whether its panels are hidden: both ways start with them shown.
		setSideOpen('panels', true)
		handOffStart({
			file,
			command: way === 'ai' ? command.trim() || null : null,
			byHand: way === 'hand'
		})
		router.push('/editor')
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid gap-5 lg:grid-cols-[586fr_510fr]">
				<div className="bg-brand-wide rt-lift rounded-[30px] p-0.5 shadow-(--shadow-card)">
					<DropCard
						way="make"
						onFile={(file) => start(file, 'make')}
						className="bg-surface-raised h-full rounded-[28px]"
					>
						<span
							aria-hidden
							className="bg-orb-violet pointer-events-none absolute -top-36 -right-24 size-[340px] rounded-full opacity-60 blur-[90px]"
						/>
						<div className="relative flex items-center gap-3">
							<span className="bg-brand flex size-[46px] items-center justify-center rounded-[14px] text-white">
								<AiIcon size={22} />
							</span>
							<span className="bg-accent-soft text-accent-fg rounded-full px-2.5 py-1 text-xs font-extrabold">
								{t('make.badge')}
							</span>
						</div>
						<CardText id="start-make" title={t('make.title')} body={t('make.body')} />
						<div className="border-border-strong bg-surface-inset focus-within:border-accent/60 focus-within:ring-accent-soft relative flex flex-col gap-3 rounded-[18px] border px-3.5 pt-3.5 pb-3 transition-shadow focus-within:ring-4">
							<div className="flex items-start gap-2">
								<textarea
									value={request}
									onChange={(event) => setRequest(event.target.value)}
									rows={1}
									aria-label={t('make.requestLabel')}
									placeholder={t('make.placeholder')}
									disabled={opening !== null}
									className="text-text placeholder:text-text-faint field-sizing-content min-h-7 w-full flex-1 resize-none bg-transparent text-base font-semibold focus-visible:outline-none"
								/>
								<VoiceCommandButton
									disabled={opening !== null}
									onText={(text) =>
										setRequest((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
									}
								/>
							</div>
							<ul className="flex flex-wrap gap-1.5">
								{MAKE_EXAMPLES.map(({ key, dot }) => (
									<li key={key}>
										<button
											type="button"
											onClick={() => setRequest(examples(key))}
											className={cn(
												chip,
												request === examples(key) && 'border-accent/60 text-text'
											)}
										>
											<span aria-hidden className={cn('size-[7px] rounded-full', dot)} />
											{examples(key)}
										</button>
									</li>
								))}
							</ul>
						</div>
						<Upload
							label={t('make.inputLabel')}
							text={t('make.upload')}
							hint={t('dropHint')}
							busy={opening?.way === 'make'}
							disabled={opening !== null}
							onFile={(file) => start(file, 'make')}
						/>
					</DropCard>
				</div>
				<DropCard
					way="hand"
					onFile={(file) => start(file, 'hand')}
					className="border-glass-border bg-glass rt-lift rounded-[30px] border"
				>
					<span className="bg-surface-hover text-text flex size-[46px] items-center justify-center rounded-[14px]">
						<ManualIcon size={22} />
					</span>
					<CardText id="start-hand" title={t('hand.title')} body={t('hand.body')} />
					<ul className="grid grid-cols-2 gap-2">
						{HAND_TOOLS.map(({ key, icon: Icon }) => (
							<li
								key={key}
								className="border-border flex items-center gap-2.5 rounded-[14px] border p-3"
							>
								<span className="bg-accent-soft text-accent-fg flex size-[30px] shrink-0 items-center justify-center rounded-[9px]">
									<Icon size={16} />
								</span>
								<span className="text-text text-[13.5px] leading-tight font-bold">
									{t(`hand.items.${key}`)}
								</span>
							</li>
						))}
					</ul>
					<Upload
						label={t('hand.inputLabel')}
						text={t('hand.upload')}
						hint={t('dropHint')}
						variant="contrast"
						busy={opening?.way === 'hand'}
						disabled={opening !== null}
						onFile={(file) => start(file, 'hand')}
					/>
				</DropCard>
			</div>
			<DropCard
				way="ai"
				onFile={(file) => start(file, 'ai')}
				className="border-glass-border bg-glass rounded-[24px] border p-6 lg:flex-row lg:items-start lg:gap-6"
			>
				<div className="flex flex-col gap-2 lg:w-[300px] lg:shrink-0">
					<div className="text-accent-fg flex items-center gap-2">
						<SparkleIcon size={18} />
						<h2 id="start-ai" className="text-text text-lg font-extrabold">
							{t('ai.title')}
						</h2>
					</div>
					<p className="text-text-muted text-sm leading-relaxed">{t('ai.body')}</p>
				</div>
				<div className="flex flex-1 flex-col gap-3">
					<div className="border-border-strong bg-surface-inset focus-within:border-accent/60 focus-within:ring-accent-soft flex items-start gap-2 rounded-[14px] border px-3 py-2.5 transition-shadow focus-within:ring-4">
						<textarea
							value={command}
							onChange={(event) => setCommand(event.target.value)}
							rows={1}
							aria-label={t('commandLabel')}
							placeholder={t('placeholder')}
							disabled={opening !== null}
							className="text-text placeholder:text-text-faint field-sizing-content min-h-7 w-full flex-1 resize-none bg-transparent text-sm focus-visible:outline-none"
						/>
						<VoiceCommandButton
							disabled={opening !== null}
							onText={(text) =>
								setCommand((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
							}
						/>
					</div>
					<ul aria-label={t('examplesLabel')} className="flex flex-wrap gap-1.5">
						{EXAMPLES.map((example) => (
							<li key={example}>
								<button
									type="button"
									onClick={() => setCommand(t(`examples.${example}`))}
									className={chip}
								>
									{t(`examples.${example}`)}
								</button>
							</li>
						))}
					</ul>
				</div>
				<Upload
					label={t('ai.inputLabel')}
					text={t('ai.upload')}
					variant="outline"
					busy={opening?.way === 'ai'}
					disabled={opening !== null}
					onFile={(file) => start(file, 'ai')}
				/>
			</DropCard>
			{opening && (
				<p role="status" className="text-text-muted flex items-center justify-center gap-2 text-sm">
					<SpinnerIcon />
					{t('opening', { name: opening.name })}
				</p>
			)}
		</div>
	)
}

function CardText({ id, title, body }: { id: string; title: string; body: string }) {
	return (
		<div className="relative flex flex-col gap-2">
			<h2 id={id} className="text-text text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
				{title}
			</h2>
			<p className="text-text-muted text-[15.5px] leading-[1.45]">{body}</p>
		</div>
	)
}

/** A way in that a video can also be dropped on. */
function DropCard({
	way,
	onFile,
	className,
	children
}: {
	way: Way
	onFile: (file: File) => void
	className?: string
	children: React.ReactNode
}) {
	const t = useTranslations('Site.home')
	const [dragging, setDragging] = useState(false)
	return (
		<section
			aria-labelledby={`start-${way}`}
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
				'relative flex flex-col gap-5 overflow-hidden p-7 transition-shadow',
				dragging && 'ring-accent-glow ring-4',
				className
			)}
		>
			{children}
			{dragging && (
				<div className="bg-accent-soft text-accent-fg pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] text-sm font-extrabold backdrop-blur-sm">
					{t('dropHere')}
				</div>
			)}
		</section>
	)
}

/** A way in's upload: a button that opens the file picker, and the drop hint beside it. */
function Upload({
	label,
	text,
	hint,
	variant = 'primary',
	busy,
	disabled,
	onFile
}: {
	label: string
	text: string
	hint?: string
	variant?: 'primary' | 'contrast' | 'outline'
	busy: boolean
	disabled: boolean
	onFile: (file: File) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	return (
		<div className="relative mt-auto flex flex-wrap items-center gap-3.5">
			<Button
				type="button"
				size="lg"
				variant={variant}
				className="rounded-[14px]"
				disabled={disabled}
				onClick={() => inputRef.current?.click()}
			>
				{busy ? <SpinnerIcon /> : <UploadIcon size={18} />}
				{text}
			</Button>
			{hint && <span className="text-text-faint text-[13px]">{hint}</span>}
			<input
				ref={inputRef}
				type="file"
				accept="video/*"
				className="sr-only"
				tabIndex={-1}
				aria-label={label}
				onChange={(event) => {
					const file = event.target.files?.[0]
					event.target.value = ''
					if (file) onFile(file)
				}}
			/>
		</div>
	)
}
