'use client'

import { useCallback, useRef } from 'react'
import { trackFieldChanged } from './track'
import type { FieldType } from './events'

// Emits field_changed the first time a field is actually edited during a focus
// session — not on every keystroke (which would flood) and not on focus alone
// (which isn't a change). Returns handlers to spread onto an input:
//
//   const nameField = useTrackedField({ fieldName: 'display_name', fieldType: 'text' })
//   <Input {...nameField} />
//
// Records only that the field changed, never its value (rule 5 — a field value
// is free text and often PII). field_state defaults to 'changed'; onBlur reports
// 'completed' if it was touched, so you can see start-vs-finish per field.
export function useTrackedField({
	fieldName,
	fieldType
}: {
	fieldName: string
	fieldType: FieldType
}) {
	const changed = useRef(false)

	const onChange = useCallback(() => {
		if (changed.current) return
		changed.current = true
		trackFieldChanged({ field_name: fieldName, field_type: fieldType, field_state: 'changed' })
	}, [fieldName, fieldType])

	const onBlur = useCallback(() => {
		if (!changed.current) return
		changed.current = false
		trackFieldChanged({ field_name: fieldName, field_type: fieldType, field_state: 'completed' })
	}, [fieldName, fieldType])

	return { onChange, onBlur }
}
