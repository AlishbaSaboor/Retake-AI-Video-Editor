'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	clampLevel,
	gradeFilterId,
	isNeutral,
	matrixValues,
	type ColorMatrix,
	LEVELS,
	LOOKS,
	MAX_LEVEL,
	NEUTRAL_GRADE,
	type ColorGrade,
	type Level
} from './color-grade'
import { MoreInfo } from './more-info'

const PERCENT = 100
const LEVEL_STEP_PERCENT = 5

/**
 * The preview's grade filters: one SVG feColorMatrix per distinct grade,
 * which the <video> uses as `filter: url(#id)` (gradeFilterId with the same
 * prefix). Hidden, and taking no room.
 */
export function GradeFilters({ prefix, matrices }: { prefix: string; matrices: ColorMatrix[] }) {
	const values = [...new Set(matrices.map(matrixValues))]
	return (
		<svg aria-hidden width={0} height={0} className="absolute">
			{values.map((value) => (
				<filter key={value} id={gradeFilterId(prefix, value)} colorInterpolationFilters="sRGB">
					<feColorMatrix type="matrix" values={value} />
				</filter>
			))}
		</svg>
	)
}

type ColorPanelProps = {
	/** The whole video's adjustments. */
	video: ColorGrade
	/** Each clip's own, on top of the video's; undefined where it has none. */
	clips: (ColorGrade | undefined)[]
	/** False outside the Edited view: colors are set on the edit. */
	canEdit: boolean
	/** Sets the whole video's (clip null) or one clip's (by index) adjustments: one change. */
	onChange: (clip: number | null, grade: ColorGrade) => void
}

/**
 * Brightness, contrast, saturation and a look, for the whole video or one
 * clip (on top of the whole video's). A slider drag is one change, on
 * release; a look or a reset is one change at once.
 */
export function ColorPanel({ video, clips, canEdit, onChange }: ColorPanelProps) {
	const t = useTranslations('Editor.color')
	// Which grade the controls show: null for the whole video, else a clip's index.
	const [scope, setScope] = useState<number | null>(null)
	const target = scope !== null && scope < clips.length ? scope : null
	const grade = target === null ? video : (clips[target] ?? NEUTRAL_GRADE)
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			<div role="group" aria-label={t('scope')} className="flex flex-wrap gap-1">
				{[null, ...clips.keys()].map((option) => (
					<Button
						key={option ?? 'video'}
						type="button"
						size="sm"
						variant={option === target ? 'secondary' : 'ghost'}
						aria-pressed={option === target}
						onClick={() => setScope(option)}
					>
						{option === null ? t('wholeVideo') : t('clip', { number: option + 1 })}
					</Button>
				))}
			</div>
			<GradeControls
				// Follows what's set and where, so an undo or a new scope resets the sliders.
				key={`${target ?? 'video'}-${JSON.stringify(grade)}`}
				grade={grade}
				canEdit={canEdit}
				onChange={(next) => onChange(target, next)}
			/>
			<MoreInfo>{t('hint')}</MoreInfo>
		</section>
	)
}

function GradeControls({
	grade,
	canEdit,
	onChange
}: {
	grade: ColorGrade
	canEdit: boolean
	onChange: (grade: ColorGrade) => void
}) {
	const t = useTranslations('Editor.color')
	const id = useId()
	const [levels, setLevels] = useState({
		brightness: Math.round(grade.brightness * PERCENT),
		contrast: Math.round(grade.contrast * PERCENT),
		saturation: Math.round(grade.saturation * PERCENT)
	})

	function commit(level: Level) {
		const next = clampLevel(levels[level] / PERCENT)
		if (next !== grade[level]) onChange({ ...grade, [level]: next })
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-4">
				{LEVELS.map((level) => (
					<div key={level} className="flex min-w-40 flex-1 flex-col gap-1">
						<Label htmlFor={`${id}-${level}`}>
							{t(`levels.${level}`, { percent: levels[level] })}
						</Label>
						<input
							id={`${id}-${level}`}
							type="range"
							min={0}
							max={MAX_LEVEL * PERCENT}
							step={LEVEL_STEP_PERCENT}
							value={levels[level]}
							disabled={!canEdit}
							onChange={(event) => setLevels({ ...levels, [level]: event.target.valueAsNumber })}
							onPointerUp={() => commit(level)}
							onKeyUp={() => commit(level)}
							onBlur={() => commit(level)}
							className="accent-accent h-9"
						/>
					</div>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<div role="group" aria-label={t('look')} className="flex flex-wrap gap-1">
					{LOOKS.map((look) => (
						<Button
							key={look}
							type="button"
							size="sm"
							variant={grade.look === look ? 'secondary' : 'ghost'}
							aria-pressed={grade.look === look}
							disabled={!canEdit}
							onClick={() => grade.look !== look && onChange({ ...grade, look })}
						>
							{t(`looks.${look}`)}
						</Button>
					))}
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="ml-auto"
					disabled={!canEdit || isNeutral(grade)}
					onClick={() => onChange(NEUTRAL_GRADE)}
				>
					{t('reset')}
				</Button>
			</div>
		</div>
	)
}
