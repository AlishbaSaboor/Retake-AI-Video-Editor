import { ANALYSIS_SAMPLE_RATE } from '../audio/take-audio'

/** A spoken command is a sentence or two: recording stops here, which also caps what one costs. */
export const MAX_VOICE_COMMAND_SECONDS = 30

/** 16-bit mono WAV at the analysis rate, base64: 4/3 of 2 bytes a sample, plus the 44-byte header. */
export const MAX_VOICE_BASE64_LENGTH =
	Math.ceil((MAX_VOICE_COMMAND_SECONDS * ANALYSIS_SAMPLE_RATE * 2 + 44) / 3) * 4
