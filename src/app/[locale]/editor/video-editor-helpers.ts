import type { Transcript } from './audio/transcript'
import type { AudioItem } from './model/audio-lane'
import type { SourceRange } from './model/sequence'

// VideoEditor's constants and small helpers (video-editor.tsx).

/** A project saved before caption modes kept "word by word" as a yes or no. */
export const wordByWord = (saved: object) => 'captionWords' in saved && saved.captionWords === true

/** The main video; a reopened project brings its saved transcript. */
export type LoadedVideo = { file: File; url: string; name: string; transcript?: Transcript | null }

/** The preview's grade filters' id prefix. */
export const PREVIEW_GRADE = 'preview-grade'
/** No lane sound: what playback gets outside the Edited view (one array, so it never looks changed). */
export const NO_LANE: AudioItem[] = []
export const NO_SPEECH: SourceRange[] = []
/** A title added by its button shows this long, from the playhead. */
export const NEW_ITEM_SECONDS = 3
/** Where new text and a new box, blur or pixelate go: the middle of the picture. */
export const NEW_TEXT_RECT = { x: 0.3, y: 0.66, width: 0.4, height: 0.14 }
export const NEW_MARK_RECT = { x: 0.35, y: 0.3, width: 0.3, height: 0.4 }
/** How far into a clip a seek to its start goes when that moment also ends another clip. */
export const BOUNDARY_NUDGE_SECONDS = 0.01
/** An added video's timeline has no cuts, takes, silences, fillers or audio flags: the main one's. */

export const overlaps = (a: SourceRange, b: SourceRange) =>
	a.startSeconds < b.endSeconds && a.endSeconds > b.startSeconds
