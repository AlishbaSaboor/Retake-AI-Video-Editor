import type { MakeFormat, ScreenTreatment } from './make-reply'

// What a Make it request's own words ask for: a promo, text only, the whole screen, a fit, a short form, captions; and the words it quotes or names.

/** A request for an ad, a promo, a teaser or a highlights reel: a screen recording is designed for it. */
export const PROMO_REQUEST =
	/\b(ads?|adverts?|advertisements?|promos?|promotional|teasers?|highlights?)\b/i
/** The user's own words asking for a screen recording as text and captions only. */
const TEXT_ONLY_REQUEST =
	/\b(text[ -]?only|only (the )?text|just (the )?text|captions? only|only (the )?captions|no screen|without (the |my )?screen|hide (the |my )?screen|leave (out )?(the |my )?screen( out)?)\b/i
/** The user's own words asking for the screen itself to show. */
const SHOW_SCREEN_REQUEST =
	/\b(show (me )?(the |my )?(whole |full |entire )?screen|keep (the |my )?(whole |full )?screen|(whole|full|entire) screen|screen (visible|showing)|with (the |my )?screen)\b/i
/** The user's own words naming how the video fits its shape: bars, a blur, a zoom or a crop. */
export const FIT_REQUEST =
	/\b(black bars?|bars|blur(red|ry)?|zoom(ed|s)?|crop(ped|s)?|fill(s|ing)? the (frame|screen)|close[- ]?ups?)\b/i

/**
 * The treatment the user's own words ask for, latest first: text only, or
 * the screen shown; null when they ask for neither (or both at once).
 * Gemini's reply never decides this on its own.
 */
export function askedTreatment(texts: readonly string[]): ScreenTreatment | null {
	for (const text of [...texts].reverse()) {
		const textOnly = TEXT_ONLY_REQUEST.test(text)
		const showScreen = SHOW_SCREEN_REQUEST.test(text)
		if (textOnly !== showScreen) return textOnly ? 'designed' : 'whole'
	}
	return null
}

/**
 * Reels, TikToks and Shorts come out under a minute: enforced here, whatever
 * the reply plans. A second under, so the export's few hundredths of a
 * second either way never take it to 60.
 */
export const SHORT_FORM_MAX_SECONDS = 59
/** A short-form edit fills at least this much when the video has enough worth keeping. */
export const SHORT_FORM_TARGET_SECONDS = 50
/** A length asked for ("make it 30 seconds") is filled to at least this share of it. */
export const ASKED_FILL = 0.85
/** The request names a short-video format itself: a check that doesn't rest on the model. */
const SHORT_FORM_REQUEST = /\b(reels?|tik\s?toks?|shorts|stor(?:y|ies))\b/i

/** Whether the edit must come out under a minute: the reply's format, or the request's own words. */
export function isShortForm(format: MakeFormat, request: string): boolean {
	return format !== 'other' || SHORT_FORM_REQUEST.test(request)
}

const MAX_KEY_LINE_WORDS = 8

/** The user's own words about the captions: then the reply's caption look is theirs. */
export const CAPTIONS_REQUEST = /\b(?:captions?|subtitles?)\b/i

/** A text's words, lower case, its punctuation aside. */
export const wordsOf = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []

/**
 * Whether the user's own words give `part` of a brief: every word of it is
 * in the request or a follow-up (Gemini fills a brief in whether or not
 * anyone asked).
 */
export function saidInBrief(part: string, said: readonly string[]): boolean {
	const words = new Set(said.flatMap(wordsOf))
	const partWords = wordsOf(part)
	return partWords.length > 0 && partWords.every((word) => words.has(word))
}

/**
 * The words of a key line, if it quotes its sentence: every word of it is
 * in the sentence (case and punctuation aside), and it's short. Null
 * otherwise: Make it shows no words that weren't said.
 */
export function quotedLine(text: string, sentence: string): string | null {
	const said = new Set(wordsOf(sentence))
	const line = wordsOf(text)
	if (line.length === 0 || line.length > MAX_KEY_LINE_WORDS) return null
	return line.every((word) => said.has(word)) ? text.trim() : null
}

/**
 * Words in on-screen text that look like a name or a handle (a capital
 * inside a sentence, an @ or #) and were never said in the video nor
 * written in the request. Make it puts no such text on screen.
 */
export function inventedNames(text: string, known: string): string[] {
	const knownWords = new Set(known.toLowerCase().match(/[@#]?[\p{L}\p{N}_']+/gu) ?? [])
	const out: string[] = []
	let sentenceStart = true
	for (const match of text.matchAll(/([@#]?[\p{L}\p{N}_']+)|([.!?])/gu)) {
		const word = match[1]
		if (!word) {
			sentenceStart = true
			continue
		}
		const handle = /^[@#]/.test(word)
		const capital = !sentenceStart && /^\p{Lu}/u.test(word) && word !== 'I'
		if ((handle || capital) && !knownWords.has(word.toLowerCase())) out.push(word)
		sentenceStart = false
	}
	return out
}
