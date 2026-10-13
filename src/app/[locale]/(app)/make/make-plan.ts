import { ORIGINAL_EDIT } from '../../editor/model/edit-snapshot'
import { editedStarts } from '../../editor/model/sequence'
import { applyChoices } from './make-questions'
import type { MakeReply } from './make-reply'
import { type MakeInput, type MakeSummary, planContext, type PlannedEdit } from './make-context'
import {
	askedLength,
	fitToLimit,
	lengthenForCheck,
	lengthLimits,
	openingMoment,
	shortLabel
} from './make-cut'
import {
	captionSettings,
	keyLineTitles,
	musicBed,
	planTitle,
	planZooms,
	screenTreatment,
	SHAPE_RATIO,
	shapeAndFit,
	withCallToAction
} from './make-look'
import { planSummary } from './make-summary'

// Make it: a whole edit planned from one request ("make this a reel").
// Gemini reads the transcript and small pictures of the video and answers
// in the shape in make-reply.ts; everything it names is checked and turned
// into an ordinary edit, so Apply hands the editor a snapshot like any other
// (one undo step, saved and exported as usual). The model only names
// sentences by number, frames by number and choices from fixed lists; the
// times, the crop and the levels are worked out from the transcript.
//
// planMake is here; its parts are in their own files, re-exported below so
// every caller imports from ./make-plan as before: make-reply (the contract
// with Gemini), make-request (what the request's words ask), make-context
// (the plan's shapes and context), make-cut (what's kept and how long),
// make-look (how it looks) and make-summary (what the plan says about itself).

export {
	applyCheck,
	CAPTION_LOOKS,
	type CaptionLook,
	CHECK_REPLY_JSON_SCHEMA,
	CHECK_TIMEOUT_MS,
	checkFound,
	type CheckReply,
	checkReplySchema,
	clipText,
	followUpPlan,
	FRAME_EVERY_SECONDS,
	FRAME_SEPARATOR,
	frameTimes,
	MAKE_FITS,
	MAKE_FORMATS,
	MAKE_REPLY_JSON_SCHEMA,
	MAKE_SHAPES,
	MAKE_STYLES,
	MAKE_SUBJECTS,
	MAKE_TRANSITIONS,
	type MakeAnswer,
	type MakeFit,
	type MakeFormat,
	type MakeReply,
	makeReplySchema,
	type MakeShape,
	type MakeStyle,
	MAX_ANSWER_LENGTH,
	MAX_FOLLOW_UP_LENGTH,
	MAX_FRAMES,
	MAX_MAKE_SECONDS,
	MAX_QUESTIONS,
	MAX_REQUEST_LENGTH,
	PAGE_GRACE_MS,
	PLAN_TIMEOUT_MS,
	SCREEN_TREATMENTS,
	type ScreenTreatment
} from './make-reply'
export {
	askedTreatment,
	inventedNames,
	isShortForm,
	quotedLine,
	saidInBrief,
	SHORT_FORM_MAX_SECONDS,
	SHORT_FORM_TARGET_SECONDS
} from './make-request'
export {
	type AskedLength,
	type BriefPart,
	type CutBasis,
	FACE_CORNER,
	isPlanEdit,
	type LengthLimits,
	type MadePlan,
	type MakeBasis,
	type MakeInput,
	type MakeSummary,
	type MusicTrack,
	type Opener,
	planContext,
	type PlanContext,
	type PlannedEdit,
	webcamOverScreen
} from './make-context'
export {
	askedLength,
	chooseSentences,
	cutEdit,
	type FittedCut,
	fitToLimit,
	keptRanges,
	lengthenForCheck,
	lengthLimits,
	type MadeCut,
	openingMoment,
	shortLabel,
	transitionJoins
} from './make-cut'
export {
	captionSettings,
	faceFollow,
	keyLineTitles,
	musicBed,
	planTitle,
	planZooms,
	screenTreatment,
	shapeAndFit,
	withCallToAction
} from './make-look'
export {
	describePlan,
	type FitLabel,
	type PlanChange,
	planChanges,
	planSummary,
	summaryWithLength
} from './make-summary'

/**
 * The edit a Make it reply describes, as a snapshot for the editor, and a
 * summary of it. Everything the reply names is checked: sentences and
 * frames that don't exist are ignored, a title naming anyone never
 * mentioned is left out. A short-form edit (a reel, TikTok or Short) is cut
 * to under a minute here, whatever the reply planned. Vertical follows a
 * face only when one person is the subject; anything else keeps the whole
 * picture, with black bars.
 */
export function planMake<Sound>(input: MakeInput<Sound>): {
	edit: PlannedEdit<Sound>
	summary: MakeSummary
	/** The reply as used: its sentences taken out as they were cut to fit or lengthened. */
	used: MakeReply
} {
	// What was clicked in place of Gemini's guess, then a length only the user asked.
	const applied = applyChoices(input.reply, input.choices, input.followUps)
	const length = askedLength(applied, input.request, input.choices, input.followUps)
	const context = planContext({ ...input, reply: { ...applied, maxSeconds: length.seconds } })
	const { reply, sentences, durationSeconds, picture } = context

	// What's kept, and how long it runs.
	const limits = lengthLimits(reply, input.request)
	const opener = openingMoment(reply.moments, sentences.length, limits.shortForm)
	const fitted = fitToLimit(context, limits, opener)
	const made = lengthenForCheck(context, fitted, limits, input.tooShort, opener)
	const { clips, cuts, segments, editedSeconds } = made.cut
	const starts = editedStarts(segments)

	// How it looks: the treatment, the shape, zooms, music, words on screen, captions.
	const screen = screenTreatment(context, input.unchecked)
	const { shape, design, transform } = shapeAndFit(
		context,
		limits.shortForm,
		screen?.treatment ?? null
	)
	// Text sits near the top of a frame taller than wide, clear of the captions.
	const tall =
		(shape.target === 'original' ? picture.width / picture.height : SHAPE_RATIO[shape.target]) < 1
	const autoZooms = planZooms(context, made.cut, starts, design, shape.how)
	const audioItems = musicBed(input.music, editedSeconds)
	const { title, titleDropped } = planTitle(context, editedSeconds, design, tall)
	const keyLines = keyLineTitles(context, made.cut, starts, title, design)
	const { autoTitles, callToAction } = withCallToAction(
		context,
		keyLines,
		editedSeconds,
		title,
		design
	)
	const { captions, ...captionFields } = captionSettings(
		context.look,
		reply,
		context.hasWords,
		design !== null,
		context.captionsAsked
	)

	const edit = {
		...ORIGINAL_EDIT,
		replacements: [],
		clips,
		cuts,
		title,
		...captionFields,
		transform,
		color: context.look.grade,
		audioItems,
		autoZooms,
		autoTitles,
		design
	}
	const summary = planSummary(context, {
		limits,
		made,
		short: shortLabel(limits, editedSeconds, durationSeconds, input.tooShort),
		opener,
		captions,
		edit,
		callToAction,
		titleDropped,
		music: input.music,
		musicAvailable: input.musicAvailable,
		shape,
		screen,
		choices: input.choices,
		lengthSaid: length.said,
		look: { preset: context.look.preset, said: context.lookSaid }
	})
	return { edit, used: { ...reply, removeSentences: made.removeSentences }, summary }
}
