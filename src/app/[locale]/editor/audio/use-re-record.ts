import { useState, type RefObject } from 'react'
import type { Cut, Edit } from '../model/cleanup'
import type { Clip, SourceRange } from '../model/sequence'
import type { useSequencePlayback } from '../components/preview/use-sequence-playback'
import { previewWindow, type ReplacementTake } from './re-record'
import {
	byEarPlan,
	initialJoins,
	joinBounds,
	moveJoin,
	planSentenceSplice,
	type SplicePlan
} from './sentence-splice'
import type { TranscriptSegment } from './transcript'
import type { useTakeAnalysis } from './use-take-analysis'

/**
 * Re-recording one sentence, in two parts: its state, which the edit's
 * segments read before playback exists, and its actions, which need playback.
 */
export function useReRecord({ replacements }: { replacements: ReplacementTake[] }) {
	// Re-recording a sentence: which one, where its take would go (the
	// planner's answer, or joins set by ear within `bounds`), the take it
	// already has (replaced on apply), and the take recorded so far. Its
	// preview plays the sentence with some context, with the new take or as
	// recorded; a join preview plays the original around one join.
	const [reRecord, setReRecord] = useState<{
		sentence: TranscriptSegment
		plan: SplicePlan
		/** Set while the joins are set by ear: how far they may go. */
		bounds: SourceRange | null
		replacing: string | null
		take: ReplacementTake | null
	} | null>(null)
	const [takePreview, setTakePreview] = useState<{ withTake: boolean } | null>(null)
	const [joinPreview, setJoinPreview] = useState<SourceRange | null>(null)
	const otherReplacements = replacements.filter((r) => r.id !== reRecord?.replacing)

	return {
		reRecord,
		setReRecord,
		takePreview,
		setTakePreview,
		joinPreview,
		setJoinPreview,
		otherReplacements
	}
}

type ReRecordState = ReturnType<typeof useReRecord>

/** Opening, previewing, applying and closing a re-recording. */
export function useReRecordActions({
	analysis,
	replacements,
	sequence,
	edit,
	durationSeconds,
	cuts,
	playback,
	videoRef,
	setCurrentTimeSeconds,
	setPreview,
	recordEdit,
	setReplacements,
	reRecord,
	setReRecord,
	setTakePreview,
	setJoinPreview,
	otherReplacements
}: {
	analysis: ReturnType<typeof useTakeAnalysis>
	replacements: ReplacementTake[]
	sequence: Clip[]
	edit: Edit
	durationSeconds: number
	cuts: Cut[]
	playback: Pick<ReturnType<typeof useSequencePlayback>, 'pause' | 'seek' | 'returnToMain'>
	videoRef: RefObject<HTMLVideoElement | null>
	setCurrentTimeSeconds: (seconds: number) => void
	setPreview: (preview: { withCut: boolean } | null) => void
	recordEdit: () => void
	setReplacements: (replacements: ReplacementTake[]) => void
	reRecord: ReRecordState['reRecord']
	setReRecord: ReRecordState['setReRecord']
	setTakePreview: ReRecordState['setTakePreview']
	setJoinPreview: ReRecordState['setJoinPreview']
	otherReplacements: ReplacementTake[]
}) {
	// A sentence's take is the one over its middle, whether its joins were
	// found or set by ear; re-opening a by-ear sentence brings its joins back.
	function openReRecord(sentence: TranscriptSegment) {
		if (!analysis.loudness) return
		const middle = (sentence.startSeconds + sentence.endSeconds) / 2
		const existing = replacements.find(
			(r) => r.span.startSeconds <= middle && r.span.endSeconds >= middle
		)
		const planned = planSentenceSplice(sentence, analysis.loudness)
		const byEar = planned.kind === 'review' && existing !== undefined
		setReRecord({
			sentence,
			plan: byEar ? byEarPlan(existing.span) : planned,
			bounds: byEar ? byEarBounds(sentence, existing.id) : null,
			replacing: existing?.id ?? null,
			take: existing ?? null
		})
		setTakePreview(null)
		setJoinPreview(null)
		playback.pause()
		playback.seek(sentence.startSeconds)
	}

	/**
	 * How far a by-ear join may go: inside the part of the take the edit
	 * plays around the sentence, clear of cuts and other re-recorded spans.
	 */
	function byEarBounds(sentence: TranscriptSegment, replacing: string | null): SourceRange {
		const middle = (sentence.startSeconds + sentence.endSeconds) / 2
		const range = sequence
			.flatMap((clip) => clip.ranges)
			.find((r) => r.startSeconds <= middle && r.endSeconds >= middle)
		const playing = {
			startSeconds: Math.max(range?.startSeconds ?? 0, edit.trim.startSeconds),
			endSeconds: Math.min(range?.endSeconds ?? durationSeconds, edit.trim.endSeconds)
		}
		const obstacles = [
			...cuts,
			...replacements.filter((r) => r.id !== replacing).map((r) => r.span)
		]
		return joinBounds(sentence, playing, obstacles)
	}

	function setJoinsByEar() {
		if (!reRecord || !analysis.loudness) return
		const bounds = byEarBounds(reRecord.sentence, reRecord.replacing)
		const joins = initialJoins(reRecord.sentence, analysis.loudness, bounds)
		setReRecord({ ...reRecord, plan: byEarPlan(joins), bounds, take: null })
	}

	// A take already recorded moves with its joins: what plays is its own
	// speech, which doesn't depend on where they are.
	function moveByEarJoin(edge: 'start' | 'end', seconds: number) {
		if (!reRecord?.bounds || reRecord.plan.kind !== 'splice') return
		const joins = moveJoin(reRecord.plan, edge, seconds, reRecord.bounds)
		const span = { startSeconds: joins.startSeconds, endSeconds: joins.endSeconds }
		setReRecord({
			...reRecord,
			plan: byEarPlan(span),
			take: reRecord.take && { ...reRecord.take, span }
		})
	}

	// Plays the original across one join's view, to hear where it falls.
	function playJoinPreview(view: SourceRange) {
		const element = videoRef.current
		if (!element) return
		playback.returnToMain()
		setPreview(null)
		setTakePreview(null)
		setJoinPreview(view)
		element.currentTime = view.startSeconds
		setCurrentTimeSeconds(view.startSeconds)
		element.play().catch(() => setJoinPreview(null))
	}

	// Plays the sentence with context — with the new take, or as recorded —
	// so the take can be judged in place before it's used.
	function playTakePreview(withTake: boolean) {
		const element = videoRef.current
		if (!element || reRecord?.plan.kind !== 'splice') return
		playback.returnToMain()
		const start = previewWindow(reRecord.plan, durationSeconds).startSeconds
		setPreview(null)
		setJoinPreview(null)
		setTakePreview({ withTake })
		element.currentTime = start
		setCurrentTimeSeconds(start)
		element.play().catch(() => setTakePreview(null))
	}

	// A take for a sentence that already has one replaces it.
	function applyReRecord() {
		const take = reRecord?.take
		if (!take) return
		playback.pause()
		recordEdit()
		setReplacements([...otherReplacements, take])
		setReRecord(null)
		setTakePreview(null)
	}

	function closeReRecord() {
		playback.pause()
		setReRecord(null)
		setTakePreview(null)
		setJoinPreview(null)
	}

	return {
		openReRecord,
		setJoinsByEar,
		moveByEarJoin,
		playJoinPreview,
		playTakePreview,
		applyReRecord,
		closeReRecord
	}
}
