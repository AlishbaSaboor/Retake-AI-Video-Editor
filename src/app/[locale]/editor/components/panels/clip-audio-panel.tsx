'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clampVolume, DEFAULT_CLIP_AUDIO, MAX_VOLUME, type ClipAudio } from '../../model/clip-audio'
import { clampSpeed, MAX_CLIP_SPEED, MIN_CLIP_SPEED, type Clip } from '../../model/sequence'
import { MoreInfo } from './more-info'

const PERCENT = 100
const VOLUME_STEP_PERCENT = 5
const FADE_STEP_SECONDS = 0.1
const SPEED_STEP = 0.05

type ClipAudioPanelProps = {
	clips: Clip[]
	/** Per clip, whether a re-recorded take plays in it: its speed stays 1×. */
	withTake: boolean[]
	/** Per clip, whether its sound was taken out into the Audio lane: set there, not here. */
	inLane: boolean[]
	/** False outside the Edited view: the sound is set on the edit. */
	canEdit: boolean
	onChange: (index: number, audio: ClipAudio) => void
	onSpeedChange: (index: number, speed: number) => void
}

/**
 * Each clip's volume (0 to 200%), mute, fade in and out, and speed (0.25×
 * to 4×). A slider drag is one change, on release; a typed fade length or
 * speed is one change, on Enter or leaving the field.
 */
export function ClipAudioPanel({
	clips,
	withTake,
	inLane,
	canEdit,
	onChange,
	onSpeedChange
}: ClipAudioPanelProps) {
	const t = useTranslations('Editor.clipAudio')
	return (
		<section aria-label={t('label')} className="flex flex-col gap-3">
			<h2 className="sr-only">{t('label')}</h2>
			{clips.map((clip, index) => (
				<ClipAudioRow
					// Follows the clip's sound and speed, so an undo resets what's typed.
					key={`${clip.id}-${JSON.stringify(clip.audio ?? null)}-${clip.speed ?? 1}`}
					number={index + 1}
					audio={clip.audio ?? DEFAULT_CLIP_AUDIO}
					speed={clip.speed ?? 1}
					hasTake={withTake[index] ?? false}
					canEdit={canEdit}
					soundInLane={inLane[index] ?? false}
					onChange={(audio) => onChange(index, audio)}
					onSpeedChange={(speed) => onSpeedChange(index, speed)}
				/>
			))}
			<MoreInfo>{t('hint')}</MoreInfo>
		</section>
	)
}

function ClipAudioRow({
	number,
	audio,
	speed,
	hasTake,
	canEdit,
	soundInLane,
	onChange,
	onSpeedChange
}: {
	number: number
	audio: ClipAudio
	speed: number
	hasTake: boolean
	canEdit: boolean
	soundInLane: boolean
	onChange: (audio: ClipAudio) => void
	onSpeedChange: (speed: number) => void
}) {
	const t = useTranslations('Editor.clipAudio')
	const id = useId()
	const [volume, setVolume] = useState(Math.round(audio.volume * PERCENT))
	const [fadeIn, setFadeIn] = useState(String(audio.fadeInSeconds))
	const [fadeOut, setFadeOut] = useState(String(audio.fadeOutSeconds))
	const [typedSpeed, setTypedSpeed] = useState(String(speed))

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

	function commitSpeed() {
		const typed = Number.parseFloat(typedSpeed)
		if (!Number.isFinite(typed)) {
			setTypedSpeed(String(speed))
			return
		}
		const next = clampSpeed(typed)
		setTypedSpeed(String(next))
		if (next !== speed) onSpeedChange(next)
	}

	const name = t('clip', { number })
	// Its sound plays from the Audio lane: volume, mute and fades are set there.
	const canSetSound = canEdit && !soundInLane
	return (
		<div
			role="group"
			aria-label={name}
			className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3"
		>
			<div className="flex items-center gap-2">
				<span className="text-text flex-1 text-sm font-semibold">{name}</span>
				<Button
					type="button"
					size="sm"
					variant={audio.muted ? 'secondary' : 'ghost'}
					aria-pressed={audio.muted}
					disabled={!canSetSound}
					onClick={() => onChange({ ...audio, muted: !audio.muted })}
				>
					{t('mute')}
				</Button>
			</div>
			{soundInLane && <span className="text-text-muted text-xs">{t('inLane')}</span>}
			<div className="flex flex-col gap-1">
				<Label htmlFor={`${id}-volume`}>{t('volume', { percent: volume })}</Label>
				<input
					id={`${id}-volume`}
					type="range"
					min={0}
					max={MAX_VOLUME * PERCENT}
					step={VOLUME_STEP_PERCENT}
					value={volume}
					disabled={!canSetSound}
					onChange={(event) => setVolume(event.target.valueAsNumber)}
					onPointerUp={commitVolume}
					onKeyUp={commitVolume}
					onBlur={commitVolume}
					className="accent-accent h-6"
				/>
			</div>
			<div className="grid grid-cols-3 items-end gap-2">
				<form
					className="col-span-2 grid grid-cols-2 items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						commitFade('fadeInSeconds', fadeIn)
						commitFade('fadeOutSeconds', fadeOut)
					}}
				>
					<div className="flex flex-col gap-1">
						<Label htmlFor={`${id}-in`}>{t('fadeIn')}</Label>
						<Input
							id={`${id}-in`}
							type="number"
							min={0}
							step={FADE_STEP_SECONDS}
							value={fadeIn}
							disabled={!canSetSound}
							onChange={(event) => setFadeIn(event.target.value)}
							onBlur={() => commitFade('fadeInSeconds', fadeIn)}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label htmlFor={`${id}-out`}>{t('fadeOut')}</Label>
						<Input
							id={`${id}-out`}
							type="number"
							min={0}
							step={FADE_STEP_SECONDS}
							value={fadeOut}
							disabled={!canSetSound}
							onChange={(event) => setFadeOut(event.target.value)}
							onBlur={() => commitFade('fadeOutSeconds', fadeOut)}
						/>
					</div>
					{/* Enter in either field applies both. */}
					<button type="submit" hidden />
				</form>
				<form
					className="flex flex-col gap-1"
					onSubmit={(event) => {
						event.preventDefault()
						commitSpeed()
					}}
				>
					<Label htmlFor={`${id}-speed`}>{t('speed')}</Label>
					<Input
						id={`${id}-speed`}
						type="number"
						min={MIN_CLIP_SPEED}
						max={MAX_CLIP_SPEED}
						step={SPEED_STEP}
						value={typedSpeed}
						disabled={!canEdit || hasTake}
						title={hasTake ? t('speedWithTake') : undefined}
						onChange={(event) => setTypedSpeed(event.target.value)}
						onBlur={commitSpeed}
					/>
				</form>
			</div>
		</div>
	)
}
