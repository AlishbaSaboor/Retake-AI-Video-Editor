import { useState } from 'react'
import type { useTranslations } from 'next-intl'
import type { Annotation } from '../../overlays/annotations'
import type { LowerThird } from '../../overlays/motion'
import type { Corner, TitleCard, Watermark } from '../../overlays/overlays'
import type { Picked } from '../panels/on-video-panels'
import { setSideOpen } from '../shell/editor-layout-store'
import type { LaneItem } from '../timeline/editor-timeline'
import type { Timing } from './item-toolbar'

/** The Text lane's ids for Make it's key lines, numbered after it. */
const KEY_LINE_ID = 'key-line-'

/**
 * What's picked on the video (a title, the logo, the lower third or an
 * annotation), what the toolbar shows and does for it, and the Text lane's
 * items.
 */
export function usePickedItem({
	t,
	title,
	watermark,
	lowerThird,
	annotations,
	autoTitles,
	captionsOn,
	editedSeconds,
	changeTitle,
	changeLowerThird,
	changeAnnotation,
	removeAnnotation,
	recordEdit,
	setWatermark,
	pick,
	pickLogo,
	seekEdited,
	setOpenTool
}: {
	t: ReturnType<typeof useTranslations<'Editor'>>
	title: TitleCard | null
	watermark: Watermark | null
	lowerThird: LowerThird | null
	annotations: Annotation[]
	autoTitles: TitleCard[]
	captionsOn: boolean
	editedSeconds: number
	changeTitle: (next: TitleCard | null) => void
	changeLowerThird: (next: LowerThird | null) => void
	changeAnnotation: (next: Annotation) => void
	removeAnnotation: (id: string) => void
	recordEdit: () => void
	setWatermark: (next: Watermark | null) => void
	pick: (next: Picked | null) => void
	pickLogo: (corner: Corner) => void
	seekEdited: (seconds: number) => void
	setOpenTool: (tool: string) => void
}) {
	const [picked, setPicked] = useState<Picked | null>(null)
	// What's picked, only while it's still there (an undo can take it away).
	const pickedNow: Picked | null =
		picked?.kind === 'title' && title
			? picked
			: picked?.kind === 'logo' && watermark
				? picked
				: picked?.kind === 'lowerThird' && lowerThird
					? picked
					: picked?.kind === 'annotation' && annotations.some((item) => item.id === picked.id)
						? picked
						: null
	const annotationName = (item: Annotation) =>
		t('annotations.item', {
			kind: t(`annotations.kinds.${item.kind}`),
			number: annotations.indexOf(item) + 1
		})
	const pickedAnnotation =
		pickedNow?.kind === 'annotation'
			? annotations.find((item) => item.id === pickedNow.id)
			: undefined
	const pickedName =
		pickedNow?.kind === 'annotation'
			? pickedAnnotation
				? annotationName(pickedAnnotation)
				: ''
			: pickedNow
				? t(`onVideo.kinds.${pickedNow.kind}`)
				: ''
	const pickedTiming: Timing | null =
		pickedNow?.kind === 'title' && title
			? { startSeconds: title.startSeconds, endSeconds: title.startSeconds + title.durationSeconds }
			: pickedNow?.kind === 'lowerThird' && lowerThird
				? {
						startSeconds: lowerThird.startSeconds,
						endSeconds: lowerThird.startSeconds + lowerThird.durationSeconds
					}
				: pickedAnnotation
					? { startSeconds: pickedAnnotation.startSeconds, endSeconds: pickedAnnotation.endSeconds }
					: null

	function retimePicked(timing: Timing) {
		const durationSeconds = timing.endSeconds - timing.startSeconds
		if (pickedNow?.kind === 'title' && title)
			changeTitle({ ...title, startSeconds: timing.startSeconds, durationSeconds })
		if (pickedNow?.kind === 'lowerThird' && lowerThird)
			changeLowerThird({ ...lowerThird, startSeconds: timing.startSeconds, durationSeconds })
		if (pickedAnnotation) changeAnnotation({ ...pickedAnnotation, ...timing })
	}

	function deletePicked() {
		if (pickedNow?.kind === 'title') changeTitle(null)
		if (pickedNow?.kind === 'lowerThird') changeLowerThird(null)
		if (pickedNow?.kind === 'logo') {
			recordEdit()
			setWatermark(null)
		}
		if (pickedAnnotation) removeAnnotation(pickedAnnotation.id)
		pick(null)
	}

	/** Replace: a logo's file, or a title's or text's words (their field, focused). */
	const replacePicked =
		pickedNow?.kind === 'logo'
			? () => pickLogo(watermark?.corner ?? 'bottom-right')
			: pickedNow?.kind === 'title' || pickedAnnotation?.kind === 'text'
				? () => {
						setOpenTool('text')
						setSideOpen('panels', true)
						requestAnimationFrame(() =>
							document.querySelector<HTMLInputElement>('[data-picked-words]')?.focus()
						)
					}
				: undefined

	// The Text lane: everything over the video, in the edited video's time.
	const textItems: LaneItem[] = [
		...(title
			? [
					{
						id: 'title',
						label: title.text,
						startSeconds: title.startSeconds,
						endSeconds: title.startSeconds + title.durationSeconds,
						selected: pickedNow?.kind === 'title'
					}
				]
			: []),
		// Make it's key lines: shown, and a click goes to them; changed by undo or reset only.
		...autoTitles.map((line, index) => ({
			id: `${KEY_LINE_ID}${index}`,
			label: line.text,
			startSeconds: line.startSeconds,
			endSeconds: line.startSeconds + line.durationSeconds
		})),
		...(lowerThird
			? [
					{
						id: 'lowerThird',
						label: lowerThird.name,
						startSeconds: lowerThird.startSeconds,
						endSeconds: lowerThird.startSeconds + lowerThird.durationSeconds,
						selected: pickedNow?.kind === 'lowerThird'
					}
				]
			: []),
		...annotations.map((item) => ({
			id: item.id,
			label: item.kind === 'text' ? item.text : annotationName(item),
			startSeconds: item.startSeconds,
			endSeconds: item.endSeconds,
			selected: pickedNow?.kind === 'annotation' && pickedNow.id === item.id
		})),
		...(watermark
			? [
					{
						id: 'logo',
						label: t('onVideo.kinds.logo'),
						startSeconds: 0,
						endSeconds: editedSeconds,
						selected: pickedNow?.kind === 'logo'
					}
				]
			: []),
		...(captionsOn
			? [
					{
						id: 'captions',
						label: t('graphics.captions'),
						startSeconds: 0,
						endSeconds: editedSeconds
					}
				]
			: [])
	]

	function selectText(id: string) {
		const keyLine = id.startsWith(KEY_LINE_ID) ? textItems.find((item) => item.id === id) : null
		if (keyLine) return seekEdited(keyLine.startSeconds)
		setSideOpen('panels', true)
		if (id === 'captions') return setOpenTool('captions')
		if (id === 'title' || id === 'lowerThird' || id === 'logo') {
			pick({ kind: id })
			setOpenTool('text')
		} else {
			pick({ kind: 'annotation', id })
			const item = annotations.find((each) => each.id === id)
			setOpenTool(item?.kind === 'text' ? 'text' : 'annotate')
		}
		const at = textItems.find((item) => item.id === id)
		if (at && id !== 'logo') seekEdited(at.startSeconds)
	}

	return {
		setPicked,
		pickedNow,
		pickedName,
		pickedTiming,
		retimePicked,
		deletePicked,
		replacePicked,
		textItems,
		selectText
	}
}
