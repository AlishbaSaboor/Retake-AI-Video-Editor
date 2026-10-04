'use client'

import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalDegrees } from './logo'

/**
 * A turn in degrees, clockwise, typed: one change on Enter or leaving the
 * field, written the short way round. Render with a `key` that follows
 * `degrees`, so a drag or an undo resets what's typed.
 */
export function DegreesField({
	label,
	degrees,
	onChange
}: {
	label: string
	degrees: number
	onChange: (degrees: number) => void
}) {
	const id = useId()
	const [typed, setTyped] = useState(String(degrees))

	function commit() {
		const value = Number.parseFloat(typed)
		const next = Number.isFinite(value) ? normalDegrees(Math.round(value)) : degrees
		if (next === degrees) return setTyped(String(degrees))
		onChange(next)
	}

	return (
		<form
			className="flex w-28 flex-col gap-1"
			onSubmit={(event) => {
				event.preventDefault()
				commit()
			}}
		>
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="number"
				min={-180}
				max={180}
				step={1}
				value={typed}
				onChange={(event) => setTyped(event.target.value)}
				onBlur={commit}
			/>
		</form>
	)
}
