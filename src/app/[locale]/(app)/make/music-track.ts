import { decodeAudio } from '@/app/[locale]/editor/take-audio'
import { captureClientError } from '@/lib/observability/capture-client-error'
import type { MusicTrack } from './make-plan'

/** A track from public/music, fetched and decoded; null when it can't be had. */
export async function loadTrack(name: string): Promise<MusicTrack<AudioBuffer> | null> {
	try {
		const response = await fetch(`/music/${encodeURIComponent(name)}`)
		if (!response.ok) return null
		const file = await response.blob()
		const buffer = await decodeAudio(file)
		return buffer ? { name, file, buffer, seconds: buffer.duration } : null
	} catch (error) {
		captureClientError(error, { feature: 'make_it_music' })
		return null
	}
}
