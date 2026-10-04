'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { AttachIcon, SendIcon, SparkleIcon, SpinnerIcon } from '@/components/ui/icons'
import { toast } from '@/lib/toast'
import { parseEditCommand } from './actions'
import { CommandReply } from './command-reply'
import {
	commandToPlan,
	type CommandContext,
	type CommandOutcome,
	type CommandPlan
} from './edit-command'
import { VoiceCommandButton } from './voice-command-button'

/** What an attached file became, for the chat to say so. */
export type AttachedAs = 'video' | 'logo' | 'audio' | 'unknown'

type CommandBarProps = {
	/** The editor as it is now, which every command is checked against before it's offered. */
	context: CommandContext
	hasWatermark: boolean
	onApply: (plan: CommandPlan) => void
	/** A file attached in the chat, handed to the editor to use as what it is. */
	onAttach: (file: File) => AttachedAs
	/** A command brought from the home page: asked as soon as the chat appears, still applied only on Apply. */
	initialCommand?: string | null
}

type Answer = {
	id: number
	type: 'command'
	command: string
	outcome: CommandOutcome
	resolved?: 'applied' | 'cancelled'
}
type Entry = Answer | { id: number; type: 'note'; text: string }

const EXAMPLES = ['cleanup', 'captions', 'title'] as const

/**
 * The editor's chat. Type (or speak) an edit in plain English; Gemini parses
 * it, and nothing changes until the user confirms the plan it shows — an AI
 * misreading a command should cost a click on Cancel, not an Undo. A command
 * it can't do gets a plain answer listing what it can, not an error. Earlier
 * answers stay above as a record; only the latest can be applied.
 */
