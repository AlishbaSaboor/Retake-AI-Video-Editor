'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AiIcon, SpinnerIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { parseEditCommand } from './actions'
import { CommandReply } from './command-reply'
import {
	commandToPlan,
	type CommandContext,
	type CommandOutcome,
	type CommandPlan
} from './edit-command'

const AI_ICON_SIZE = 20

type CommandBarProps = {
	/** The editor as it is now, which every command is checked against before it's offered. */
	context: CommandContext
	hasWatermark: boolean
	onApply: (plan: CommandPlan) => void
	/** A command brought from the home page: asked as soon as the bar appears, still applied only on Apply. */
	initialCommand?: string | null
}

/**
 * Type an edit in plain English; Gemini parses it, and nothing changes until
 * the user confirms the plan it shows — an AI misreading a command should
 * cost a click on Cancel, not an Undo. A command it can't do gets a plain
 * answer listing what it can, not an error.
 */
export function CommandBar({ context, hasWatermark, onApply, initialCommand }: CommandBarProps) {
	const t = useTranslations('Editor.command')
	const [command, setCommand] = useState(initialCommand ?? '')
	const [reply, setReply] = useState<{ command: string; outcome: CommandOutcome } | null>(null)

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
			setReply({ command: text, outcome: commandToPlan(parsed, context) })
		},
		onError: (error) => {
			toast({ variant: 'destructive', title: t('failed'), description: error.message })
		}
	})

	// Asked once, though development runs effects twice: each ask is a paid call.
	const askedRef = useRef(false)
	const ask = useEffectEvent((text: string) => parse.mutate(text))
	useEffect(() => {
		if (askedRef.current || !initialCommand?.trim()) return
		askedRef.current = true
		ask(initialCommand)
	}, [initialCommand])

	function applyPlan() {
		if (!reply?.outcome.ok) return
		onApply(reply.outcome.plan)
		setReply(null)
		setCommand('')
	}

	return (
		<div className="flex flex-col gap-2">
			{/* The focus ring lives on the card (focus-within), so the input itself
			    drops its own outline rather than drawing a second one inside it. */}
			<form
				className="border-border bg-surface focus-within:border-accent focus-within:ring-accent-glow flex items-center gap-1 rounded-xl border p-1.5 shadow-lg transition-shadow focus-within:ring-2"
				onSubmit={(event) => {
					event.preventDefault()
					if (!command.trim()) return
					setReply(null)
					parse.mutate(command)
				}}
			>
				<span className="text-accent pr-1 pl-2">
					<AiIcon size={AI_ICON_SIZE} />
				</span>
				<Input
					value={command}
					onChange={(event) => setCommand(event.target.value)}
					placeholder={t('placeholder')}
					aria-label={t('label')}
					disabled={parse.isPending}
					className="border-0 bg-transparent focus-visible:outline-none"
				/>
				<Button
					type="submit"
					disabled={parse.isPending || !command.trim()}
					className="shadow-accent-glow shrink-0 rounded-lg px-4 text-xs shadow-md"
				>
					{parse.isPending && <SpinnerIcon />}
					{t('submit')}
				</Button>
			</form>
			{reply && (
				<CommandReply
					command={reply.command}
					outcome={reply.outcome}
					durationSeconds={context.durationSeconds}
					hasWatermark={hasWatermark}
					onApply={applyPlan}
					onDismiss={() => setReply(null)}
				/>
			)}
		</div>
	)
}
