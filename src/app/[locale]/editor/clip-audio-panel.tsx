'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clampVolume, DEFAULT_CLIP_AUDIO, MAX_VOLUME, type ClipAudio } from './clip-audio'
import type { Clip } from './sequence'

const PERCENT = 100
const VOLUME_STEP_PERCENT = 5
const FADE_STEP_SECONDS = 0.1

type ClipAudioPanelProps = {
	clips: Clip[]
	/** False outside the Edited view: the sound is set on the edit. */
	canEdit: boolean
	onChange: (index: number, audio: ClipAudio) => void
}

/**
 * Each clip's volume (0 to 200%), mute, and fade in and out. A slider drag
 * is one change, on release; a typed fade length is one change, on Enter or
 * leaving the field.
 */
export function ClipAudioPanel({ clips, canEdit, onChange }: ClipAudioPanelProps) {
	const t = useTranslations('Editor.clipAudio')
	return (
		<section
			aria-label={t('label')}
			className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-4 shadow-xl"
		>
			<h2 className="text-text text-xs font-bold tracking-wider uppercase">{t('label')}</h2>
			{clips.map((clip, index) => (
				<ClipAudioRow
					// Follows the clip's sound, so an undo resets what's typed.
					key={`${clip.id}-${JSON.stringify(clip.audio ?? null)}`}
					number={index + 1}
					audio={clip.audio ?? DEFAULT_CLIP_AUDIO}
					canEdit={canEdit}
					onChange={(audio) => onChange(index, audio)}
				/>
			))}
			<p className="text-text-muted text-xs">{t('hint')}</p>
		</section>
	)
}

function ClipAudioRow({
	number,
	audio,
	canEdit,
	onChange
}: {
	number: number
	audio: ClipAudio
	canEdit: boolean
	onChange: (audio: ClipAudio) => void
}) {
	const t = useTranslations('Editor.clipAudio')
	const id = useId()
	const [volume, setVolume] = useState(Math.round(audio.volume * PERCENT))
	const [fadeIn, setFadeIn] = useState(String(audio.fadeInSeconds))
	const [fadeOut, setFadeOut] = useState(String(audio.fadeOutSeconds))

	function commitVolume() {
		const next = clampVolume(volume / PERCENT)
		if (next !== audio.volume) onChange({ ...audio, volume: next })
	}

	function commitFade(field: 'fadeInSeconds' | 'fadeOutSeconds', typed: string) {
		const seconds = Number.parseFloat(typed)
		if (!Number.isFinite(seconds) || seconds < 0) {
			setFadeIn(String(audio.fadeInSeconds))
			setFadeOut(String(audio.fadeOutSeconds))
			return
		}
		if (seconds !== audio[field]) onChange({ ...audio, [field]: seconds })
	}

	const name = t('clip', { number })
	return (
		<div role="group" aria-label={name} className="flex flex-wrap items-end gap-3">
			<span className="text-text w-14 shrink-0 pb-2 text-xs font-medium">{name}</span>
			<div className="flex min-w-48 flex-1 flex-col gap-1">
				<Label htmlFor={`${id}-volume`}>{t('volume', { percent: volume })}</Label>
				<input
					id={`${id}-volume`}
					type="range"
					min={0}
					max={MAX_VOLUME * PERCENT}
					step={VOLUME_STEP_PERCENT}
					value={volume}
					disabled={!canEdit}
					onChange={(event) => setVolume(event.target.valueAsNumber)}
					onPointerUp={commitVolume}
					onKeyUp={commitVolume}
					onBlur={commitVolume}
					className="accent-accent h-9"
				/>
			</div>
			<Button
				type="button"
				size="sm"
				variant={audio.muted ? 'secondary' : 'ghost'}
				aria-pressed={audio.muted}
				disabled={!canEdit}
				onClick={() => onChange({ ...audio, muted: !audio.muted })}
			>
				{t('mute')}
			</Button>
			<form
				className="flex items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault()
					commitFade('fadeInSeconds', fadeIn)
					commitFade('fadeOutSeconds', fadeOut)
				}}
			>
				<div className="flex w-24 flex-col gap-1">
					<Label htmlFor={`${id}-in`}>{t('fadeIn')}</Label>
					<Input
						id={`${id}-in`}
						type="number"
						min={0}
						step={FADE_STEP_SECONDS}
						value={fadeIn}
						disabled={!canEdit}
						onChange={(event) => setFadeIn(event.target.value)}
						onBlur={() => commitFade('fadeInSeconds', fadeIn)}
					/>
				</div>
				<div className="flex w-24 flex-col gap-1">
					<Label htmlFor={`${id}-out`}>{t('fadeOut')}</Label>
					<Input
						id={`${id}-out`}
						type="number"
						min={0}
						step={FADE_STEP_SECONDS}
						value={fadeOut}
						disabled={!canEdit}
						onChange={(event) => setFadeOut(event.target.value)}
						onBlur={() => commitFade('fadeOutSeconds', fadeOut)}
					/>
				</div>
				{/* Enter in either field applies both. */}
				<button type="submit" hidden />
			</form>
		</div>
	)
}