export function CommandBar({
	context,
	hasWatermark,
	onApply,
	onAttach,
	initialCommand
}: CommandBarProps) {
	const t = useTranslations('Editor.command')
	const [command, setCommand] = useState(initialCommand ?? '')
	const [entries, setEntries] = useState<Entry[]>([])
	const nextIdRef = useRef(0)
	const endRef = useRef<HTMLDivElement>(null)
	const open = entries.findLast(
		(entry): entry is Answer => entry.type === 'command' && !entry.resolved
	)

	/** The open answer, if any, closed as applied or cancelled. */
	function resolve(resolved: 'applied' | 'cancelled') {
		setEntries((all) =>
			all.map((entry) =>
				entry.type === 'command' && !entry.resolved ? { ...entry, resolved } : entry
			)
		)
	}

	const parse = useMutation({
		mutationFn: async (text: string) => {
			const result = await parseEditCommand({
				command: text,
				durationSeconds: context.durationSeconds,
				clipCount: context.clipCount
			})
			if (!result.ok) throw new Error(result.error)
			return result.data
		},
		onSuccess: (parsed, text) => {
			const id = nextIdRef.current++
			const outcome = commandToPlan(parsed, context)
			setEntries((all) => [...all, { id, type: 'command', command: text, outcome }])
		},
		onError: (error) => {
			toast({ variant: 'destructive', title: t('failed'), description: error.message })
		}
	})

	function ask(text: string) {
		if (!text.trim() || parse.isPending) return
		// A new command closes any answer still open: it was passed over.
		resolve('cancelled')
		parse.mutate(text)
	}

	// Asked once, though development runs effects twice: each ask is a paid call.
	const askedRef = useRef(false)
	const askFirst = useEffectEvent((text: string) => ask(text))
	useEffect(() => {
		if (askedRef.current || !initialCommand?.trim()) return
		askedRef.current = true
		askFirst(initialCommand)
	}, [initialCommand])

	// The newest message in view.
	const count = entries.length
	const thinking = parse.isPending
	useEffect(() => {
		endRef.current?.scrollIntoView({ block: 'nearest' })
	}, [count, thinking])

	function applyPlan() {
		if (!open?.outcome.ok) return
		onApply(open.outcome.plan)
		resolve('applied')
		setCommand('')
	}

	function attach(file: File) {
		const as = onAttach(file)
		const id = nextIdRef.current++
		const text = t(`chat.attached.${as}`, { name: file.name })
		setEntries((all) => [...all, { id, type: 'note', text }])
	}

	return (
		<section aria-label={t('chat.label')} className="flex h-full min-h-0 flex-col">
			<div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
				<div className="flex gap-2">
					<span
						aria-hidden
						className="bg-accent-soft text-accent mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
					>
						<SparkleIcon size={14} />
					</span>
					<div className="flex flex-col gap-2">
						<p className="bg-surface-hover text-text rounded-lg rounded-tl-sm px-3 py-2 text-sm">
							{t('chat.intro')}
						</p>
						{entries.length === 0 && (
							<div className="flex flex-wrap gap-1.5">
								{EXAMPLES.map((example) => (
									<button
										key={example}
										type="button"
										onClick={() => setCommand(t(`chat.example.${example}`))}
										className="border-border text-text-muted hover:border-accent hover:text-text focus-visible:outline-accent rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2"
									>
										{t(`chat.example.${example}`)}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
				{entries.map((entry) =>
					entry.type === 'note' ? (
						<p key={entry.id} className="text-text-muted self-center px-2 text-center text-xs">
							{entry.text}
						</p>
					) : (
						<div key={entry.id} className="flex flex-col gap-2">
							<p className="bg-accent text-accent-ink max-w-[85%] self-end rounded-lg rounded-br-sm px-3 py-2 text-sm">
								{entry.command}
							</p>
							<CommandReply
								command={entry.command}
								outcome={entry.outcome}
								durationSeconds={context.durationSeconds}
								hasWatermark={hasWatermark}
								resolved={entry.resolved}
								onApply={applyPlan}
								onDismiss={() => resolve('cancelled')}
							/>
						</div>
					)
				)}
				{thinking && (
					<div className="flex flex-col gap-2">
						<p className="bg-accent text-accent-ink max-w-[85%] self-end rounded-lg rounded-br-sm px-3 py-2 text-sm">
							{parse.variables}
						</p>
						<p role="status" className="text-text-muted flex items-center gap-2 text-xs">
							<SpinnerIcon />
							{t('chat.thinking')}
						</p>
					</div>
				)}
				<div ref={endRef} />
			</div>
			<form
				className="border-border border-t p-3"
				onSubmit={(event) => {
					event.preventDefault()
					ask(command)
				}}
			>
				{/* The focus ring lives on the card (focus-within), so the field drops its own. */}
				<div className="border-border bg-surface-inset focus-within:border-accent focus-within:ring-accent-glow flex flex-col rounded-lg border transition-shadow focus-within:ring-2">
					<textarea
						value={command}
						onChange={(event) => setCommand(event.target.value)}
						onKeyDown={(event) => {
							// Enter sends; Shift+Enter is a new line.
							if (event.key !== 'Enter' || event.shiftKey) return
							event.preventDefault()
							ask(command)
						}}
						rows={2}
						placeholder={t('placeholder')}
						aria-label={t('label')}
						disabled={thinking}
						className="text-text placeholder:text-text-faint w-full resize-none bg-transparent px-3 pt-2.5 text-sm focus-visible:outline-none"
					/>
					<div className="flex items-center gap-1 px-1.5 pb-1.5">
						<label
							title={t('chat.attachHint')}
							className="text-text-muted hover:bg-surface-hover hover:text-text has-[:focus-visible]:outline-accent inline-flex size-9 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:outline-2"
						>
							<AttachIcon size={18} />
							<input
								type="file"
								accept="video/*,audio/*,image/png,image/jpeg"
								aria-label={t('chat.attach')}
								className="sr-only"
								onChange={(event) => {
									const file = event.currentTarget.files?.[0]
									event.currentTarget.value = ''
									if (file) attach(file)
								}}
							/>
						</label>
						<VoiceCommandButton
							disabled={thinking}
							onText={(text) =>
								setCommand((typed) => (typed.trim() ? `${typed.trim()} ${text}` : text))
							}
						/>
						<button
							type="submit"
							aria-label={t('submit')}
							title={t('submit')}
							disabled={thinking || !command.trim()}
							className="bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-accent ml-auto inline-flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
						>
							{thinking ? <SpinnerIcon /> : <SendIcon size={16} />}
						</button>
					</div>
				</div>
			</form>
		</section>
	)
}
