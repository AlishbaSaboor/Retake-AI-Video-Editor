'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AiIcon, SpinnerIcon } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { parseEditCommand } from './actions'
import { CommandReply } from './command-reply'
import { commandToTrim, type CommandOutcome } from './edit-command'
import type { TrimRange } from './timeline-scale'

const AI_ICON_SIZE = 20

type CommandBarProps = {
	durationSeconds: number
	onTrim: (range: TrimRange) => void
}

/**
 * Type an edit in plain English; Gemini parses it, and nothing changes until
 * the user confirms the plan it shows — an AI misreading a command should
 * cost a click on Cancel, not an Undo. A command it can't do gets a plain
 * answer listing what it can, not an error.
 */
export function CommandBar({ durationSeconds, onTrim }: CommandBarProps) {
	const t = useTranslations('Editor.command')
	const [command, setCommand] = useState('')
	const [reply, setReply] = useState<{ command: string; outcome: CommandOutcome } | null>(null)

	const parse = useMutation({
		mutationFn: async (text: string) => {
			const result = await parseEditCommand({ command: text, durationSeconds })
			if (!result.ok) throw new Error(result.error)
			return result.data
		},
		onSuccess: (parsed, text) => {
			setReply({ command: text, outcome: commandToTrim(parsed, durationSeconds) })
		},
		onError: (error) => {
			toast({ variant: 'destructive', title: t('failed'), description: error.message })
		}
	})

	function applyPlan() {
		if (!reply?.outcome.ok) return
		onTrim(reply.outcome.range)
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
					durationSeconds={durationSeconds}
					onApply={applyPlan}
					onDismiss={() => setReply(null)}
				/>
			)}
		</div>
	)
}
