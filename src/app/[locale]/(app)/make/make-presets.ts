import type { ColorGrade } from '../../editor/model/color-grade'
import { MAX_SHAPE_COVER, type DesignLook } from '../../editor/overlays/design'
import type { Animation } from '../../editor/overlays/motion'
import {
	BAND_OPACITY,
	DEFAULT_TEXT_STYLE,
	type Font,
	type TextStyle
} from '../../editor/overlays/text-style'
import type { CaptionLook, MakeStyle } from './make-reply'
import { contrast, MIN_CONTRAST, over, readableOn, shifted } from './video-colours'

// Make it's looks: a preset sets everything about how a plan looks at once
// (the colour of the picture and of a designed background, the captions,
// the transition and its easing, the title's animation, the zoom's strength,
// and how long text holds), so a reel or an ad reads as one designed piece.
// Colours are built around the video's own colour (video-colours.ts), or
// the preset's when it has none, and every text colour reads against what's
// behind it. The four Make it styles stay what the video is (they guide
// Gemini's cutting and name the plan); the look is the preset's alone.

export const PRESETS = ['clean', 'bold', 'cinematic', 'playful'] as const
export type Preset = (typeof PRESETS)[number]

/** Music each preset suits: part of its definition, unused until music is built. */
export type MusicMood = 'calm' | 'upbeat' | 'cinematic' | 'fun'

type PresetDefinition = {
	/** The picture's colour, over the whole video. */
	grade: ColorGrade
	/** The colour it's built around when the video has none of its own. */
	fallback: string
	/** A designed background around the colour: [hue turn, saturation, lightness] for each part. */
	background: {
		from: [number, number, number]
		to: [number, number, number]
		shape: [number, number, number]
		accent: [number, number, number]
	}
	bar: 'thin' | 'thick'
	wave: boolean
	captions: { look: Exclude<CaptionLook, 'off'>; font: Font; size: number; bandOnDesign: boolean }
	title: { font: Font; size: number; animation: Animation; accentBand: boolean }
	/** One transition for the whole video; zoom cuts are the zooms at the joins. */
	transition: { kind: 'dissolve' | 'slide' | 'fade' | 'zoom_cut'; seconds: number }
	zoom: number
	/** How long the title, and a key line at least and at most, stays on screen. */
	pacing: { titleSeconds: number; keyLineMin: number; keyLineMax: number }
	music: MusicMood
}

const fade = (inSeconds: number, outSeconds: number): Animation => ({
	in: { kind: 'fade', side: 'left', seconds: inSeconds },
	out: { kind: 'fade', side: 'left', seconds: outSeconds }
})

const PRESET_DEFINITIONS: Record<Preset, PresetDefinition> = {
	clean: {
		grade: { brightness: 1.05, contrast: 1, saturation: 1, look: 'none' },
		fallback: '#3b6ea5',
		background: {
			from: [0, 0.25, 0.16],
			to: [20, 0.3, 0.28],
			shape: [0, 0.35, 0.45],
			accent: [0, 0.6, 0.72]
		},
		bar: 'thin',
		wave: false,
		captions: { look: 'classic', font: 'sans', size: 1.1, bandOnDesign: true },
		title: { font: 'sans', size: 1, animation: fade(0.6, 0.4), accentBand: false },
		transition: { kind: 'dissolve', seconds: 0.4 },
		zoom: 1.08,
		pacing: { titleSeconds: 3, keyLineMin: 1.5, keyLineMax: 4 },
		music: 'calm'
	},
	bold: {
		grade: { brightness: 1, contrast: 1.15, saturation: 1.2, look: 'none' },
		fallback: '#d7263d',
		background: {
			from: [0, 0.55, 0.12],
			// Deep enough for white text and the light accent at 4.5:1, shapes and all.
			to: [30, 0.6, 0.18],
			shape: [15, 0.6, 0.25],
			accent: [0, 0.75, 0.75]
		},
		bar: 'thick',
		wave: false,
		captions: { look: 'bold_words', font: 'sans', size: 1.8, bandOnDesign: true },
		title: {
			font: 'sans',
			size: 1.4,
			animation: {
				in: { kind: 'slide', side: 'left', seconds: 0.35 },
				out: { kind: 'fade', side: 'left', seconds: 0.25 }
			},
			accentBand: true
		},
		transition: { kind: 'slide', seconds: 0.4 },
		zoom: 1.25,
		pacing: { titleSeconds: 2, keyLineMin: 1.2, keyLineMax: 3 },
		music: 'upbeat'
	},
	cinematic: {
		grade: { brightness: 1, contrast: 1.1, saturation: 0.85, look: 'cool' },
		fallback: '#c9a227',
		background: {
			from: [0, 0.15, 0.05],
			to: [0, 0.3, 0.14],
			shape: [0, 0.4, 0.3],
			accent: [0, 0.35, 0.75]
		},
		bar: 'thin',
		wave: false,
		captions: { look: 'classic', font: 'serif', size: 1.2, bandOnDesign: false },
		title: {
			font: 'serif',
			size: 1.2,
			animation: {
				in: { kind: 'words', side: 'left', seconds: 1 },
				out: { kind: 'fade', side: 'left', seconds: 0.8 }
			},
			accentBand: false
		},
		transition: { kind: 'fade', seconds: 0.8 },
		zoom: 1.12,
		pacing: { titleSeconds: 3.5, keyLineMin: 2, keyLineMax: 5 },
		music: 'cinematic'
	},
	playful: {
		grade: { brightness: 1, contrast: 1.05, saturation: 1.25, look: 'warm' },
		fallback: '#ff7a00',
		background: {
			from: [0, 0.75, 0.25],
			to: [150, 0.7, 0.25],
			shape: [60, 0.8, 0.55],
			accent: [60, 0.95, 0.6]
		},
		bar: 'thin',
		wave: true,
		captions: { look: 'highlight', font: 'sans', size: 1.4, bandOnDesign: true },
		title: {
			font: 'sans',
			size: 1.3,
			animation: {
				in: { kind: 'pop', side: 'left', seconds: 0.45 },
				out: { kind: 'pop', side: 'left', seconds: 0.3 }
			},
			accentBand: true
		},
		transition: { kind: 'zoom_cut', seconds: 0.4 },
		zoom: 1.35,
		pacing: { titleSeconds: 2.5, keyLineMin: 1.2, keyLineMax: 3 },
		music: 'fun'
	}
}

