import { useQuery } from '@tanstack/react-query'
import type { useTranslations } from 'next-intl'
import type { useTakeAnalysis } from '@/app/[locale]/editor/audio/use-take-analysis'
import { captureFrames } from './frames'
import { frameTimes } from './make-plan'
import { buildPlan, type Ask, type Video } from './make-plan-request'

/**
 * Make it's plan for the picked video and what's asked: the small pictures
 * taken from it, the transcript's state, and the plan (asked for once the
 * pictures and the transcript are ready, kept for the session), with what
 * to tell the user when any of them fails.
 */
export function useMakePlan({
	video,
	ask,
	analysis,
	t
}: {
	video: Video | null
	ask: Ask | null
	analysis: ReturnType<typeof useTakeAnalysis>
	t: ReturnType<typeof useTranslations<'Make'>>
}) {
	const frames = useQuery({
		queryKey: ['make-frames', video?.url],
		queryFn: () => (video ? captureFrames(video.url, frameTimes(video.durationSeconds)) : []),
		enabled: video !== null,
		staleTime: Infinity,
		retry: false
	})

	const transcriptState = analysis.transcript
	const transcriptReady =
		transcriptState.status === 'ready' || transcriptState.status === 'no_audio'
	const transcript = transcriptState.status === 'ready' ? transcriptState.transcript : null
	const fillerCuts = analysis.fillerPlans.flatMap((plan) =>
		plan.kind === 'cut' ? [{ startSeconds: plan.startSeconds, endSeconds: plan.endSeconds }] : []
	)

	// Kept for the session: the same request on the same video doesn't pay twice.
	const plan = useQuery({
		queryKey: ['make-plan', video?.url, ask],
		queryFn: async () => {
			if (!video || !ask || !frames.data) throw new Error('nothing to plan')
			return buildPlan({
				video,
				ask,
				frames: frames.data,
				transcript,
				fillerCuts,
				unclear: t('errors.planning')
			})
		},
		enabled: video !== null && ask !== null && frames.data !== undefined && transcriptReady,
		staleTime: Infinity,
		retry: false
	})

	// Plain words for each step that can fail; never an error's own text.
	const failed =
		transcriptState.status === 'failed'
			? transcriptState.plain
				? transcriptState.error
				: t('errors.transcript')
			: frames.isError
				? t('errors.pictures')
				: plan.isError
					? plan.error.message
					: null

	return { frames, transcriptReady, transcript, fillerCuts, plan, failed }
}
