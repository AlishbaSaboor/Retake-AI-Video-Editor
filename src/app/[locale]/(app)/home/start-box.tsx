'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
	ArrowRightIcon,
	ManualIcon,
	SparkleIcon,
	SpinnerIcon,
	UploadIcon,
	VideoIcon
} from '@/components/ui/icons'
import { handOffStart } from '@/app/[locale]/editor/projects/editor-start'
import { setSideOpen } from '@/app/[locale]/editor/components/shell/editor-layout-store'
import { VoiceCommandButton } from '@/app/[locale]/editor/components/assistant/voice-command-button'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/cn'
import { handOffMake } from '../make/make-start'

/** Make it's starting points. */
const MAKE_EXAMPLES = ['reel', 'funny', 'professional', 'ad'] as const

type Way = 'make' | 'hand'

const chip =
	'border-border-strong text-text-muted hover:border-accent hover:text-text focus-visible:outline-accent inline-flex items-center rounded-full border px-3 py-1.5 text-[13.5px] transition-colors focus-visible:outline-2'

/** The recommended way's border: the accent into the support blue, fading into the line. */
const AI_CARD =
	'shadow-[0_30px_80px_-50px_var(--accent)] [background:linear-gradient(var(--surface),var(--surface))_padding-box,linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--blue)_70%,transparent)_45%,var(--border)_80%)_border-box] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(70%_90%_at_0%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_70%)]'

/**
 * Where a project starts. Two ways in, side by side: Make it with AI (the
 * video and what it should become go to the Make it page, which plans the
 * whole edit), set off as the recommended one, and Edit manually (straight
 * to the tools and the timeline). A video can be dropped on either.
 */
export function StartBox() {
	const t = useTranslations('Site.home')
	const examples = useTranslations('Make.examples')
	const router = useRouter()
	const [request, setRequest] = useState('')
	const [opening, setOpening] = useState<{ way: Way; name: string } | null>(null)
	const makeInput = useRef<HTMLInputElement>(null)
	const handInput = useRef<HTMLInputElement>(null)

	function start(file: File, way: Way) {
		setOpening({ way, name: file.name })
		if (way === 'make') {
			handOffMake({ file, request: request.trim() })
			router.push('/make')
			return
		}
		// The editor remembers whether its panels are hidden: both ways start with them shown.
		setSideOpen('panels', true)
		handOffStart({ file, command: null, byHand: true })
		router.push('/editor')
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
				<DropCard way="make" onFile={(file) => start(file, 'make')} className={AI_CARD}>
					<CardHead
						id="start-make"
						icon={<SparkleIcon size={21} />}
						iconClass="bg-accent text-accent-ink"
						title={t('make.title')}
						body={t('make.body')}
						tag={t('make.badge')}
					/>
					<div className="border-border-strong bg-surface-inset focus-within:border-accent relative flex items-center gap-2 rounded-2xl border py-1.5 pr-1.5 pl-4 max-[520px]:flex-col max-[520px]:items-stretch max-[520px]:p-2.5">
						<textarea
							value={request}
							onChange={(event) => setRequest(event.target.value)}
							rows={1}
							aria-label={t('make.requestLabel')}
							placeholder={t('make.placeholder')}
							disabled={opening !== null}
							className="text-text placeholder:text-text-faint font-display field-sizing-content min-h-7 w-full min-w-0 flex-1 resize-none bg-transparent py-1.5 text-lg tracking-[-0.01em] focus-visible:outline-none"
						/>
						<div className="flex items-center gap-1.5">
							<VoiceCommandButton
								disabled={opening !== null}
								onText={(text) =>
									setRequest((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
								}
							/>
							<Button
								type="button"
								className="min-h-[42px] flex-1"
								disabled={opening !== null}
								onClick={() => makeInput.current?.click()}
							>
								{opening?.way === 'make' ? <SpinnerIcon /> : <UploadIcon size={18} />}
								{t('make.upload')}
							</Button>
						</div>
					</div>
					<ul className="relative flex flex-wrap gap-1.5">
						{MAKE_EXAMPLES.map((key) => (
							<li key={key}>
								<button
									type="button"
									onClick={() => setRequest(examples(key))}
									className={cn(
										chip,
										request === examples(key) &&
											'border-accent bg-accent-soft text-text font-semibold'
									)}
								>
									{examples(key)}
								</button>
							</li>
						))}
					</ul>
					<FileInput
						inputRef={makeInput}
						label={t('make.inputLabel')}
						onFile={(file) => start(file, 'make')}
					/>
				</DropCard>
				<DropCard
					way="hand"
					onFile={(file) => start(file, 'hand')}
					className="border-border bg-surface hover:border-border-strong"
				>
					<CardHead
						id="start-hand"
						icon={<ManualIcon size={21} />}
						iconClass="bg-surface-hover text-accent-fg"
						title={t('hand.title')}
						body={t('hand.body')}
					/>
					<button
						type="button"
						disabled={opening !== null}
						onClick={() => handInput.current?.click()}
						className="group border-border-strong text-text hover:border-accent hover:bg-accent-soft focus-visible:outline-accent flex min-h-[108px] flex-1 items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed px-[18px] py-4 text-left transition-colors focus-visible:outline-2 disabled:opacity-60"
					>
						<span className="text-accent-fg shrink-0">
							{opening?.way === 'hand' ? <SpinnerIcon size={28} /> : <VideoIcon size={28} />}
						</span>
						<span className="min-w-0">
							<b className="block font-semibold">{t('hand.upload')}</b>
							<small className="text-text-faint mt-0.5 block text-[13px]">
								{t('dropHint')} · {t('hand.formats')}
							</small>
						</span>
						<span className="text-text-faint group-hover:text-accent-fg ml-auto">
							<ArrowRightIcon size={18} />
						</span>
					</button>
					<FileInput
						inputRef={handInput}
						label={t('hand.inputLabel')}
						onFile={(file) => start(file, 'hand')}
					/>
				</DropCard>
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

/** A way in's heading: its icon, its name and what it does, and a tag on the recommended one. */
function CardHead({
	id,
	icon,
	iconClass,
	title,
	body,
	tag
}: {
	id: string
	icon: React.ReactNode
	iconClass: string
	title: string
	body: string
	tag?: string
}) {
	return (
		<div className="relative flex items-start gap-3.5">
			<span
				className={cn(
					'flex size-11 shrink-0 items-center justify-center rounded-[13px]',
					iconClass
				)}
			>
				{icon}
			</span>
			<div className="min-w-0 flex-1">
				<h2 id={id} className="text-text text-[22px] leading-tight tracking-[-0.02em]">
					{title}
				</h2>
				<p className="text-text-muted mt-1 text-[14.5px]">{body}</p>
			</div>
			{tag && (
				<span className="bg-accent-soft text-accent-fg rounded-full px-[9px] py-[5px] font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap uppercase max-[520px]:hidden">
					{tag}
				</span>
			)}
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
				'relative flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-[22px] border border-transparent px-6 py-[22px] transition-[box-shadow,border-color]',
				dragging && 'ring-accent-glow ring-4',
				className
			)}
		>
			{children}
			{dragging && (
				<div className="bg-accent-soft text-accent-fg pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] text-sm font-semibold backdrop-blur-sm">
					{t('dropHere')}
				</div>
			)}
		</section>
	)
}

/** The hidden file picker behind a way in's button. */
function FileInput({
	inputRef,
	label,
	onFile
}: {
	inputRef: React.RefObject<HTMLInputElement | null>
	label: string
	onFile: (file: File) => void
}) {
	return (
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
	)
}