export function presetDefinition(preset: Preset): PresetDefinition {
	return PRESET_DEFINITIONS[preset]
}

/** A Make it style's preset when the look is left to "You decide"; Cinematic only when asked. */
export const DEFAULT_PRESET: Record<MakeStyle, Preset> = {
	professional: 'clean',
	reel: 'bold',
	ad: 'bold',
	funny: 'playful'
}

/** Each preset's words, whole words only: a request or follow-up naming one asks for it. */
const PRESET_WORDS: Record<Preset, RegExp> = {
	clean: /\b(?:clean|minimal|minimalist|simple|sleek)\b/i,
	bold: /\b(?:bold|punchy|loud)\b/i,
	cinematic: /\b(?:cinematic|filmic|moody|dramatic|epic)\b/i,
	playful: /\b(?:playful|fun|funny|quirky|colou?rful)\b/i
}

/** The preset a text names, the last one named when it names more; null when none. */
export function presetNamed(text: string): Preset | null {
	let best: { preset: Preset; at: number } | null = null
	for (const preset of PRESETS) {
		for (const match of text.matchAll(new RegExp(PRESET_WORDS[preset].source, 'gi'))) {
			if (!best || match.index > best.at) best = { preset, at: match.index }
		}
	}
	return best?.preset ?? null
}

/** The preset the plan uses, and whether the user's words (or a click) chose it. */
export type ChosenPreset = { preset: Preset; said: boolean }

/**
 * The plan's preset. The latest ask wins: a follow-up naming a look ("more
 * cinematic"), else the one clicked, else one the request names; otherwise
 * the style's own, chosen for the user.
 */
export function choosePreset(
	style: MakeStyle,
	request: string,
	clicked: Preset | null | undefined,
	followUps: readonly string[] = []
): ChosenPreset {
	for (const text of [...followUps].reverse()) {
		const named = presetNamed(text)
		if (named) return { preset: named, said: true }
	}
	if (clicked) return { preset: clicked, said: true }
	const named = presetNamed(request)
	if (named) return { preset: named, said: true }
	return { preset: DEFAULT_PRESET[style], said: false }
}

/** What a picture could be behind text laid over it, at its brightest and darkest. */
const ANY_PICTURE = ['#ffffff', '#000000']
/** Text on a band reads against the band over whatever is behind it. */
const behindBand = (band: string, behind: readonly string[]) =>
	behind.map((colour) => over(band, colour, BAND_OPACITY))
/** How Bold's text sits on a designed background: no fill with a soft shadow, or on an accent block. */
export type BoldText = 'shadow' | 'block'

/**
 * Bold's text on a designed background. No fill, white text with a soft
 * shadow and the spoken word in the accent, when both read at MIN_CONTRAST
 * against every colour of the background itself (the shadow gets no
 * credit); otherwise the light accent as a solid block behind black text.
 */
