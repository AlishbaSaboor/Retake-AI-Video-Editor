'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDownIcon, DrawIcon, ImageIcon, InfoIcon, TextIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import type { Annotation } from '../../overlays/annotations'
import type { LowerThird } from '../../overlays/motion'
import type { TitleCard, Watermark } from '../../overlays/overlays'
import { formatTimecode } from '../../model/timeline-scale'
import { DEFAULT_TEXT_STYLE, MAX_TEXT_SIZE, MIN_TEXT_SIZE } from '../../overlays/text-style'
import { MAX_LOGO_SIZE, MIN_LOGO_SIZE } from '../../overlays/logo'
import { WATERMARK_WIDTH_FRACTION } from '../../overlays/overlays'

/** What's picked on the video: one thing at a time. */
export type Picked =
	{ kind: 'title' } | { kind: 'logo' } | { kind: 'lowerThird' } | { kind: 'annotation'; id: string }

/** The kinds the Annotate tool adds with one click (text is under Text & logo). */
export const MARK_KINDS = ['box', 'blur', 'pixelate'] as const
export type MarkKind = (typeof MARK_KINDS)[number]

const PERCENT = 100
const SIZE_STEP = 0.05

/** An item in "On this video": its name, when it shows, and whether it's picked. */
type Listed = { key: string; name: string; when: string; picked: boolean; onPick: () => void }