export function boldText(accent: string, behind: readonly string[]): BoldText {
	const reads = (colour: string) => behind.every((b) => contrast(colour, b) >= MIN_CONTRAST)
	return reads('#ffffff') && reads(accent) ? 'shadow' : 'block'
}

/**
 * The colours text over a designed background can sit on, as drawn: the
 * gradient's two ends, and each with the soft shapes' colour over it at the
 * most they ever cover (every shape's middle at once).
 */
export function drawnBackground(design: Pick<DesignLook, 'from' | 'to' | 'shape'>): string[] {
	const ends = [design.from, design.to]
	return [...ends, ...ends.map((end) => over(design.shape, end, MAX_SHAPE_COVER))]
}

/**
 * Bold's text style on a designed background. `shadow`: no fill, white
 * text with a soft shadow, the spoken word in the accent. `block`: the
 * light accent as a solid block behind black text.
 */
export function boldTextStyle(kind: BoldText, accent: string, font: Font, size: number): TextStyle {
	if (kind === 'shadow') {
		return {
			...DEFAULT_TEXT_STYLE,
			font,
			size,
			color: '#ffffff',
			background: null,
			shadow: true,
			highlight: accent
		}
	}
	const dark = readableOn('#000000', [accent])
	return {
		...DEFAULT_TEXT_STYLE,
		font,
		size,
		color: dark,
		background: accent,
		solidBand: true,
		highlight: dark
	}
}

/** How a preset looks on one video: every colour worked out, every text colour readable. */
export type PresetLook = {
	preset: Preset
	grade: ColorGrade
	design: DesignLook
	/** The captions' look, and their style over the picture or on a designed background. */
	captionLook: Exclude<CaptionLook, 'off'>
	captions: { picture: TextStyle; designed: TextStyle }
	/** The title's (and key lines') style over the picture or on a designed background. */
	title: { picture: TextStyle; designed: TextStyle; animation: Animation }
	transition: PresetDefinition['transition']
	zoom: number
	pacing: PresetDefinition['pacing']
	music: MusicMood
}

/**
 * `preset` on a video whose own colour is `videoColour` (null when it has
 * none): a designed background around that colour, an accent from it, and
 * text in colours that read on what's behind them. Over the picture, text
 * keeps a dark band, so it reads on any picture.
 */
export function presetLook(preset: Preset, videoColour: string | null): PresetLook {
	const definition = PRESET_DEFINITIONS[preset]
	const base = videoColour ?? definition.fallback
	const part = ([turn, s, l]: [number, number, number]) => shifted(base, turn, s, l)
	const from = part(definition.background.from)
	const to = part(definition.background.to)
	const background = [from, to]
	const accent = readableOn(part(definition.background.accent), background)
	// The dark text an accent band carries.
	const bandText = shifted(base, 0, 0.6, 0.1)
	const design: DesignLook = {
		from,
		to,
		shape: part(definition.background.shape),
		accent,
		bar: definition.bar,
		wave: definition.wave
	}
	const style = (
		font: Font,
		size: number,
		band: string | null,
		behind: readonly string[]
	): TextStyle => {
		const seen = band ? behindBand(band, behind) : behind
		return {
			...DEFAULT_TEXT_STYLE,
			font,
			size,
			color: readableOn('#ffffff', seen),
			background: band,
			highlight: readableOn(accent, seen)
		}
	}
	const { captions, title } = definition
	// On a designed background: an accent band behind dark text where the preset has one.
	const accentStyle = (font: Font, size: number): TextStyle => {
		const seen = behindBand(accent, background)
		return {
			...DEFAULT_TEXT_STYLE,
			font,
			size,
			color: readableOn(bandText, seen),
			background: accent,
			highlight: readableOn('#ffffff', seen)
		}
	}
	// Bold on a designed background: the text colour does the work, in the video's own accent.
	const bold = boldText(accent, drawnBackground(design))
	const boldStyle = (font: Font, size: number) => boldTextStyle(bold, accent, font, size)
	return {
		preset,
		grade: definition.grade,
		design,
		captionLook: captions.look,
		captions: {
			picture: style(captions.font, captions.size, '#000000', ANY_PICTURE),
			designed:
				preset === 'bold'
					? boldStyle(captions.font, captions.size)
					: style(
							captions.font,
							captions.size,
							captions.bandOnDesign ? '#000000' : null,
							background
						)
		},
		title: {
			picture: style(title.font, title.size, '#000000', ANY_PICTURE),
			designed:
				preset === 'bold'
					? boldStyle(title.font, title.size)
					: title.accentBand
						? accentStyle(title.font, title.size)
						: style(title.font, title.size, '#000000', background),
			animation: title.animation
		},
		transition: definition.transition,
		zoom: definition.zoom,
		pacing: definition.pacing,
		music: definition.music
	}
}