/** The things on the video, listed: click one to pick it on the video too. */
function OnThisVideo({ items, empty }: { items: Listed[]; empty: string }) {
	const t = useTranslations('Editor.onVideo')
	return (
		<section aria-label={t('listLabel')} className="flex flex-col gap-2">
			<h3 className="text-text text-sm font-semibold">{t('listLabel')}</h3>
			{items.length === 0 ? (
				<p className="text-text-faint text-sm">{empty}</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{items.map((item) => (
						<li key={item.key}>
							<button
								type="button"
								aria-pressed={item.picked}
								onClick={item.onPick}
								className={cn(
									'focus-visible:outline-accent flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left focus-visible:outline-2',
									item.picked
										? 'border-accent bg-accent-soft'
										: 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover'
								)}
							>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="text-text truncate text-sm font-medium">{item.name}</span>
									<span className="text-text-muted text-xs">{item.when}</span>
								</span>
								{item.picked && (
									<span className="text-accent-fg font-mono text-[10px] tracking-wider uppercase">
										{t('selected')}
									</span>
								)}
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}

/** How to move and resize what's picked, said once it's there. */
function MoveHint({ text }: { text: string }) {
	return (
		<p className="bg-surface-inset text-text-muted flex gap-2 rounded-lg p-3 text-sm">
			<InfoIcon className="mt-0.5 shrink-0" />
			{text}
		</p>
	)
}

/** The advanced fields, folded away until wanted. */
export function MoreOptions({ children }: { children: React.ReactNode }) {
	const t = useTranslations('Editor.onVideo')
	return (
		<details data-more-options className="group border-border rounded-lg border">
			<summary className="text-text hover:bg-surface-hover focus-visible:outline-accent flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
				{t('moreOptions')}
				<ChevronDownIcon className="transition-transform group-open:rotate-180" />
			</summary>
			<div className="flex flex-col gap-4 p-1 pt-0">{children}</div>
		</details>
	)
}

/** A big button that adds something to the video straight away. */
function AddButton({
	icon,
	label,
	description,
	disabled,
	onClick
}: {
	icon: React.ReactNode
	label: string
	description: string
	disabled?: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			aria-label={description}
			title={description}
			disabled={disabled}
			onClick={onClick}
			className="border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover focus-visible:outline-accent flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-medium focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40"
		>
			{icon}
			{label}
		</button>
	)
}

/** A field for the picked item's words: one change on Enter or leaving it. */
function WordsField({
	label,
	words,
	onChange
}: {
	label: string
	words: string
	onChange: (words: string) => void
}) {
	const id = useId()
	const [typed, setTyped] = useState(words)
	const commit = () => {
		const next = typed.trim()
		if (next && next !== words) onChange(next)
		else setTyped(words)
	}
	return (
		<form
			className="flex flex-col gap-1"
			onSubmit={(event) => {
				event.preventDefault()
				commit()
			}}
		>
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				data-picked-words
				value={typed}
				onChange={(event) => setTyped(event.target.value)}
				onBlur={commit}
			/>
		</form>
	)
}

/** A slider for the picked item's size: one change when let go. */
function SizeSlider({
	label,
	value,
	min,
	max,
	step,
	onChange
}: {
	label: string
	value: number
	min: number
	max: number
	step: number
	onChange: (value: number) => void
}) {
	const id = useId()
	const [dragged, setDragged] = useState<number | null>(null)
	const commit = () => {
		if (dragged !== null && dragged !== value) onChange(dragged)
		setDragged(null)
	}
	return (
		<div className="flex flex-col gap-1">
			<Label htmlFor={id}>{label}</Label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={dragged ?? value}
				onChange={(event) => setDragged(Number(event.target.value))}
				onPointerUp={commit}
				onKeyUp={commit}
				onBlur={commit}
				className="accent-accent w-full"
			/>
		</div>
	)
}

const when = (start: number, end: number) => `${formatTimecode(start)} – ${formatTimecode(end)}`

/**
 * Text & logo: Title, Text and Logo each go on the video at once, picked,
 * with handles to drag and resize; what's on the video is listed below, and
 * the picked one's words and size are here. Everything else (timing, style,
 * motion, the lower third, the logo's corner) is in More options.
 */
export function TextLogoPanel({
	title,
	lowerThird,
	watermark,
	texts,
	picked,
	canEdit,
	onPick,
	onAddTitle,
	onAddText,
	onAddLogo,
	onTitleChange,
	onTextChange,
	onLogoSize,
	more
}: {
	title: TitleCard | null
	lowerThird: LowerThird | null
	watermark: Watermark | null
	/** The text annotations, with their numbers as the lane names them. */
	texts: Array<{ item: Extract<Annotation, { kind: 'text' }>; number: number }>
	picked: Picked | null
	canEdit: boolean
	onPick: (picked: Picked) => void
	onAddTitle: () => void
	onAddText: () => void
	onAddLogo: () => void
	onTitleChange: (title: TitleCard) => void
	onTextChange: (item: Annotation) => void
	onLogoSize: (size: number) => void
	/** The full fields (GraphicsPanel), in More options. */
	more: React.ReactNode
}) {
	const t = useTranslations('Editor.onVideo')
	const isPicked = (kind: Picked['kind'], id?: string) =>
		picked?.kind === kind && (picked.kind !== 'annotation' || picked.id === id)
	const items: Listed[] = [
		...(title
			? [
					{
						key: 'title',
						name: title.text,
						when: `${t('kinds.title')} · ${when(title.startSeconds, title.startSeconds + title.durationSeconds)}`,
						picked: isPicked('title'),
						onPick: () => onPick({ kind: 'title' })
					}
				]
			: []),
		...(lowerThird
			? [
					{
						key: 'lower',
						name: lowerThird.name,
						when: `${t('kinds.lowerThird')} · ${when(lowerThird.startSeconds, lowerThird.startSeconds + lowerThird.durationSeconds)}`,
						picked: isPicked('lowerThird'),
						onPick: () => onPick({ kind: 'lowerThird' })
					}
				]
			: []),
		...texts.map(({ item, number }) => ({
			key: item.id,
			name: item.text,
			when: `${t('kinds.text', { number })} · ${when(item.startSeconds, item.endSeconds)}`,
			picked: isPicked('annotation', item.id),
			onPick: () => onPick({ kind: 'annotation', id: item.id })
		})),
		...(watermark
			? [
					{
						key: 'logo',
						name: t('kinds.logo'),
						when: t('wholeVideo'),
						picked: isPicked('logo'),
						onPick: () => onPick({ kind: 'logo' })
					}
				]
			: [])
	]
	const pickedText =
		picked?.kind === 'annotation'
			? texts.find(({ item }) => item.id === picked.id)?.item
			: undefined

	return (
		<>
			<div className="grid grid-cols-3 gap-2">
				<AddButton
					icon={<span className="font-display text-lg leading-none font-bold">Aa</span>}
					label={t('add.title')}
					description={title ? t('add.titleAgain') : t('add.titleHelp')}
					disabled={!canEdit}
					onClick={onAddTitle}
				/>
				<AddButton
					icon={<TextIcon size={20} />}
					label={t('add.text')}
					description={t('add.textHelp')}
					disabled={!canEdit}
					onClick={onAddText}
				/>
				<AddButton
					icon={<ImageIcon size={20} />}
					label={t('add.logo')}
					description={watermark ? t('add.logoAgain') : t('add.logoHelp')}
					disabled={!canEdit}
					onClick={onAddLogo}
				/>
			</div>
			<OnThisVideo items={items} empty={t('emptyText')} />
			{picked && picked.kind !== 'lowerThird' && <MoveHint text={t('moveHint')} />}
			{picked?.kind === 'title' && title && (
				<>
					<WordsField
						key={`title-${title.text}`}
						label={t('titleWords')}
						words={title.text}
						onChange={(text) => onTitleChange({ ...title, text })}
					/>
					<SizeSlider
						key={`title-size-${title.style?.size ?? 1}`}
						label={t('size')}
						value={(title.style ?? DEFAULT_TEXT_STYLE).size}
						min={MIN_TEXT_SIZE}
						max={MAX_TEXT_SIZE}
						step={SIZE_STEP}
						onChange={(size) =>
							onTitleChange({ ...title, style: { ...(title.style ?? DEFAULT_TEXT_STYLE), size } })
						}
					/>
				</>
			)}
			{pickedText && (
				<>
					<WordsField
						key={`text-${pickedText.id}-${pickedText.text}`}
						label={t('textWords')}
						words={pickedText.text}
						onChange={(text) => onTextChange({ ...pickedText, text })}
					/>
					<SizeSlider
						key={`text-size-${pickedText.id}-${pickedText.style?.size ?? 1}`}
						label={t('size')}
						value={(pickedText.style ?? DEFAULT_TEXT_STYLE).size}
						min={MIN_TEXT_SIZE}
						max={MAX_TEXT_SIZE}
						step={SIZE_STEP}
						onChange={(size) =>
							onTextChange({
								...pickedText,
								style: { ...(pickedText.style ?? DEFAULT_TEXT_STYLE), size }
							})
						}
					/>
				</>
			)}
			{picked?.kind === 'logo' && watermark && (
				<SizeSlider
					key={`logo-size-${watermark.size ?? WATERMARK_WIDTH_FRACTION}`}
					label={t('size')}
					value={(watermark.size ?? WATERMARK_WIDTH_FRACTION) * PERCENT}
					min={MIN_LOGO_SIZE * PERCENT}
					max={MAX_LOGO_SIZE * PERCENT}
					step={1}
					onChange={(percent) => onLogoSize(percent / PERCENT)}
				/>
			)}
			<MoreOptions>{more}</MoreOptions>
		</>
	)
}

/**
 * Annotate: a box, a blur or a pixelate goes on the video at once, picked,
 * with handles; the pencil draws freehand. What's drawn is listed below.
 * The tools by hand (select, draw by dragging, the eraser), colours and each
 * item's timing lane are in More options.
 */
export function AnnotatePanel({
	marks,
	picked,
	drawing,
	canEdit,
	onPick,
	onAdd,
	onDraw,
	more
}: {
	marks: Array<{ item: Annotation; number: number }>
	picked: Picked | null
	/** Whether the pencil is out. */
	drawing: boolean
	canEdit: boolean
	onPick: (picked: Picked) => void
	onAdd: (kind: MarkKind) => void
	onDraw: (on: boolean) => void
	more: React.ReactNode
}) {
	const t = useTranslations('Editor.onVideo')
	const ta = useTranslations('Editor.annotations')
	const items: Listed[] = marks.map(({ item, number }) => ({
		key: item.id,
		name: ta('item', { kind: ta(`kinds.${item.kind}`), number }),
		when: when(item.startSeconds, item.endSeconds),
		picked: picked?.kind === 'annotation' && picked.id === item.id,
		onPick: () => onPick({ kind: 'annotation', id: item.id })
	}))
	return (
		<>
			<div className="grid grid-cols-2 gap-2">
				{MARK_KINDS.map((kind) => (
					<AddButton
						key={kind}
						icon={<span aria-hidden className={cn('size-5 rounded', MARK_LOOKS[kind])} />}
						label={ta(`kinds.${kind}`)}
						description={t(`add.${kind}Help`)}
						disabled={!canEdit}
						onClick={() => onAdd(kind)}
					/>
				))}
				<button
					type="button"
					aria-pressed={drawing}
					disabled={!canEdit}
					onClick={() => onDraw(!drawing)}
					className={cn(
						'focus-visible:outline-accent flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-medium focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40',
						drawing
							? 'border-accent bg-accent-soft text-accent-fg'
							: 'border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover'
					)}
				>
					<DrawIcon size={20} />
					{ta('kinds.pencil')}
				</button>
			</div>
			{drawing && <MoveHint text={t('drawHint')} />}
			<OnThisVideo items={items} empty={t('emptyMarks')} />
			{picked?.kind === 'annotation' && !drawing && <MoveHint text={t('moveHint')} />}
			<MoreOptions>{more}</MoreOptions>
		</>
	)
}

const MARK_LOOKS: Record<MarkKind, string> = {
	box: 'border-2 border-current',
	blur: 'bg-current/30 blur-[2px]',
	pixelate:
		'bg-[conic-gradient(currentColor_25%,transparent_0_50%,currentColor_0_75%,transparent_0)] bg-[length:8px_8px] opacity-60'
}
