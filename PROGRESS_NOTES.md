# Retake — progress notes (handoff)

Written 2026-10-02 at the end of a long Claude Code session, so that a fresh
session with no memory of it can carry on. Read this whole file, then
`AGENTS.md` and `CLAUDE.md`, before touching anything.

> **Read this first: where things stand on `main`** (updated 2026-10-13)
>
> - **Retake:** a local-first AI video editor: Make it with AI, a manual timeline editor, and automatic cleanup with re-recording.
> - **Pages:** landing, Privacy, sign-in, Home, Projects, Make it, the editor. No Pricing, Features, How it works or Contact page; old URLs redirect (`MOVED_PAGES`, `next.config.ts`).
> - **No contact form or `CONTACT_IP_SECRET`** (removed in #50); `contact_messages` is kept, read by `pnpm contact:messages`.
> - **Seven paid AI actions,** signed-in only, each taking one of a daily allowance per kind: 300 typed commands, 200 spoken, 30 transcripts, 30 highlight searches, 60 Make it steps (`src/lib/ai-limits.ts`).
> - **The allowance comes back** only for an unset key or a 4xx/5xx reply; an unusable reply, a timeout or any other error keeps it used (`src/server/ai/not-charged.ts`).
> - **An unset AI key** sends no request, shows "The AI isn't available right now", and the log names the setting.
> - **Every AI call** goes through `src/server/ai/` with a required time limit (30 or 60 s) and an output cap, and writes one `ai_usage` row, priced when written.
> - **Tests:** 679 unit (1 skipped on Windows), 142 e2e in 28 files, 6 database tests (`pnpm test:db`) on real Postgres.
> - **CI:** commits (pull requests only), check, ai-models, build, e2e (4 shards), migrations, db-tests.
> - **Largest code:** `VideoEditor` is one 2,260-line function (`video-editor.tsx`, lines 199 to 2458, a 2,458-line file), being split one PR at a time (4 hooks and the file's helpers done; the plan is in section 3zzr). Make it's planner is split by concern: `make-plan.ts` (231 lines: `planMake`, 82, and re-exports) and `make-reply`, `make-request`, `make-context`, `make-cut`, `make-look`, `make-summary` (102 to 499 lines each).
> - **No admin console, feature flags, API routes or production-migrations workflow** (removed in 3zzo); their tables `admin_members`, `feature_flags` and `feature_flag_overrides` stay in the schema, unused, until a migration drops them.
> - **Decisions, trade-offs and known limits:** ARCHITECTURE.md.

> **History, newest first (each entry was true when it was written)**
>
> - **VideoEditor's tools in their own hook** (section 3zzz).
> - **All seven paid actions tested against real Postgres** (section 3zzy).
> - **One Supabase call per paid action** (section 3zzx).
> - **Docs say it isn't deployed; CRON_SECRET removed** (section 3zzw).
> - **VideoEditor's helpers and two small components in their own files** (section 3zzu).
> - **VideoEditor's fourth hook: re-recording** (section 3zzt).
> - **VideoEditor's third hook: the project file** (section 3zzs).
> - **VideoEditor's second hook: the picked item** (section 3zzr).
> - **VideoEditor's first hook: keyboard shortcuts** (section 3zzq).
> - **make-plan.ts split by concern** (section 3zzp).
> - **Unused template code removed** (section 3zzo).
> - **Docs true of main; the allowance back only when not charged**
>   (section 3zzn).
> - **A short README** (section 3zzm).
> - **Tests against real Postgres and the real Gemini SDK** (section 3zzl).
> - **Contact code removed; daily AI limit in the FAQ** (section 3zzk).
> - **One landing page; the editor fits the window** (section 3zzj).
> - **Redesign** (section 3zzi): the whole site and app in the owner's new
>   design: violet-black, Funnel type, the landing page as scroll scenes.
> - **Hardening** (section 3zzh): no admin seat from an email domain, an
>   output-token cap per Gemini feature, PostHog without autocapture or
>   recording, an atomic contact limit and `pnpm contact:messages`, no
>   Supabase call on public pages, and a lint rule for Deepgram.
> - **Copy and docs say what's true** (section 3zzg): no music promised
>   from Make it, "Make it steps" on Pricing, a generic message for a
>   refused AI key (the detail in the log), and ARCHITECTURE.md and
>   DESIGN.md corrected, with a Scope section on what a hosted launch
>   would need.
> - **Two fixes from the fifth real run** (section 3zzf): a webcam bubble
>   over a screen recording is treated as a screen (so "make an ad" is
>   designed), and a clicked look never counts as the user's words for a
>   brief part (Gemini's "bold" tone reads as chosen, not "From your
>   brief").
> - **The commit-message check runs on Windows** (section 3zze): it used to
>   exit 0 there without checking anything, so the local hook let any
>   message through; CI (Linux) was never affected.
> - **Make it's four looks** (section 3zzd): Clean, Bold, Cinematic and
>   Playful each set the colour, captions, one eased transition, the
>   title's animation, the zoom on key words and the pacing at once, in
>   colours from the video that always read. A look question when the
>   request names none (at most five questions); a follow-up switches it.
> - **The user decides how long it runs** (section 3zzc): a length question
>   when the request states none; a click is the plan's most, an ad left to
>   "You decide" runs at most 30 s, and a length Gemini invents never
>   limits the plan.
> - **Make it asks a few quick questions** (section 3zzb): only what the
>   request leaves open, fixed choices, no AI call; clicked answers are
>   the user's words and win over Gemini's, skipped ones are labelled as
>   chosen. A request can be up to 1,000 characters.
> - **planMake is a short list of named, tested steps** (section 3zza):
>   63 lines instead of 510, the same plans for the same inputs (100
>   captured scenarios and the owner's real runs replayed).
> - **The editor's files are grouped into folders** (section 3zz): logic
>   in `model/`, `overlays/`, `audio/`, `assistant/`, `export/` and
>   `projects/`, the interface in `components/`; a move only, every test
>   unchanged and passing.
> - **README and ARCHITECTURE.md describe main as it is** (section 3zy):
>   what Retake is, how to run it, the production settings, the tests and
>   CI; the architecture with a diagram, the decisions and their trade-offs,
>   the known limits and what to do next.
> - **A daily AI allowance per user** (section 3zx): each of the seven paid
>   AI actions takes one of the user's daily allowance by kind (set in
>   `src/lib/ai-limits.ts`) before the provider is called; at the ceiling a
>   plain message says when it resets. A failed or timed-out call is given
>   back.
> - **Contact form limit and a safe sign-in redirect** (section 3zw): the
>   contact form has a hidden honeypot field and a per-sender limit (5 an
>   hour by a keyed hash of the IP; 30 an hour shared when unknown);
>   sign-in only ever goes back to a page on Retake. Production needs
>   `CONTACT_IP_SECRET`.
> - **Paid AI actions need a signed-in user** (section 3zv): each of the
>   seven checks the session itself and fails closed (401), whatever the
>   page redirect does; a production server without the Supabase settings
>   logs which to set and exits with code 1; Deepgram and the editor's
>   Gemini calls have time limits.
> - **Saves, exports and re-linking you can trust** (section 3zu): a save
>   is done only once its one transaction commits (storage full says so
>   plainly, nothing left behind); hiding the tab stops an export with a
>   message and no file; re-linking checks a fingerprint of the file's ends.
> - **Make it: an honest brief, and designed text that never overlaps**
>   (section 3zt): a brief part is "From your brief" only in the user's own
>   words, else "Chosen for a promo / for you"; a popping caption word's
>   neighbours make room inside the safe margins; a designed frame's title,
>   key lines and call to action sit above the captions, smaller to fit, or
>   the captions wait.
> - **Make it: the user's words decide a screen recording's treatment**
>   (section 3zs): Gemini's filled-in `treatment` and `fitAsked` count only
>   when the request (or a follow-up) really asks; the plan card says "As
>   you asked" only then.
> - **Export waits for the transcript** (section 3zr): the Export
>   button says "Getting ready…" until the editor has its transcript, and an
>   export that comes out empty is reported, not downloaded.
> - **Make it: a screen recording's two treatments** (section 3zq): the
>   whole screen (default) or designed with no picture at all (for an ad,
>   promo, teaser or highlights reel, or "text only"); never a cut-out.
> - **Make it: only a meeting is ever a corner card** (section 3zp): the
>   card no longer rests on Gemini's label being right; the owner's real
>   recording (screen + webcam bubble) is labelled `one_person`.
> - **Make it: a screen recording is never a corner card** (section 3zo): a
>   reel of a screen recording showed a palette background and the screen
>   tiny in the lower left; it now shows whole, full width and centred.
> - **Make it: shapes, fit and briefs** (section 3zn): the plan picks a
>   shape (9:16, 1:1, 4:5, 16:9 or the video's own) and a fit (bars, blur,
>   fill) and says why; ads keep their own shape and the whole picture
>   unless asked. A brief's parts are listed on the plan; its length limits
>   the edit and its call to action closes it.
> - **Make it: follow-ups in the chat** (section 3zm): after Apply, the
>   chat beside the edited video changes the plan ("make it shorter",
>   "remove the intro"): what would change is listed against the plan
>   before, applied on Apply as one undo step; questions when unclear, and
>   what it can't do said plainly. Text only: the pictures aren't sent again.
> - **Make it: the plan's summary and length agree** (section 3zl): the
>   summary is cut on a word (room for 400 characters), says the edit's real
>   length, and a check that finds a reel too short lengthens it, or the plan
>   says plainly that it is short.
> - **The site shows the real app, in the mockups' layouts** (section 3zk):
>   screenshots and footage (a Pexels sunrise, no people; CREDITS.md) in the
>   mockups' own slots, made by `e2e/site-shots.ts` (`pnpm shots`, fake AI,
>   ffmpeg); Make it's plan and the editor after Apply as in the mockup.
> - **App screens, UI only** (section 3zj): the app home has two ways in
>   (Make it with AI, Edit manually; the "Edit with AI" row is gone, the
>   owner's decision). Make it is a chat beside the video once asked; Apply
>   opens the edited video with only the chat ("Edit with AI" view), and
>   "Edit manually" (on the plan, or in the editor's top bar) opens the full
>   editor on the same edit.
> - **Redesign to the owner's design files** (section 3zi): the whole site
>   and app re-skinned to `design/landing.html` and `design/app.html` (night
>   blue and violet, Instrument Serif + Manrope, glass pill bar); new
>   Pricing and Privacy pages; Contact with name and topic plus the FAQ;
>   a split-screen sign-in; the home's two ways in, Make it handed a video
>   from Home, projects searchable and sortable. Logic unchanged.
> - **Make it: time limits and plain AI errors** (section 3zh): planning gives
>   up after 60 s (the second check after 30 s), the page after 65 s; a
>   refused key, a usage limit or a busy AI shows the server's plain words
>   and is logged; pictures go at medium detail (a quarter of the tokens).
> - **Make it: designed verticals** (section 3zg): a reel/TikTok/Short/ad of a
>   video whose picture doesn't carry it (a still meeting, an unchanging
>   screen) is no longer a small picture in black bars: a 9:16 frame designed
>   around the speech (a moving background in the style's colours, the
>   picture a small rounded card or left out, big title and key-line cards,
>   centred captions popping each word, a progress bar and a sound-wave),
>   drawn by one set of functions in the preview and the export.
> - **Make it, part 2: quality** (section 3zf): kinetic text (a title and key
>   lines quoted from the speech, coming in word by word, popping, sliding or
>   fading by style), caption looks (a word at a time, the spoken word
>   highlighted, large), slide and zoom-cut transitions used sparingly, short
>   videos filled to 50–59 s with whole thoughts and opening with the
>   strongest, and a second, cheap Gemini check of each plan against the
>   request (both calls in `ai_usage`). Part 3 (create from scratch,
>   follow-up requests) not started.
> - **Make it, part 1** (section 3ze): a Make it page and Home card. Upload a
>   video, say "make this a reel / funny / professional / an ad"; Gemini reads
>   the transcript and a small picture every 2 s, asks 1–3 questions only when
>   the request is unclear, and the plan is shown with Apply / Cancel. Apply
>   opens it in the editor as one undo step: cut dead parts and fillers,
>   word-by-word captions, zooms, transitions, ducked music from
>   `public/music` (empty for now: no music, said so), a 9:16 crop that
>   follows the face (centred when none). Not built yet: create-from-scratch,
>   follow-up requests, the second plan check.
> - **Redesign, stage 2: the editor** (section 3v): chat left, video and
>   timeline centre, searchable tools right, hideable sides, saved sign and
>   job progress, keyboard shortcuts; new: logo and text rotation, a zoom
>   aimed on the video, chat attach by file type.
> - **Redesign, stage 1: the website** (section 3u): one design system, dark
>   and light mode, public pages, local accounts (Supabase Auth), a home page
>   that starts a project (type, attach, speak), a Saved projects page, and
>   Contact saved to the local database. Stage 2 (the editor's layout) next.
> - **Full undo/redo** (section 3c, `f3c0de5`): Undo and Redo buttons,
>   Ctrl+Z and Ctrl+Shift+Z / Ctrl+Y, a 50-step history over trim, cuts,
>   clips and re-recorded takes.
> - **Reset to original** (section 3c) and **preview speed** 0.5–2×
>   (section 3d), `471fd28`.
> - **Motion graphics v1** (section 3e): a title card and a PNG watermark,
>   from the Graphics panel or a typed command, in the preview and the
>   export. The new command shapes were checked against real Gemini (7
>   calls, $0.0013, approved). `49b9c51`.
> - **Automatic captions** (section 3f): from the transcript's word timings,
>   in edited time, over the bottom of the preview and the export; on/off is
>   one undo step, reset turns them off, "turn captions on" works as a
>   command. No new API call. `3b697e7`.
> - **Exports can come out the wrong length under memory pressure**
>   (section 4f): up to ~0.23 s long or ~0.5 s short, measured. Not fixed:
>   no cheap, safe fix exists yet. **The user is now warned:** after each
>   export the file's real length is compared with the edit's, and a miss
>   over 0.25 s shows "This export came out X s too long/short…" in place of
>   "Export finished". The download is unchanged.
> - **A failed AI call now records why** (section 3g): `error_type` and
>   `error_status` in the `ai_usage` row's `meta`, never the message. Checked
>   with a real failed Gemini call (row 74, `ApiError`, 400, no spend).
> - **The logo by hand** (section 3t): drag it anywhere on the preview,
>   drag its corner to resize it (shape kept), or use the arrow keys, + and
>   −, or a "Logo size (%)" field; PNG or JPG. A corner button or a logo
>   command puts it back in a corner (bottom-right when none is named).
>   Checked on a real 1080p recording: the export puts it where the preview
>   shows it. Captions were already right: off by default, at the bottom.
>   No new API call.
> - **Motion graphics: entrances, exits, a lower third, a zoom** (section
>   3s): the title and on-video text come in and go out with a fade, a slide
>   (from a side) or a pop, over a set time; a lower third (name and
>   subtitle in a band) slides in at a time and out after a duration; a
>   push-in or pull-out eases the whole picture between two times. All on
>   the edited timeline, in the preview, the Edited side and the export, one
>   undo step each, cleared by reset, saved with projects, and as typed
>   commands. Verified on real exports (positions, sizes and zoom measured
>   at known times). Real Gemini: 11 calls, $0.0070; ~857 input tokens.
> - **Save and reopen projects** (section 3r): a Save button with a name,
>   autosave after each change once saved, My projects to reopen or delete,
>   "save the project" / "open my project X". Kept in this browser
>   (IndexedDB; the user's choice): the edit, its media (videos copied in
>   once), and the transcript, so reopening calls no Deepgram. Verified:
>   a project with seven kinds of edits reopened after a reload with the
>   same timeline and an export matching the original's. Real Gemini: 10
>   calls, $0.0059.
> - **Several videos in one project** (section 3q): add another video (a
>   button, or "add another video"), placed as a clip after the others;
>   trim (its own), split, reorder, speed, color and transitions work on its
>   clips; a video of another shape is letterboxed into the first one's
>   frame. The transcript, captions, clean-up and re-recording stay the
>   first video's. Undo and reset take added videos away. Real exports: each
>   video's picture and sound in place. Real Gemini: 10 calls, $0.0058.
> - **Separate audio: the Audio lane** (section 3p): add an audio file at a
>   chosen time, or take a clip's sound out into its own track (the clip goes
>   silent); move, trim, volume, mute, delete; mixed over the video in the
>   preview and the export. The user picked the core slice with typed
>   commands; extracting refuses sped clips and clips with a take. Commands
>   checked against real Gemini (12 calls, $0.0069); ~716 input tokens.
> - **Color adjustments, text styling and the pencil** (section 3o):
>   brightness, contrast, saturation and black and white / warm / cool for
>   the whole video and per clip, as one color matrix per clip (an SVG
>   feColorMatrix: CSS filter in the preview, canvas filter in the export;
>   no filter at all when nothing is set). Font, size, color and background
>   for the title, captions and on-video text; a freehand pencil pinned to
>   the picture. The preview matches the export to the level in screenshots.
>   Typed commands checked against real Gemini (28-command sweep, $0.0153);
>   a command is now ~656 input tokens, ~550 micro-USD.
> - **Transitions, delete and duplicate** (section 3n): a fade through
>   black or a dissolve between adjacent clips, in the preview (a second
>   player fades in over the first through a dissolve), the Edited view and
>   the export (two players take turns, both drawn and mixed through a
>   dissolve); delete and duplicate clips. Measured on real exports: black
>   and silence at a fade's join, an even red/blue and 440/880 Hz mix half
>   way through a dissolve, lengths within 0.06 s. Typed commands checked
>   against real Gemini (11 calls, $0.0045); a command is now ~534 input tokens.
> - **Clip speed** (section 3m): a clip really plays 0.25× to 4× in the
>   preview, the Edited view and the export, its pitch kept (measured 440 Hz
>   at 2× and ½×); the edit's length, captions and fades follow. A clip with
>   a re-recorded sentence stays at 1×. Typed commands checked against real
>   Gemini (9 calls, $0.0037); a command is now ~487 input tokens.
> - **Clip volume and fades** (section 3l): volume 0–200%, mute, fade in and
>   out per clip, in the preview (through a Web Audio gain) and the export;
>   a re-recorded take keeps its level matching with the clip's on top.
>   Typed commands checked against real Gemini; the command prompt was
>   rewritten terse: ~680 → ~416 input tokens a command.
> - **Picture transforms and pixelate** (section 3k): crop (presets and a
>   free crop box), rotate to any angle (handle, degrees field, 90° buttons;
>   the frame grows to hold the turned picture, corners black), flip, and
>   pixelate as an annotation. Annotations are pinned to the picture; title,
>   captions and logo stay in the frame. Preview and export use one matrix.
>   Typed commands checked against real Gemini (5 calls, $0.0022).
> - **Audio problem flags** (section 3i): clipping, sustained quiet speech
>   and a loud background, found in the audio (no API call) and flagged on
>   the timeline; click to jump, a plain line says what each means, nothing
>   is changed and nothing enters the undo history. Thresholds set from eight
>   real recordings: **`Cap.mp4` raises no flags**, and 7 of the 8 raise
>   none; one WhatsApp video is flagged as a loud background throughout,
>   which needs a listen.
> - **Annotation layer, 80/20 slice** (section 3h): filled boxes (any color),
>   blur boxes and text, drawn on the preview, moved and resized, each with
>   its own time in an Annotations lane; eraser; preview, Edited view and
>   export; one undo step per change; typed "box"/"blur" commands. **Not
>   built (the user picked the slice):** the freehand pencil, text color, a
>   text command. Both new command shapes and a refusal were checked against
>   real Gemini (3 calls, $0.001, approved).
> - **Every editor action as a typed command** (section 3g, `4a7186d`): split, merge,
>   move, clean-up, undo/redo/reset, preview speed, re-record (opens the
>   panel or says why not) and export, each confirmed first; all 18 command
>   shapes checked against real Gemini.
> - **Clip speed (changing a clip's speed in the export) is not started:**
>   the user wants the effects on the timeline, pitch, re-record spans,
>   transcript timing and export explained first, and to decide.
> - **Since then (`4574ee4`):** a live mic meter in the Record panel, a
>   hint to pause before Stop, and a take cut off mid-speech is refused. The
>   ±12 dB gain cap was confirmed as the cause of the level shortfall and
>   kept (section 3b, "Gain").
> - **Re-record and splice, audio-only v1, is committed** in `e42ad94`
>   (section 3b): click the mic beside a transcript sentence, record, preview,
>   Use new take / Cancel; it plays in the editor and in export, and Undo
>   takes it back. Verified with unit tests, a fake-mic e2e test, and seam
>   measurements on a real re-recording of `Cap.mp4`.
> - **Joins set by ear** (section 3j) now cover sentences with no clean
>   pause (19 of 30 on `Cap.mp4`): two zoomed waveforms with a handle each,
>   then the same record/preview/apply/undo/export path. The UI says a
>   by-ear join isn't guaranteed clean. A by-ear take now fades in and out
>   over 10 ms at its own edges: on the user's real export, that takes the
>   seam-2 click away with no added dip (section 3j). The editor no longer
>   holds the picture ~0.45 s at a take's start join. Two playback bugs the
>   user found (preview froze, edited playback looped) are fixed.
> - **Export (queue item 7) is committed and pushed** in `2c2f0a5`. Before
>   committing: 166 unit tests, Prettier, lint, typecheck and the production
>   build passed, and the full e2e suite passed 17/17 in each of two runs,
>   one from a cold start. A/V sync at 1080p H.264 was measured and is fine
>   (section 4b).
> - **Export's known limitations:** exporting takes as long as the edit
>   runs, because it records in real time. The file opens with a lead-in of
>   about **40–65 ms**, not the ~0.15 s these notes used to say: that figure
>   was a measurement artifact, and the proposed fix had no effect (section
>   4b, corrected 2026-10-02).
> - **Known flake:** under peak e2e load the dev server occasionally pauses
>   for 3–6 s (section 4c). Observed, cause unknown, not profiled.
> - **This machine has 7.5 GB of RAM and swaps hard when many apps are open**
>   (section 4d). Real-time export measurements made while it swaps are
>   noise. Check free memory before measuring.

---

## 1. Project overview

**Retake** is an AI video editor built for the 8x Playmakers trial. It
**fixes and polishes recordings people already have** (talks, screen
recordings, to-camera takes) rather than creating video from scratch. You
upload a take and clean it up, by typing what you want or by editing by
hand.

**Signature identity: "re-record and splice."** The product's defining move
is to let you re-record a bad stretch of a take and splice the new
recording in, instead of reshooting everything. An audio-only first
version is built: section 3b.

**Three pillars:**

1. **Prompt editing:** type a command ("cut from 2 to 5 seconds") and an
   LLM parses it into a structured edit. The edit is shown for confirmation
   and only then applied. AI also finds problems for you: long silences and
   filler words.
2. **Manual editing:**
   - trim handles
   - a filler cut editor with draggable edges
   - split, reorder and merge clips
   - before/after comparison
   - export
3. **Motion graphics:** v1 is a title card and a watermark (section 3e).
   Lower thirds and animated overlays are not started.

**Stack** (template rules in `AGENTS.md`): Next.js 16 (Turbopack, React
Compiler with `panicThreshold: 'all_errors'`), React 19, next-intl
(strings in `messages/en.json`), TanStack Query, Tailwind v4 tokens,
Prisma, a **fully local** Supabase, and Playwright e2e plus `node:test`
unit tests (`*.test.mts`).

**Where the editor lives:** `src/app/[locale]/editor/`. Everything happens
client-side in the browser except the two AI calls, which are server
actions in `actions.ts`.

**Editing model (non-destructive):**

- `Edit = { trim, cuts }`, in `cleanup.ts`: what is removed.
- `Clip = { id, ranges: SourceRange[] }`, in `sequence.ts`: how the take is
  arranged. `clips === null` means the whole take as one clip.
- `playableSegments(clips, edit)` is the exact list of source ranges that
  plays, in order. Both the player and export consume it.
- The `useSequencePlayback` hook (`use-sequence-playback.ts`) drives the
  single `<video>` element through those segments: a frame loop jumps
  between them, and `seek`, `settle` and `restartIfAtEnd` handle the edges.
- The source file is never modified, so every edit can be undone.

## 3zzd. Make it's four looks (2026-10-12)

A reel or an ad should look like one designed piece, not a set of
defaults. Presets, rules and every changed test agreed with the owner
before building.

- **Four looks** (`make-presets.ts`): Clean, Bold, Cinematic, Playful. A
  look sets the picture's colour grade, a designed background (its
  colours, a thin or thick bar, Playful's wave), the captions (mode,
  font, size; Cinematic serif, a dark band over the picture and none on
  its designed background), one transition for the whole video, eased
  (Clean dissolve 0.4 s, Bold slide 0.4 s, Cinematic fade 0.8 s, Playful
  zoom cut), the title's animation (fade, slide, word by word, pop),
  zooms on key words at its own strength, and how long text holds. A
  music mood is defined and unused. The editor's text styles gained an
  optional highlight colour, designed frames an optional look, joins an
  optional `eased`; nothing existing changed meaning.
- **Which look:** the latest the user asked for wins (a chat follow-up
  naming one, else the click, else the request, whole words only), else
  the style's own (reel and ad Bold, professional Clean, funny Playful;
  Cinematic only when asked). The plan card's first line says "As you
  asked: a Cinematic look" or "Chosen for you: a Bold look, as suits a
  reel". The four Make it styles stay what the video is.
- **Colours from the video** (`video-colours.ts`): the most telling
  saturated hue of the pictures Make it already takes (greys, near-black,
  near-white left out; none under 1% colour, then the look's own colour).
  Every text and highlight colour reads at 4.5:1 or more (WCAG AA) on any
  picture and on its designed background. Unit tests check every look on
  16 video colours.
- **Bold on a designed background** (chosen by the owner from three
  rendered variants, after a complementary magenta block was rejected):
  no fill, white text with a soft shadow, and the word being said, one at
  a time, in the video's own light accent; the title white. The progress
  bar is the accent. Bold's background is deeper (its light end 0.18, its
  shapes 0.25) so white and the accent both read at 4.5:1 or more against
  it as drawn: the gradient's ends and the soft shapes at their most
  (`MAX_SHAPE_COVER`, all three shapes' middles at once), with no credit
  for the shadow. Where they wouldn't, the look falls back to the light
  accent as a solid block behind black text; across 1,080 video colours
  none needs it (worst 4.64:1), and the accent stays within 1° of the
  video's own hue. One word at a time holds each word until the next
  starts inside a spoken line; only a pause that ends the line (over
  0.7 s) shows nothing, as in every look.
- **The look question:** "Which look?" Clean · Bold · Cinematic · Playful
  · You decide, after the length, only when the request names no look.
  Never more than five questions: an ad with nothing named would show
  six, so tone is left out (still read from the user's words, and
  labelled "Chosen for you" when Gemini picks it).
- **Captions the user asks about:** when the request, an answer or a
  follow-up mentions captions or subtitles, Gemini's caption choice is
  kept at its own size, in the look's colours and font ("make the
  captions bigger" works after "more cinematic"); otherwise the look
  decides. Captions off is always kept.
- **A follow-up that switches the look** shows "Look: Bold to Cinematic"
  first in the chat's list of changes, so it can be applied even when
  nothing else changes.
- **Replays:** the 100 captured plans were regenerated; field by field,
  1,158 look fields changed and 25 others, all the edit's length (and the
  music bed's and the summary's stated length that follow it) in nine
  scenarios, each from the transition its look sets. No clip range,
  sentence count, shape, treatment or label changed. The owner's three
  real runs keep their lengths.
- **Existing tests changed, each approved by the owner** (listed side by
  side in the PR): 7 tests in `make-plan-steps`, 5 in `make-plan`, 4 in
  `make-questions`, 5 e2e (one split in two), and the replay fixture.
- **Tests:** unit tests for the looks, colours, contrast, choice, the
  question, the cap, easing, captions asked for, and look changes; e2e
  for the look question, a look switch in the chat, Playful's highlight
  in its colour, and Cinematic's serif in the export (the same large
  caption exported in Cinematic and Clean differs, so the serif is real).
  Each rule removed on purpose (17 for the looks, 19 for Bold's text, and
  3 for the preview's) made a test fail. Unit 667 to 693; e2e 132 to 138. Frames of every look on the owner's two recordings
  are in `Desktop\style1`.

## 3zze. The commit-message check runs on Windows (2026-10-12)

`scripts/check-commit-message.mjs` only ran its checks when its own file
URL equalled the text "file://" plus the script's path. On Windows those
never match (`file:///C:/...` against `file://C:\...`), so the script exited
0 without checking anything: the `commit-msg` hook let any message
through, and PR #41 failed only in CI, on two subjects that began with a
capital. It now compares against `pathToFileURL(process.argv[1]).href`, as
`check-rls.mjs` and `check-standards.mjs` already do.

- **Tests** (`scripts/check-commit-message.test.mjs`): the script run as
  a real process, as the hook runs it (a message file) and as CI runs it
  (`--range` over a throwaway git repo): a bad message exits 1 and a good
  one exits 0 in each. On the unfixed script both tests failed on Windows
  (exit 0 for a bad message). Unit 693 to 695.
- **Checked by hand:** the hook now refuses `git commit` with a
  capitalised subject, and allows a good one.
- **Not fixed here:** `scripts/run-once-sql.mjs` has the same entry-point
  test, so run directly on Windows it does nothing. Left for its own
  change.

## 3zzf. Two fixes from the fifth real run (2026-10-12)

One real run (the owner's, $0.028: one plan call and its check) of "make
an ad" on the 4:41 screen recording, with vertical, 30 s, Bold and "Follow
for more" clicked and tone skipped. Its replies are fixtures
(`e2e/fixtures/real-run5-*.json`).

- **A webcam bubble over a screen is a screen.** Gemini called the
  recording one person, with a corner card and the face at the bottom left
  of every picture (x 100, y 750 on its 0 to 1000 grid), so the screen
  rules never ran and the ad showed the whole screen with black bars.
  `webcamOverScreen`: one person, a corner card, and the face in a corner
  (x and y each at most 300 or at least 700, `FACE_CORNER`) in at least
  half the pictures with a face, counts as a screen recording for its
  treatment. Replayed: "make an ad" is now designed with no picture; "shorten
  this walkthrough" shows whole. A face in the middle, or off-centre but not
  in a corner, is unchanged; with no face positions, the label decides as
  before. Known limit: a speaker sitting in a corner of their own frame
  counts as a bubble. A corner card alone wasn't enough: Gemini gives one
  whenever a face shows.
- **A clicked look is no brief part.** The look's words ("A bold look.")
  counted as the user's, so Gemini's unasked "bold" tone read "From your
  brief". The answers' words still count as the user's, the look click
  alone doesn't (it sets the look directly). The card now reads "Chosen for
  a promo: bold tone" (an ad reads as a promo; that wording is unchanged).
- **Tests:** 7 unit tests (`make-real-run5.test.mts`) and 1 e2e (the
  questions spec), with the saved reply. Each of the 7 rules removed on
  purpose made a named test fail, and the e2e fails without either fix. No
  existing test changed; the 100 replay scenarios are unchanged. Unit 695
  to 702; e2e 138 to 139.

---

## 3zzz. VideoEditor's tools in their own hook (2026-10-14)

Local branch `local/architecture`, not pushed.

- **The move:** the rail's tools (the `tool()` helper and the `tools` array:
  14 tools, each an icon and its panel's JSX), 330 lines of `VideoEditor`,
  moved unchanged into `useEditorTools`
  (`components/shell/use-editor-tools.tsx`, 602 lines). It's called where the
  block was, with the 87 editor values it reads passed by name; all 87 are
  declared earlier in `VideoEditor` (lines 200 to 1546 before), so nothing
  was reordered. 33 imports went with it (31 panels and icons,
  `resizedLogo`, `transitionInto`); six used by both files are imported in
  both.
- **A hook, not a plain function:** React Compiler compiles only components
  and hooks. As a hook, each panel's element stays memoized on the values it
  reads; a plain function wouldn't be compiled, and the open panel would
  re-render on every playback frame (the playhead is one of the 87).
  ARCHITECTURE.md's known limits say so.
- **Proved the same:** the 330 moved lines are byte-for-byte identical to
  the block they replace (`diff` and `diff -w` both empty). Every other change
  to `video-editor.tsx` is in its imports, plus the call; two imports left with
  only types became `import type`. The hook-call order in `VideoEditor` is
  unchanged: the same 75 calls in the same order, with `useEditorTools` 76th,
  after them all. No runtime import cycle, before or after.
- **Size:** `video-editor.tsx` 2,458 to 2,180 lines; `VideoEditor` 2,260 to
  2,019 lines (lines 162 to 2180).
- **Tests:** none changed; unit 684, database 13. Full e2e on a production
  build (:3200, invalid AI keys): 141/142 in 36 minutes. `make-it.spec.ts:808`
  timed out waiting for an export's download, then passed twice when rerun
  alone; it's on the Make it page, which doesn't use `VideoEditor` (see 4c).

---

## 3zzy. All seven paid actions tested against real Postgres (2026-10-14)

Local branch `local/architecture`, not pushed.

- **What's new:** `paid-action.db-test.mts` ran only `parseEditCommand`; it
  now runs the other six as well (`findHighlights`, `planMakeIt`,
  `checkMakePlan`, `followUpMakeIt`, `transcribeTake`,
  `transcribeVoiceCommand`): the real action, allowance, wrapper (the real
  Gemini SDK; Deepgram's own `fetch`) and usage sink, against real Postgres.
  Gemini, Deepgram and OpenRouter answer through the stand-in `fetch`; any
  other URL throws, so no real call can leave.
- **Each test checks:** the action's result; what went on the wire (Gemini:
  model, key, the feature's output cap, the plan's two pictures at medium
  detail, no pictures in the check or the follow-up; Deepgram: `nova-3`,
  `filler_words`, `punctuate`, the `Token` header, `audio/wav`, the audio
  bytes whole); the right allowance kind taken by one; and the one `ai_usage`
  row, priced (Gemini by tokens, e.g. 900 micro-USD for the plan; Deepgram
  per minute: 4,300 for a minute, 215 for 3 seconds). A seventh new test: a
  busy Deepgram (503) shows the plain message, gives the voice allowance
  back, and records the failure unpriced.
- **Only their own rows:** one fresh random user; `ai_usage` rows removed by
  the fake's own request ids, or as the single failed row carrying its 503.
  Local counts before and after: `ai_usage` 457 (max id 491), `ai_allowances`
  10, `users` 5, `auth.users` 5, identical; no `test-` request id left. A
  snapshot of every public table, `auth.users`, `auth.sessions` and
  `auth.refresh_tokens` (count and an md5 of every row) was identical before
  and after a run; only the `ai_usage` id sequence moved (546 to 555: nine
  rows written, nine removed).
- **The tests can fail:** with the highlights action set to the command
  allowance, Deepgram's `filler_words` off, and the plan's medium detail
  removed, the highlights, both Deepgram and the plan tests failed; restored
  after.
- **Unchanged:** the two existing tests. Their helpers `waitForUsage` and
  `used` gained an optional feature and kind, defaulting to the typed
  command's, so their calls read as before.
- **Tests:** database tests 6 to 13; unit 684, unchanged. Full e2e on a
  production build (:3200, invalid AI keys): 142/142 in 33.4 minutes.

---

## 3zzx. One Supabase call per paid action (2026-10-14)

Local branch `local/architecture`, not pushed.

- **The change:** `src/proxy.ts` no longer looks the session up for a server
  action (a POST with Next's `next-action` header) posted to a signed-in page
  (`/home`, `/make`, `/projects`, `/editor`). The action checks it itself
  (`validatedAction` → `requireUser`, a 401 when it can't confirm it), and its
  Supabase client saves a refreshed session in the action's response. Page
  loads, POSTs without the header, and `/login` and its actions are unchanged.
  The comment in `src/lib/supabase/server.ts` that said the proxy refreshes
  on every request is corrected.
- **Behaviour change, deliberate:** a signed-out paid-action call on a
  signed-in page used to get the proxy's 307 to `/login`, which the page
  showed as Next's "UnrecognizedActionError: Server Action … was not found on
  the server"; it now gets the action's own refusal, shown as "Couldn't run
  that command — Sign in to use this."
- **Proved in a browser** (production builds of the old and new proxy on
  :3200, real local Supabase, the e2e user, no AI keys so nothing left the
  machine): (a) signed out on the editor and (b) the session ended on
  Supabase's side while the editor was open both show "Sign in to use this."
  (before: the UnrecognizedActionError); (c) signed in with an access token
  marked expired, the call gets through and the session is refreshed, its new
  cookie set on the action's own response. Auth's log for (c): one token
  refresh and 3 user lookups, against 4 before (the proxy's is the one gone).
  The two `ai_usage` error rows it wrote were removed (457 rows before and
  after).
- **Tests:** 3 new in `proxy.test.mts` (an action POST to a signed-in page:
  no Supabase call, no redirect; a POST without the header still guarded;
  `/login` actions unchanged) and 2 in the new `server.test.mts` (a refresh in
  an action is written to the response's cookies; in a Server Component it's
  skipped quietly). With the change removed, the first proxy test fails. The
  existing refusal tests for the 7 paid actions are unchanged.

---

## 3zzw. Docs say it isn't deployed; CRON_SECRET removed (2026-10-14)

Local branch `local/architecture`, not pushed (GitHub CI is blocked by billing).

- **`docs/rules/deployment.md`** said the app auto-deploys to Vercel on a push
  to `main`; it now says Retake isn't deployed (no Vercel project, no
  `vercel.json`, no deploy workflow) and points to ARCHITECTURE.md's Scope.
- **`docs/CI_CD_SETUP.md`** is GitHub only: its Vercel section (connecting
  the repo, a Vercel environment-variable table, auto-deploy against
  tag-gated) and "Shared database previews" (which named a production
  deployment workflow that #54 removed) give way to a short "Hosting: none".
  AGENTS.md's two lines about them and the `.env.example` header follow.
- **`CRON_SECRET`** removed from `src/lib/env.ts` and `.env.example`: nothing
  reads it (there are no cron routes). `ci.yml` still sets it for the build
  and e2e jobs (lines 69 and 93), left for the owner, since this work
  doesn't touch `.github/`. `Bearer $CRON_SECRET` stays where it's the secret
  scanner's example of a placeholder (`secrets.md`, `check-secrets` and its
  test).
- **ARCHITECTURE.md**'s "Only four things leave it" now says those four are
  what leaves of the video and what's said in it, and that PostHog (typed
  events and page views) and Sentry (error reports) send too once their
  keys are set.
- **Not changed:** the `.env.example` comments with conditional Vercel
  advice, `docs/STANDARDS.md` (the org-wide checklist) and the `.claude/`
  skill texts.

---

## 3zzu. VideoEditor's helpers and two small components in their own files (2026-10-14)

- **PR 6.5:** the file-level constants and helpers above `VideoEditor`
  (`wordByWord`, `LoadedVideo`, `PREVIEW_GRADE`, `NO_LANE`, `NO_SPEECH`,
  `NEW_ITEM_SECONDS`, `NEW_TEXT_RECT`, `NEW_MARK_RECT`,
  `BOUNDARY_NUDGE_SECONDS`, `overlaps`) move to `video-editor-helpers.ts`,
  and the two components after it to `components/preview/video-tool-button.tsx`
  and `components/panels/videos-panel.tsx`. Each line unchanged; `export`
  added so the component can import them. `VideoEditor`'s body is
  byte-identical, so no hook, effect or dependency array moved.
  `video-editor.tsx`: 2,545 to 2,458 lines.
- **Carried over, unchanged:** a doc comment that already stood alone, with
  nothing under it ("An added video's timeline has no cuts, takes, silences,
  fillers or audio flags: the main one's."), moved with the constants.
- **e2e:** no local run: Docker wasn't running (local Supabase down). CI's
  four dev-mode shards (accounts off) are the full-suite result.

---

## 3zzt. VideoEditor's fourth hook: re-recording (2026-10-14)

- **PR 6.4:** re-recording a sentence moves to `audio/use-re-record.ts` in
  two calls, because the edit's `segments` read its state before playback
  exists and its handlers need playback: `useReRecord` (the three
  `useState` calls and `otherReplacements`) is called where that state was,
  and `useReRecordActions` (open, set joins by ear, move a join, preview the
  join or the take, apply, close) where those handlers were. Moved line for
  line; no effect or ref moved. Every hook call is in the same position as
  before, `useState` included (76 calls, the same sequence).
  `video-editor.tsx`: 2,641 to 2,545 lines.
- **e2e:** no local run: Docker wasn't running (local Supabase down). CI's
  four dev-mode shards (accounts off) are the full-suite result;
  `re-record.spec.ts` (5 tests) runs in shard 4. Real sign-in isn't exercised.

---

## 3zzs. VideoEditor's third hook: the project file (2026-10-14)

- **PR 6.3:** `useProjectFile` (`projects/use-project-file.ts`) holds the
  project, its save status, when it was saved and the media to relink, with
  `save`, `openSaved`, `relinkFile`, `removeProject` and autosave (its effect
  event, `projectId` and its effect), moved line for line, with
  `AUTOSAVE_DELAY_MS` and `PROJECTS_KEY` (exported: the projects query uses it).
- **Autosave's effect** is called where it was, and its dependency list is
  the same 17 names in the same order (`projectId` plus 16 of the edit's
  pieces, passed in as themselves and typed `unknown`: only compared, never
  read). `useQueryClient` and `useQuery` stay in the component, so their own
  effects keep their place; only four `useState` calls run later in the hook
  order. `video-editor.tsx`: 2,742 to 2,641 lines.
- **e2e:** no local run: Docker wasn't running (local Supabase down). CI's
  four dev-mode shards (accounts off) are the full-suite result; real
  sign-in isn't exercised.

---

## 3zzr. VideoEditor's second hook: the picked item (2026-10-14)

- **Re-plan (after #56):** measured on the code, a pure-move hook costs back
  the lines of its call (one per name in and out, once Prettier wraps it), so
  all twelve remaining hooks would leave `video-editor.tsx` near 1,600 lines,
  not under 1,500; under 800 needs a different shape (one editor object, or
  the JSX split into components), not pure moves. `applyCommand` and
  `commandContext`, and `useEditDocument` as one hook, are too tangled to
  move as pure moves. Agreed route, one PR each, stopping after each: 6.2
  `usePickedItem`, 6.3 `useProjectFile`, 6.4 `useReRecord`, 6.5 the helper
  components and constants into their own files, 6.6 the `tools` config;
  then the owner decides.
- **PR 6.2:** `usePickedItem` (`components/preview/use-picked-item.ts`) holds
  what's picked on the video (its state, name, timing, retime, delete and
  replace) and the Text lane's items with `selectText`, moved line for line,
  with `KEY_LINE_ID`. No effect or ref; the `picked` state now runs later in
  the hook order (the same order every render). `video-editor.tsx`: 2,866
  to 2,742 lines.
- **e2e:** no local run. Docker wasn't running (local Supabase down, so the
  suite's sign-in step failed and nothing else ran) and memory is low; CI's
  four dev-mode shards (accounts off) are the full-suite result, so real
  sign-in isn't exercised for this PR.

---

## 3zzq. VideoEditor's first hook: keyboard shortcuts (2026-10-14)

- **The plan:** `VideoEditor` (one function, lines 236 to 2807 on main) is
  split into hooks by concern, one per PR, safest first: shortcuts, media
  URLs, edit history, cut editor, re-record, player clock, project file,
  picked item, edited timeline, adding items, the edit document, the
  assistant, then the tools config. Each is a pure move: same effects in
  the same order, same dependency arrays. The owner decides after each PR
  whether to continue.
- **PR 1:** `useEditorShortcuts` (`components/shell/use-editor-shortcuts.ts`)
  holds the Ctrl/⌘+Z handler (a `useEffectEvent`) and its `keydown` effect,
  moved line for line, dependency array `[]`. It's called where the effect
  was; no hook sat between the two, so the hook order is unchanged.
  `video-editor.tsx`: 2,884 to 2,866 lines.
- **e2e:** no local run. Free memory fell to 0.7 GB (of 7.4) even after
  apps were closed, too little for a dev or production server plus
  Chromium; CI's four dev-mode shards (accounts off) are the full-suite
  result, so real sign-in isn't exercised for this PR.

---

## 3zzp. make-plan.ts split by concern (2026-10-13)

- **Six files, moved unchanged** out of `make-plan.ts` (2,058 lines):
  `make-reply` (the contract with Gemini, 325), `make-request` (what the
  request's words ask, 102), `make-context` (the plan's shapes and context,
  340), `make-cut` (what's kept and how long, 499), `make-look` (how it
  looks, 492) and `make-summary` (what the plan says about itself, 268).
  `make-plan.ts` (231) keeps `planMake` and re-exports exactly the 88 names
  it exported before, so no caller changed.
- **Pure move:** every code line of the old file is in the new files once.
  The only differences: `export` on ten names that now cross a file
  (`ASKED_FILL`, `CAPTIONS_REQUEST`, `FIT_REQUEST`, `PROMO_REQUEST`,
  `wordsOf`, `MIN_PIECE_SECONDS`, `clamp`, `overlaps`, `without`,
  `SHAPE_RATIO`), which made Prettier wrap `clamp` onto two lines; a purpose
  comment per file; and the barrel's intro comment.
- **Imports:** `make-questions.ts`, `make-presets.ts` and `music-track.ts`
  import their types from the new files instead of the barrel (one line
  each). No runtime import cycle, as on main; the one type-only cycle
  (`make-reply`, `make-questions`, `make-presets`) is the one `make-plan`
  had before, and is in ARCHITECTURE.md's known limits.
- **Tests:** none changed. 679 unit tests before and after, the six Make it
  files the same (replay 101, steps 17, plan 41, presets 14, questions 17,
  real run 5's 7), each run after every move; the replay fixture is
  byte-identical.

---

## 3zzo. Unused template code removed (2026-10-13)

- **Removed, each shown unused first** (every import, exported name, string
  path, config and doc searched): `src/lib/rbac`, `src/lib/flags`,
  `src/server/actions/feature-flags.ts`, `src/server/api` (the route
  factory and its cron check; there are no API routes), the `/admin` layout
  (it had no page, so `/admin` was already a 404) and `/admin` in
  `SESSION_PAGES`, and `.github/workflows/deploy-migrations.yml` (already
  disabled on GitHub; there is no production database).
- **Trimmed:** `validatedAction` loses its `authorize` option (no action
  passed one); `provisionUser` only upserts the User row (no email domain
  mapped to an admin seat).
- **Schema:** the User model moved from `example.prisma` to `user.prisma`,
  unchanged; comments only elsewhere. No migration, and
  `pnpm prisma:migrate:generate:check` reports no drift. The
  `admin_members`, `feature_flags` and `feature_flag_overrides` tables stay
  until a migration of their own drops them.
- **Docs:** `docs/rules/authorization.md` and `feature-flags.md` deleted with
  their AGENTS.md entries; mentions of the route factory, the workflow and
  the production database reworded.
- **Tests:** the removed modules' 6 test files (43 tests) deleted with them;
  4 files lose their mock of `@/lib/rbac/context` and `proxy.test.mts`
  counts `/admin` as public (approved). 679 unit tests pass.

---

## 3zzn. Docs true of main; the allowance back only when not charged (2026-10-13)

- **The give-back rule** (`src/server/ai/not-charged.ts`, used by
  `validatedAction`): the allowance comes back only for an unset key, or a
  4xx or 5xx reply. A 2xx reply that can't be used, a timeout or any other
  error keeps it used. A timeout was given back before; it now counts,
  because the provider may still have run and charged. `rethrowAiError`
  keeps the provider's error as the `cause` of the AppError it throws, so
  the rule still sees it.
- **An unset key** throws `AiKeyMissingError` (`src/lib/ai-failure.ts`),
  classified as `'key'`: the generic message, the setting named in the log,
  no request sent. It used to be a plain `Error`, reported as a bug.
- **Gemini's `timeoutMs` is required**, as Deepgram's already was.
  `src/server/ai/google.type-test.ts` checks it at type-check time.
- **Tests:** `allowance-give-back.test.mts` (6, one per row of the table, for
  both providers). Two existing tests changed, approved: the timeout row in
  `paid-actions.test.mts` (kept used, so 1 and then 2 where it was 0 and
  1), and the cap test in `google.test.mts` passes a time limit.
- **Docs:** ARCHITECTURE.md gains the rule's table; its line numbers,
  scaffolding size, known limits (the db-tests job) and next steps
  corrected. This file's top box was rewritten as the current state, each
  line checked against the code, with the earlier entries kept below as
  history.

---

## 3zzm. A short README (2026-10-13)

- **Rewritten** to the owner's outline, read in two minutes: what Retake
  is, its three features, how it works (what goes to Deepgram, Gemini and
  OpenRouter; Sentry and PostHog only with their keys), the stack, the real
  folders, running it locally, tests (including `pnpm test:db`), a pointer
  to ARCHITECTURE.md, and the scope, with "Next: music for Make it is
  planned".
- **Dropped:** production settings, contact messages, the CI and scripts
  tables and "working in this repo" (AGENTS.md, ARCHITECTURE.md and
  `package.json` hold them). Nothing linked to those sections.
- **Corrected:** an unset AI key fails as a generic error; "The AI isn't
  available right now" is only for a key the provider refuses. Make it and
  highlights need both keys, since both read the Deepgram transcript.
- **Verified:** every script in `package.json`, every path with
  `git cat-file -e`, and the read-only commands run (`--help`/`--version`,
  `pnpm dlx supabase status`).

---

## 3zzl. Tests that run the real thing: Postgres and the Gemini SDK (2026-10-13)

- **Why:** the allowance's ceiling was only tested against an in-memory
  fake, and no paid action ran through the real Gemini wrapper and SDK.
- **`pnpm test:db`** runs `src/**/*.db-test.mts` (one file at a time)
  against a real Postgres; `pnpm test` doesn't match them and needs no
  database. Locally: `DATABASE_URL=<the local Supabase's> pnpm test:db`.
- **`assertLocalDatabase`** (`src/server/db/local-database.ts`) refuses any
  host but `localhost`, `127.0.0.1` or `[::1]`, and a missing or invalid URL
  fails the run instead of letting it pass unrun.
- **`ai-allowance.db-test.mts` (4):** the ceiling under many requests at
  once, for each kind; only what's left is taken; giving back at once frees
  one each and stops at zero; separate counts per user, kind and UTC day.
- **`paid-action.db-test.mts` (2):** the real `parseEditCommand`, with
  Gemini and OpenRouter faked at `fetch` (any other URL throws): the request
  on the wire (model, key, `maxOutputTokens` 1024), the allowance row, the
  `ai_usage` row priced at 24 micro-USD; a 503 gives the allowance back and
  records the failure.
- **Only their own rows:** fresh random users; `ai_usage` rows found by the
  fake's own request ids, or as the single failed row carrying its 503 (more
  than one and nothing is deleted). A before/after snapshot of the local
  database (counts and an md5 of every row) was identical; only the
  `ai_usage` id sequence moved (487 to 489).
- **CI:** a new `db-tests` job (Postgres 16 service, `contents: read`, no
  secrets): `migrate deploy`, then `pnpm test:db`. Added lines only; the
  six existing jobs are byte-for-byte unchanged.
- **Local e2e:** 140/142 in the full run; the two command tests that failed
  waited on a 3.2 s and a 5.3 s request (see 4c) and passed when rerun. The
  first attempt never got past sign-in: Docker's port forwarding to the
  Supabase gateway (54321) was stuck; `docker restart
supabase_kong_t1-alishbasaboor` fixed it, with no data touched.

---

## 3zzk. The contact form's code removed; the daily limit in the FAQ (2026-10-13)

- **Removed, unused since the Contact page went:** the contact action, its
  per-sender limit and its schema (`src/app/[locale]/(site)/contact/`), and
  their four test files. Nothing else imported them.
- **`CONTACT_IP_SECRET` removed:** from the production boot check, `env.ts`,
  `.env.example`, README and ARCHITECTURE.md. A production server needs only
  the two Supabase settings now.
- **Kept:** the `contact_messages` table (no migration; the schema change is
  comments only, and `pnpm prisma:migrate:generate:check` finds no drift)
  and `pnpm contact:messages`, for the messages already sent.
- **The FAQ** now says the AI has a daily limit for each account ("such as
  60 Make it steps"), resetting at midnight UTC; the number comes from
  `DAILY_AI_LIMITS` through a placeholder, checked by a unit test.
- **Stale comments fixed:** `ai-limits.ts`, `proxy.ts`, and the template's
  example pricing experiment flag.
- **Tests:** the production-settings and env tests no longer expect the
  secret (approved); the 32-character secret test and the four contact
  test files deleted with the code; one new unit test for the FAQ line.

---

## 3zzj. One landing page, and an editor that fits the window (2026-10-13)

- **Pages.** Features, How it works, Pricing and Contact us removed. The
  header's Features, How it works and FAQ scroll to the landing page's own
  sections (`/#features`, the tools; `/#how-it-works`, the five fixes;
  `/#faq`), from any page, smoothly unless reduced motion is asked for. The
  footer has the same three and Privacy. Every old URL redirects (308) to
  its section or the landing page (`next.config.ts`, `MOVED_PAGES`). The
  landing page's FAQ asks all nine questions. The phone menu closes when a
  link in it is followed (an anchor changes no path).
- **Contact.** No page sends messages any more; the server action, its limit
  and its tests stay, and `pnpm contact:messages` still reads what was sent.
  Privacy no longer points to a contact page (the owner's choice): its lines
  about messages are gone, and it says that during the beta questions and
  account deletion aren't handled through the site.
- **The studio's chat.** What Make it applied is now the chat's first
  message, in its scrolling area, not a block above it: a long plan used to
  push the box to type in out of view. The box, the mic and send stay at
  the panel's foot; on a phone the panel is 80% of the screen's height.
- **The full editor fits the window** (from `lg`): the picture takes the
  room the tools, its controls and the timeline leave (a size container, the
  player the largest 16:9 box in it); the timeline is at most 46% of the
  column, its clip tools fixed and its lanes scrolling inside it.
- **Tests:** `e2e/editor-fit.spec.ts` (5): at 1366 × 768 and 1920 × 1080 the
  editor's picture, crop tool, Split, Merge, Duplicate, Delete and lanes are
  in view with no page scroll, and after Make it the chat's box, mic and
  send are; on a phone they're at the chat panel's foot. The site tests
  follow the anchors and the redirects, and check no link 404s.

---

## 3zzi. Redesign to the owner's new design (2026-10-13)

The whole site and app restyled to the owner's design (`design/Retake (1)/`:
`index.html`, `app.html` and `notes.html`; kept out of the repo). Logic,
routes, settings and features unchanged; all text in `messages/en.json`.

- **The system** (DESIGN.md): a violet-black base mirrored in light, one
  violet accent (light violet with dark text on the dark theme), support
  blue, pink only for what gets cut, green for done; no orange or yellow, no
  glows or orbs. Funnel Display / Funnel Sans / JetBrains Mono. No italic or
  highlighted word in a headline (a message's `<em>` reads plain).
- **Landing page** rebuilt as the design's scroll scenes
  (`src/components/site/landing/`): one sentence edited live, the five
  fixes on a pinned stage, Make it step by step, the tools on a sideways
  track, the promises, the first questions, the outlined wordmark, over a
  river of spoken words and a corner timecode. One batched scroll listener;
  reduced motion lays it out plainly. The footage is Retake's own sample
  trip (`public/site/clip`) in the design's duotone; the design's stock
  photos aren't used. New copy in `Site.landingPage`; the old landing's
  messages are left in place, unused.
- **Other public pages** keep their content, in the new type and colours;
  Contact's questions use the landing page's FAQ rows.
- **App**: sign-in as the design's split screen; Home's two ways in (the
  AI one recommended, the manual one a drop row); Make it's four-step
  progress bar and the plan as a written list; the editor's and studio's
  bar, segmented switches and chat in the new style.
- **Copy made true where the design wasn't**: the promise that only the
  audio and the pictures leave the browser (commands and the transcript go
  to Gemini too), the password hint (6 characters, not 8), no strength
  meter; "Apply", the real button, on the landing page's plan.
- **Not matched**: see the PR. Notably Features' and How it works' app
  screenshots are still the old look (regenerating them needs the Pexels
  footage and ffmpeg: `pnpm shots`, CREDITS.md).
- **Tests**: e2e updated only where the UI changed on purpose (the landing
  page test, the sign-up heading, the light theme's background colour).

---

## 3zzh. Hardening: caps, analytics, contact, proxy, lint (2026-10-13)

The review's second set, each finding checked against the code first (all
true; "no way to read contact messages" was partly wrong: Prisma Studio
worked, there just wasn't a purpose-built way).

- **No admin seat from an email domain.** `STAFF_DOMAIN_ROLE` gave any
  `@8x.social` sign-up the lowest admin seat, and sign-up doesn't confirm
  the address. Now empty: seats are granted by hand.
- **An output cap per Gemini feature** (`GEMINI_MAX_OUTPUT_TOKENS` in
  `src/server/ai/google.ts`): 1,024 for a typed command, highlights and the
  check; 8,192 for a plan and a follow-up, from the real replies in
  `ai_usage` (largest 161, 169, 211 and 5,483). The output count includes
  the model's thinking (real run 5: a 1,780-character reply billed 4,260),
  so 8,192 is measured headroom (1.5 times the largest plan), not a proven
  bound: the 5-minute cap limits the input, not the reply's lists or the
  thinking. A call for a feature without a cap doesn't compile, the
  feature's cap overrides a caller's, and a reply cut off by it is logged
  as `AI reply cut off by its output cap` with the feature; the plan then
  reads as no plan ("Retake couldn't make a plan from that…"). Next step:
  bound the reply's schema and set a thinking budget.
- **PostHog:** autocapture and session recording off in code
  (`src/lib/posthog/init-options.ts`); page views still by hand.
- **Contact limit atomic:** count and insert in one Serializable
  transaction, retried up to three times when Postgres aborts an overlapping
  send (P2034); still overlapping after three, the send is refused with the
  usual message (429), not a server error. Tested with a fake database that
  behaves like Postgres for this pattern; not yet against real Postgres.
- **`pnpm contact:messages`:** the latest 20 (`--limit`, at most 200), one
  read-only select, never the hashed IP, refuses any database not on this
  machine. Messages are personal data and stay in the local database.
- **The proxy** calls Supabase only on the pages that read the session
  (`/home`, `/make`, `/projects`, `/editor`, `/login`, `/admin`).
- **Deepgram lint rule:** a mention of `deepgram.com` outside
  `src/server/ai/` fails lint (Deepgram is a `fetch`, so the SDK import ban
  couldn't see it).
- **Tests:** 22 new (unit 708 to 730) and one new e2e (a cut-off plan's
  message). Two existing tests changed with the owner's approval (the
  `8x.social` seat tests now assert no seat) and one existing fake gained
  `$transaction` (no assertion changed). Each of 17 fixes undone on purpose
  made a named test fail.

---

## 3zzg. Copy and docs that say what's true (2026-10-13)

The first of the review's fixes: nothing here changes what the product
does, except what an AI failure shows a person.

- **No music from Make it.** `public/music` holds no track, so Make it
  never lays music, but the landing page's demo (a "Soft music underneath"
  plan line and a Music lane), Features, How it works and the editor's
  "Add calm music" follow-up chip all said it did. All gone; How it works'
  last step now says music of your own goes on the Audio lane. The hero's
  undo chip moved down so it no longer covers the Captions label.
- **Make it steps.** Pricing said "Make it requests", but a plan and its
  automatic check count two. Pricing and the limit-reached message now
  both say "Make it steps" (`DAILY_AI_LIMITS.make_it.what`), and Pricing
  says a plan uses two.
- **No setup detail for a person.** A refused key or a provider's usage
  limit showed "Check GEMINI_API_KEY in .env.local" to whoever used the
  app. Both now show "The AI isn't available right now. Try again later.";
  the log gets the provider, the failure and the setting to check, never a
  key's value. Timeout and busy messages are unchanged. One e2e test's
  injected text changed to match (approved).
- **Docs.** ARCHITECTURE.md: the line counts (VideoEditor 2,558,
  `make-plan.ts` 2,058, `planMake` 82, scaffolding 1,560 plus the 71-line
  route factory), four things leave the browser (a spoken command's
  recording too), the $4.58 figure's source, Deepgram outside the lint
  rule, and a new "Scope: local-first, not deployed" section listing what
  a hosted launch would need and why each is out of scope (`ai_usage` keeps
  no user id on purpose: it's MOAD's contract). DESIGN.md rewritten from
  the template's starter text to the real tokens, radii, type and
  components, with "tokens, not literal values" stated as an aim the code
  doesn't meet yet (395 arbitrary values in `.tsx`). README's AI-key line
  and its link to the old Deployment notes fixed.
- **Tests:** `ai-busy.test.mts` (4) and `copy-claims.test.mts` (2). Each of
  12 fixes undone on purpose made a named test fail. Unit 702 to 708.
  Not tested: the hero's markup (the Music lane's JSX could come back
  without its message and only show a missing-message key).
- **Main was red** from a one-line format failure in the review workflow;
  fixed separately first (PR #45).

---

## 2. What's built, tested and committed

Commits are in order, oldest first. Each feature commit is followed by a
separate `chore(logs)` commit.

| Feature                                                                                                                                                                                                                  | Commit                                                                   | How it was verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Template setup, local editor page (upload a video, see it with a timeline area)                                                                                                                                          | `ec9d09f`                                                                | e2e: home links to the editor; a picked video plays and can be scrubbed. MediaRecorder WebM with `Infinity` duration is handled by a forced duration probe. Non-videos are rejected with a toast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Local Supabase CLI dev setup                                                                                                                                                                                             | `65fd6ef`                                                                | `supabase start` in Docker, Prisma migrated, app boots. Only the services we use are enabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Manual trim handles                                                                                                                                                                                                      | `da35eb7`                                                                | Unit tests for `moveTrimEdge` (clamped, never crossing, reversible). e2e drags a handle, previews the trimmed playback, and undoes it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| AI edit commands (Gemini) and the dark visual design                                                                                                                                                                     | `96bdaa4`                                                                | Unit tests for the command schema and range validation (`edit-command.test.mts`). e2e with mocked server actions. Each real call was checked to land a costed row in `ai_usage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Transcript plus long-silence flags                                                                                                                                                                                       | `8da9af7`                                                                | Tested with real speech. Silences come from measured loudness (50 ms windows, under -40 dBFS), not transcript timestamps. Threshold set to **7 s** (`MIN_SILENCE_SECONDS`), with unit tests showing pauses under 7 s aren't flagged. e2e uses a tone video with silences at known times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Filler-word flags; fix for long takes failing to transcribe                                                                                                                                                              | `a9fb9ba`                                                                | Unit tests for filler detection. Root cause of the long-take failure: a 10 MB proxy body limit truncated uploads. `bodySizeLimit` and `proxyClientMaxBodySize` are now set from one constant in `next.config.ts` (`TRANSCRIBE_REQUEST_LIMIT_BYTES` in `take-audio.ts`). Verified with the user's real ~1–2 minute recording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| One-click clean-up of silences, undoable                                                                                                                                                                                 | `ba1fe03`                                                                | Unit tests for `planCleanup`, `keptSeconds` and `mergeCuts`. e2e: clean-up removes flagged silences after showing an estimate, and Undo restores them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Precise filler removal (Deepgram timing plus gap snapping)                                                                                                                                                               | `8a92dea`                                                                | Measured on the user's real recording (`Cap.mp4`) by exporting before/after WAVs around a filler at about 0:33.5. The user listened and confirmed the cut is real and clean. Unit tests in `filler-cuts.test.mts`. e2e: a filler with clear gaps is cut, one without gaps is left for review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Filler cut editor (set a cut by ear with draggable edges, preview, Undo)                                                                                                                                                 | `5d203ad`                                                                | e2e: cut a filler by hand, preview with and without the cut, and check that Undo or Cancel leave the take intact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Confirm an AI command's plan before it runs                                                                                                                                                                              | `72c8d35`                                                                | e2e: the command shows what it understood, Cancel changes nothing, Apply applies exactly what was shown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Honest "I can't do that yet" replies for unsupported commands                                                                                                                                                            | `a0d6159`                                                                | e2e: a reply lists what is possible and Apply never appears. An out-of-range trim is explained ("That range isn't in this clip.").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Split a clip at the playhead                                                                                                                                                                                             | `6eb5bb3`                                                                | Unit tests: a split leaves what plays unchanged, refuses slivers (`MIN_CLIP_SECONDS` = 0.1), and `clipIndexAt` assigns the very end to the last clip. e2e: split at 1.5 s, the playhead doesn't move, and the highlight follows playback across the split.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Reorder clips by dragging, or Alt+←/→                                                                                                                                                                                    | `ae17d92`                                                                | Unit tests for `moveClip`, including off-end moves doing nothing. e2e drags and uses keys, then plays and checks that video time jumps from the later part back to the source start and stops where the moved clip ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Merge a selected run of adjacent clips                                                                                                                                                                                   | `9404c4e`                                                                | Unit tests: merging a split restores the original single range exactly, and merging reordered clips keeps playback order with identical `playableSegments`. e2e: click, Shift+click, and Space/Shift+Space selection, with a merge before and after a reorder. Passed 12/12 on repeat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Before/after comparison (Edited / Original), playhead preserved                                                                                                                                                          | `0b4b485`                                                                | e2e (8/8 on repeat): with a 1–2 s trim, the edit stops at about 2 s. Switching to Original leaves `currentTime` exactly unchanged and plays past 2.4 s. Switching back to Edited also leaves it unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Export the edit as a playable video (real-time, in the browser)                                                                                                                                                          | `2c2f0a5`                                                                | Unit tests for the format pick, filename and total length. The e2e checks the exported file's length (±0.25 s), tone and silence at mapped probe times, and the square's pixel position in frames. Measured: 2.95 s vs 2.96 s expected; tone RMS 0.35, silence about 0; square at exactly 160 and 60 px as predicted. A real-footage export of `Cap.mp4` (split in three and reordered) came out at the right length, with each segment's audio at its edited position (correlation 0.81–0.96 vs 0.016 for the original order).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Re-record and splice, slice 1: where a replacement sentence is spliced in (logic only, no UI yet)                                                                                                                        | `3df2f89`                                                                | 5 unit tests (`sentence-splice.test.mts`): joins land inside the real pauses even with the transcriber ~100 ms off, a long pause is only nibbled, no pause means review; a mutation to raw timestamps fails 2 of them. The gap search moved to `audio-gaps.ts`; `planFillerCut` output checked identical on 36,910 spans over four real recordings. Full e2e 17/17 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Splice in a pause that contains the transcriber's sentence edge                                                                                                                                                          | `15cd03e`                                                                | 2 more unit tests: a stretched edge splices at the real speech; a pause merely near the edge is still not used (a mutation removing the rule fails the first). On real `Cap.mp4`: 11 of 30 sentences spliceable, was 6. Full e2e 17/17 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Re-record a sentence and splice the take in (audio-only v1)                                                                                                                                                              | `e42ad94`                                                                | Unit tests for the take model (shorter take cuts the picture, longer holds it, reorder, cut inside a span, span not kept, split refused) and take prep (trim, Stop click, no speech, gain cap, blockers). e2e with a fake mic (`e2e/re-record.spec.ts`): blocked sentence shows its reason; Cancel and Undo restore; in the editor the video is silent under the take and holds its frame; the export has 880 Hz only where the takes are and 440 Hz elsewhere, length within 0.25 s (a mutation leaving the original sound on fails it). Real seams on `Cap.mp4`: section 3b. Full e2e 18/18 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Live mic meter while re-recording; refuse a take cut off mid-speech                                                                                                                                                      | `4574ee4`                                                                | Unit tests for the meter's dB scale and for `stoppedMidSpeech` (speech into the Stop guard caught; a pause, even with the Stop click in it, not). e2e: the meter rises from silence for the fake mic's tone (removing the meter fails it). Fake mic of continuous real speech: the panel refuses the take with the "still speaking" message and offers no Use new take. Full e2e 18/18 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Full undo/redo: a 50-step history of every edit, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y                                                                                                                                          | `f3c0de5`                                                                | 5 unit tests (`history.test.mts`): undo then redo walks every step; a new edit after an undo clears the redo branch; the cap keeps the last 50 and drops the oldest; an undone take is redone as the same object, audio and all. e2e (`e2e/re-record.spec.ts`): re-record, trim, split, reorder, then undo all four and redo all four (button, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y), checking the exact timeline and the exported length at every step; Ctrl+Z in the command bar doesn't touch the edit; a new edit ends the redo branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Reset to original (one undoable step) and preview speed 0.5×/1×/1.5×/2×                                                                                                                                                  | `471fd28`                                                                | Unit tests: reset is one step (one Undo restores every edit, Redo resets again), a reset after an undo ends the redo branch, takes removed by a reset come back as the same objects (`history.test.mts`); `isOriginalEdit` counts a trim dragged back or a split merged again as original (`edit-snapshot.test.mts`). e2e: reset after a re-record, trim and split asks first, Cancel changes nothing, then Undo/Redo/Undo; at 2× the timeline and redo branch are untouched and the export is the edit's length, not half. At 2×: the video's rate is 2 in every playing sample, D plays at ~2× real time, the jump back to a moved clip happens, the take starts at B's span at rate 2 and stays at 2 for its whole length, and the Original view plays at 2×.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Motion graphics v1: title card and PNG watermark, by hand or typed command                                                                                                                                               | `49b9c51`                                                                | Unit tests: title timing, watermark corners, edited time in play order (reorder, held frame, a time shared by two segments, cut-away), letterbox fit (`overlays.test.mts`); title and watermark command plans (`edit-command.test.mts`); graphics count as edits for reset (`edit-snapshot.test.mts`). e2e (`graphics.spec.ts`) on real exports: with the first second trimmed, a 1 s title shows only in the export's first second (white text pixels in the band at 0.5 s, none at 1.5 s) and the logo is green in its corner in every frame and absent from the other; after moving it top-left and removing the title, a second export shows exactly that. Preview: title only in its edited window, nothing in the Original view; undo/redo step through the corner and title changes; reset removes both, Undo restores; a non-PNG is refused. Commands: title plan, Cancel, Apply; watermark plan opens the picker, a second one moves the logo, undoable; export checked. Mutations: no overlay drawing in export fails both tests; source time instead of edited time fails the trimmed title check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Automatic captions from the transcript, on/off as an edit, by toggle or typed command                                                                                                                                    | `3b697e7`                                                                | Unit tests (`captions.test.mts`): a caption ends at a sentence, a pause over 0.7 s or two 24-character lines; cut words never show and later ones move up; reordered clips carry their words; a re-recorded sentence's words are spread over the take; `captionAt`. Captions count for reset; `captions_on`/`captions_off` plans. e2e on real exports (`graphics.spec.ts`): off by default; on, caption text in the bottom rows while each sentence is spoken (0.7 s, 2.7 s) and none in the pause (1.7 s); with the first second trimmed, the first sentence is gone and the second moved up; toggled off, none at all. Preview: same, nothing in the Original view; undo/redo of the toggle; reset turns them off; the typed command. Mutations: no caption drawing in export, and captions in source time, each fail it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Every editor action as a typed command (split, merge, move, clean-up, undo/redo/reset, speed, re-record, export)                                                                                                         | `feat(editor): run every editor action as a typed command`               | Unit tests (`edit-command.test.mts`): each command plans or refuses against the editor's state (split allowed, clip numbers from 1, merge needs a later clip, "already there", clean-up needs something to remove, undo/redo/reset need something to do, only the preview speeds, the sentence at a time and its re-record blocker, nothing to export). e2e (`commands.spec.ts`): clean-up confirmed (Cancel leaves it), then undo, redo, reset and undoing the reset, each by command; refusals for nothing to undo/redo/clean/reset, a 3× speed, a sentence with no pause before it, a time with no sentence; 2× sets the preview speed; export downloads the edit at its length (the take less the cut filler); the honest reply lists the new commands. Split ×2, move, merge by command, each exactly one undo step (four Undos back to one clip); refusals for a split at a clip edge, a clip already in place, clip 5 of 3; re-record opens the panel for that sentence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Warn when an export comes out the wrong length (more than 0.25 s off the edit)                                                                                                                                           | `feat(editor): warn when an export comes out the wrong length`           | Unit test for `lengthMismatch` (within 0.25 s either way passes; 0.26 s over or under is flagged with its sign; the measured −0.52 and +0.39 s misses). e2e (`editor.spec.ts`) forces each real cause in the page: `MediaRecorder.pause` stalls the main thread 600 ms (file 0.6 s too long), `resume` lands 600 ms late (0.6 s too short); each still downloads and shows the warning with its direction and an amount over 0.25 s, never "Export finished". 3× each: 6/6. Mutation (`lengthMismatch` always null) fails both. The existing export test still shows "Export finished". Full e2e 28/28 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Annotation layer: box, blur and text drawn on the preview, moved, resized and retimed in a lane, erased; box/blur commands                                                                                               | `feat(editor): annotation layer of boxes, blurs and text`                | Unit tests (`annotations.test.mts`): shown from start up to end, oldest first; a drag either way round, clamped, a click isn't a box; move stops at the edges, resize keeps a minimum; a new item is 3 s from the playhead, cut by the end; lane slide and edges never cross; regions; blur grid is 1/40 of the width at any size. Box/blur command plans (`edit-command.test.mts`); an unknown region fails the schema; annotations count for reset. e2e (`annotations.spec.ts`), real exports read at the box's centre and along a row through the moving square: the box is red (254, 1, 1) only in its time and background before and after; the square's sharpest edge steps 63–91 outside the blur and 10.7 under it, with contrast ~100 left (it blurs, it doesn't paint over). The preview measured the same way: 56 sharp, 10 blurred. Draw, lane end-drag, move, resize and draw again are one undo step each (5 Undos to nothing, 5 Redos back exactly); reset clears, Undo restores; the Original view shows none. Command: Cancel adds nothing, Apply adds the top-right third for 1–2 s; text needs words; eraser on the picture and on a lane bar, ArrowRight and Delete on a bar, each one undo step. Mutations, each failing it: no export blur, no preview blur, timing ignored. Full e2e 30/30 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Audio problem flags on the timeline: clipping, quiet speech, loud background (informational, no API call)                                                                                                                | `feat(editor): flag clipping, quiet speech and loud background`          | Unit tests (`audio-quality.test.mts`, synthetic tone bursts): clean audio raises nothing; clipping found only in its section, in either stereo channel; a full-scale peak every 10 ms is not clipping; 20 dB quiet for 6 s found only there; a 10 dB dip, a 1.5 s quiet moment, or too little speech is not; noise 10 dB under for 14 s found at exactly 13–27 s, at −30 dB not; all three tagged in order. e2e (`audio-quality.spec.ts`): a 36 s take recorded through Opus with clipping at 6–9 s, 20 dB quiet at 12–18 s and noise at 21–33 s: exactly one flag of each, labelled 0:06–0:09, 0:12–0:18, 0:22–0:33; counts and plain meanings shown; a flag jumps the playhead to its start; nothing to undo. Real audio: section 3i. Mutations: all detection off fails the e2e and a unit test; each detector off alone fails 2–3 unit tests. Full e2e 31/31 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Set a re-recorded sentence's joins by ear when it has no clean pause                                                                                                                                                     | `feat(editor): set a sentence's joins by ear when it has no clean pause` | Unit tests (`sentence-splice.test.mts`): a run-on sentence is refused and its joins start at the nearest dips; a side with a pause starts in it as an automatic splice would; bounds (a second either side, inside what plays, fenced by cuts and spans beside it, not by a cut inside); moving a join clamps to bounds and a 0.2 s minimum; a by-ear splice replaces exactly the joins and its take is its own speech; the views. Command: a no-pause sentence now opens the panel, a split one is still refused. e2e (`re-record-by-ear.spec.ts`, fake mic): refused, Set the join by ear, the warning line, Record enabled; the start join on a 20 ms dip; 10 ms arrow steps; the end join stops at 4.0 s and at its view's start; Play around the start plays that view and stops; record (0.8 s), apply; the export has 880 Hz only between the joins, 440 Hz either side, length within 0.25 s; Undo/Redo; reopening restores the joins. Real seam on `Cap.mp4`: section 3j. Full e2e 32/32 three times (with logging) and twice clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Picture transforms (crop, rotate, flip) and pixelate, by hand or typed command                                                                                                                                           | `feat(editor): crop, rotate and flip the picture, and pixelate`          | Unit tests (`transform.test.mts`): identity; angles fold into (-180, 180]; a quarter turn swaps the frame and maps corners exactly, 15° frames the whole picture; flips, then flip-and-turn; crop size, shift and inverse; presets centred and refitted after a turn; resize keeps a preset shape; even canvas sizes. Commands (`edit-command.test.mts`): rotate is relative and folds, flip toggles (horizontal by default), crop presets and none, pixelate. A transform counts for reset. e2e (`transform.spec.ts`, real exports, one test at a time): rotate right 90° exports 180×320 with the square where a quarter turn puts it; flipped, it moves to its mirror place and the pinned red box turns with the picture; 1:1 crop exports 180×180; the preview's square is within 0.04 of the export's in each; the title's text runs across the middle of the cropped frame; one undo step each, reset clears. 15° exports 356×256 with black corners; the handle dragged a quarter round commits ~90° (undoable), arrow keys 1°. Pixelate leaves block-wide blended runs at the square's edges only in its time. Commands rotate, flip, crop, pixelate, one undo step each. Mutations: the export ignoring the turn and flip fails it; the preview turning the wrong way fails it. Real footage: `Cap.mp4` turned 90° and cropped 9:16 exports 1080×1920, 108.84 s, its frame correlating 0.98 with the preview's (upside down: -0.02). Full e2e 36/36 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Clip volume (0–200%), mute, and fade in and out, by hand or typed command                                                                                                                                                | `feat(editor): clip volume, mute and fades`                              | Unit tests (`clip-audio.test.mts`): gain is the volume, 0 muted; fades are straight lines from and to silence, overlapping ones meet where they cross; a segment schedules its part of the envelope on the audio clock (whole clip, a later segment, overlapping fades); segments carry their clip's sound and offset, cuts skipped; a split shares it (fades stay at the ends) and merging back restores it; clip sound counts for reset. Commands (`edit-command.test.mts`): volume on a clip or all, capped at 200%; louder ×1.5; mute one clip; no such clip; fade out on the last clip and fade in on the first by default, 1 s unless timed. e2e (`audio.spec.ts`, real exports): clip at 50% measured 0.49–0.50 of the tone, muted under 0.02, 200% ~2.0; undo, redo, reset. Fades: levels 0.244/0.492/0.748/0.996 up and 0.771/0.512/0.265 down against 0.25/0.5/0.75/1 (fade out ~20 ms late); the preview's level rises from near 0 through ½ to 1. A take (`re-record.spec.ts`): at 50% both the original's 440 Hz and the take's 880 Hz halve and their ratio holds. Commands mute, fade out, louder, one undo step each. Mutations: no envelope in the export fails the level test; a take bypassing the clip level fails the take test. Full e2e 40/40 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Clip speed, 0.25× to 4×, pitch kept, by hand or typed command                                                                                                                                                            | `feat(editor): clip speed`                                               | Unit tests (`clip-speed.test.mts`): a sped clip plays length / speed, the others unchanged, 1× carries nothing; edited time at a source time divides by the speed; captions in a 2× clip run at 2×; a take in a sped clip still plays at 1×; fades use played time; split keeps the speed, merge takes the first clip's; clamp 0.25–4 and 1× leaves no trace (and resetting sound keeps speed); a clip with a take is detected and a sentence in a sped clip is blocked from re-recording (`sped`); speed counts for reset. Commands: one clip or every clip; 8× and 0.1× refused, not clamped; no such clip; a clip with a take refuses, every clip skips it (or refuses if all have one); the preview `speed` command unchanged. e2e (`clip-speed.spec.ts`, real exports): clip 2 at 2× exports 2.966–2.999 s for 3 s; clip 1 at ½× too, 5.029–5.131 s for 5 s; pitch 440 Hz at every probe; undo, redo, reset. Preview: `playbackRate` 0.5 in the ½× clip and 2 in the 2× one, `preservesPitch` on; the Original view plays at 1. Captions: "Second line." (2.3–3.1 s of source) in a 2× clip from 2 s shows at 2.35 s and is gone by 2.8 s of the 3 s export. Commands (mocked): "make clip 2 play at 2x", "slow the last clip to half speed", 8× refused, one undo step each. Mutation: the export without `preservesPitch` reads 880 Hz at 2× and fails. Full e2e 44/44 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Transitions (fade through black, dissolve) between adjacent clips; delete and duplicate clips; by hand or typed command                                                                                                  | `feat(editor): transitions between clips, delete and duplicate`          | Unit tests (`transitions.test.mts`): a fade keeps the length and dips to 0 at the join, ½ a quarter of its length either side; a dissolve shortens by its length, moves later segments' starts, edited times and captions up by it; a transition is at most half the picture either side (a nearby cut shortens it), none against a take; moving or deleting a clip drops the transitions at its joins (moving back restores them), split and merge keep them; delete never removes every clip, a deleted clip's sentence says so (`deleted`); a duplicate plays after the original with its sound and speed, starts with a cut, the next clip's transition follows it, its words caption twice, and a split divides the clip playing; equal-power crossfade; the transition gain scheduled on the audio clock (fade ramps, a dissolve's curve rising monotonically through √½). Commands: a pair side by side, every pair (a short join shortened), not adjacent, no such clip, blocked, one clip only, remove; delete and duplicate, the only clip kept. e2e (`transitions.spec.ts`, real exports of a red/440 Hz then blue/880 Hz video split in two): fade 1 s: 3.943–3.958 s for 4 s, red 252 → 133 → 14 (black) → blue 109–116 → 247, 440 Hz 1.0 → 0.52–0.57 → ~0.02–0.05 → 880 Hz 0.48–0.50 → 1.0; dissolve 1 s: 2.980–2.982 s for 3 s, half way red 132–133 / blue 116–118 and 440 Hz 0.73–0.74 / 880 Hz 0.65–0.67 (√½ = 0.71); the preview's second player plays and fades in through the overlap, hidden and stopped after the join. Duplicate of a 2× red clip: 3.975–3.999 s for 4 s, red, red (440 Hz, pitch kept), blue; delete the blue: 2.006 s, red only; undo each, reset. Commands (mocked) with confirm and undo. Mutation: the export without the transition mix fails both the fade and dissolve tests (red 252 where 128 is due). Full e2e: 47/48 (the by-ear take's recording step, section 4c), then 48/48 twice. |
| Color adjustments (brightness, contrast, saturation, black and white, warm, cool) for the whole video or a clip; text styling (font, size, color, background) for the title, captions and on-video text; freehand pencil | `feat(editor): color adjustments, text styling and a pencil`             | Unit tests (`color-grade.test.mts`): brightness scales, contrast pivots on mid-grey, saturation leaves grey grey and at 0 gives luma; black and white is grey, warm/cool shift grey red/blue; a clip's grade on top of the video's, none set is no filter; filter ids stable by numbers; a clip's colors through split and merge, onto its segments, and counted for reset (as are the video's colors and the caption style); the default band is the old one; a pencil stroke's points kept inside its rect, a dot not a stroke; color commands (a level ±20 unless told, capped; a look; back to normal or already normal; no such clip); text style commands (only what's named; a color name or #rrggbb; no title / no text); a command with fields left out parses with them null. e2e (`color-and-text.spec.ts`, real exports of a grey/blue video split in two): whole video black and white, clip 2 also 150%: export 128/95 and 192/143 exactly as calculated, and the preview's screenshots the same (128/95, 192/143); the Original view ungraded; undo, redo, Reset colors, reset. Warm grey (147,131,103), then cool on top (126,134,124). Title red, serif, no band: 228 red pixels, the band row the video's grey; captions yellow at 150%: 385 pixels against 125 at 100%; on-video text cyan: 260 pixels. Pencil: export stroke centred at x 79 of 320 (drawn 32–128), preview 79, flipped 239 (pinned to the picture); eraser and undo. Commands (mocked) with confirm and undo. Mutation: the export without the grade fails (blue stays (49,97,221) for grey 95). Full e2e 53/53 twice.                                                                                                                                                                                                                                                                                                                                |
| Separate audio: an Audio lane of added files and extracted clip sounds, moved, trimmed, at their own volume                                                                                                              | `feat(editor): separate audio clips in an Audio lane`                    | Unit tests (`audio-lane.test.mts`): an item plays its sound from where it starts, only in the asked stretch; moving keeps what plays, trimming the start skips more of the sound, the end plays less, neither past the source; volume capped at 200%; an extracted clip keeps its kept pieces (cuts skipped) where the clip starts, and moved plays the same sound earlier; a clip in the lane is silent itself, blocks re-recording (`in_lane`) and counts for reset; only a clip at 1×, without a take, not already out can be extracted; a stretch runs through dissolves to the next seek; commands (add at a time or the playhead, past the end refused; extract, sped refused, no such clip; delete the last or a named one, none / no such). e2e (`audio-lane.spec.ts`, real exports of a red/440 Hz, blue/880 Hz video split in two, and a 1.5 s 660 Hz WAV): the file at 1 s: 660 Hz 0 at 0.5 s, 1.003 at 1.75 s with the video's 440 Hz still 1.0, 0 at 2.9 s; at 50% 0.498; muted 0; undo, reset. Clip 2's sound taken out: 880 Hz 0.999 in place; moved to 0 s: 880 Hz 1.003 over clip 1's 440 Hz 1.004, and 0 at 3 s where clip 2's picture still plays; a sped clip can't be extracted; undo puts the sound back. Preview: one lane start per stretch, from the file's start or 0.6 s in when played from 1.6 s; none in the Original view. Commands (mocked): add opens the picker, extract, delete, already-out refused, undo each. Mutation: the export without the lane fails (no 660 Hz). Full e2e locally: 56/57 (the new preview test played 0.4 s from 1.6 s, across the clips' join at 2 s, where the lane rightly starts again: now played from 1.3 s), 56/57 (`re-record-by-ear.spec.ts:26`, watched) and 56/57 (`annotations.spec.ts:156`, watched); the lane spec 4/4 alone and in the full runs after the fix.                                                                                                 |
| Several videos in one project: add another, after the clips; the clip tools work on its clips                                                                                                                            | `feat(editor): combine several videos into one project`                  | Unit tests (`sources.test.mts`): an added video's clip plays its own video with its own trim and none of the main one's cuts; a time is looked for in one video (seek, clip under it, edited time); a split divides the playing clip in its own video, a merge needs one video, settings keep the source; captions, takes and re-recording are the main video's own; fitting another shape centred; an added video counts for reset. e2e (`multi-video.spec.ts`, real exports of a red 320×180 / 440 Hz main video and a green 240×240 / 660 Hz added one): 6.88–6.91 s for 7 s, red with 440 Hz then green with 660 Hz, the green letterboxed (the left edge black); the preview plays on into the added player (shown, playing, the main one paused, away), the editor's Pause stops it, and the timeline names the green video. The green clip first and at 2×: 5.41–5.44 s for 5.5 s, 660 Hz kept; black and white on it: grey 182; a dissolve into the red (0.75 s, half the 1.5 s clip): 4.67 s, half way red over grey with both tones. The green video's own trim, a second off its end from its timeline, and a split inside it: 5.88 s. The command (mocked) opens the picker; merging clips of two videos refused; undo, redo, reset. Full e2e 61/61 twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Save and reopen projects: Save with a name, autosave, My projects (open, delete), typed save/open                                                                                                                        | `feat(editor): save and reopen projects in the browser`                  | Unit tests (`projects.test.mts`): a typed name finds its project (the same name, else the latest containing it, none, empty); media kept once per file, a picked file stands in only if it's the same one; save and open as commands (a name or the current one, unsaved changes warned, unknown refused, none saved). e2e (`projects.spec.ts`): a project with split, 2× speed, black and white on a clip, a red title, captions on, a box, an audio file at 0.5 s and an added video: exported (4.43–4.45 s: grey 55 with 440 + 660 Hz, blue at 2× with 880 Hz, green with 330 Hz, 136 red title pixels, the black box), saved, the page reloaded, reopened from My projects: the same clips, lane, title, speed and captions; no transcription request; no undo history; a second export the same (4.43 s; every colour within 0, title 134 for 136, every tone within 0.01). Autosave: a change after saving, a reload, the change there. A lost video (the browser's media cleared): reopening asks for the file, refuses another one, opens with the same one; delete asks first, then the project is gone, after a reload too. Commands (mocked): save as Demo; open Demo over an unsaved edit warns; an unknown project refused. Full e2e 65/65, then 64/65 (`transform.spec.ts:160`, watched).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Motion graphics: title/text entrances and exits (fade, slide, pop), a lower third, an animated zoom                                                                                                                      | `feat(editor): animated text, a lower third and zoom`                    | Unit tests for the easing, the half-time cap, the zoom matrix and the commands. e2e measures real exports: the zoom (square width, centred, with a crop and a sped clip), the title sliding and fading, the lower third at the lower left sliding in and gone outside its time, a text pop; typed commands, save/reopen, undo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The logo by hand: drag anywhere, resize by its corner, keys, a size field; PNG or JPG                                                                                                                                    | `feat(editor): place and resize the logo by hand, PNG or JPG`            | Unit tests for placing, moving, resizing and clamping. e2e drags and resizes a JPG logo, checks the export puts it at the same place and size, the keys, the size field, undo per step, corners and the default-corner command.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Current totals** (2026-10-07, Make it designed verticals): 383 unit tests
(`src/**/*.test.mts`) and 104 e2e tests (plus the sign-in setup).
Everything passes locally. On the meter commit the full e2e suite passed
18/18 in each of two runs.

`pnpm test` also runs the repo's `scripts/*.test.mjs`. **Fixed 2026-10-05
(`fix/check-standards-windows`):** on Windows, 41 of them (all in
`check-standards.test.mjs`) failed, and `pnpm check:standards` reported
17/24, since the template's first commit (`a3d5205`, 2026-09-29); CI runs
on Linux, so it never showed. Three Windows-only causes, none about the
app:

- `check-standards.mjs` ran `node_modules/.bin/eslint` and `tsc` directly;
  on Windows those shims are `.cmd` scripts (ENOENT). Now run through the
  shell as one command line on Windows.
- It required the hooks to be executable on disk; Windows has no execute
  bit and git there ignores it (`core.filemode=false`). Skipped on Windows;
  the index check (`100755`, what a clone gets) still runs everywhere.
- The test fixtures symlink `node_modules`, which on Windows needs admin
  or Developer Mode (EPERM): directories are now junctions (no rights
  needed), the odd file copied; a fresh fixture's `git add` records the
  hooks 100644 there, so they're marked +x in its index as in the repo's.

Now 413 pass, 1 skipped on Windows (the on-disk execute-bit test: nothing
to take away there), and all 24 standards are met.

**How to run the checks:**

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts.mjs --test "src/**/*.test.mts"
pnpm exec playwright test        # 4 workers; starts `pnpm dev` itself if nothing is on :3000
pnpm lint; pnpm typecheck; pnpm exec prettier --check .; pnpm build
```

---

## 3. Key architecture decisions and why

**Gemini (Google)** was picked at template setup as the AI provider,
because it handles audio and video natively (transcription and analysis
from the media itself). It is wrapped in `src/server/ai/google.ts`, the
only place the SDK may be imported. ESLint enforces that.

**`gemini-3.5-flash-lite` for command parsing.** Parsing "cut from 2 to 5
seconds" into `{ action, startSeconds, endSeconds }` is a small
structured-output task: the cheapest, fastest model is enough, and the
reply needs to feel instant. The editor validates the parsed result
(`edit-command.ts`) and the user confirms the plan before anything
changes, so a model mistake can't silently damage the edit. The call is
in `actions.ts` with `feature: 'parse_edit_command'`.

**Deepgram (`nova-3`, `filler_words=true`) was added for one job: precise,
word-level timing of the transcript, especially filler words ("um", "uh").**

- Gemini's timestamps drifted too much to cut by. An early comparison
  against synthesized speech was invalid and its Gemini numbers were
  retracted, so don't cite them.
- Deepgram reports fillers as words with timings. Even so, on an
  exact-timing benchmark it was 25–105 ms off, against fillers lasting
  170–315 ms.
- It is wrapped in `src/server/ai/deepgram.ts` with `feature:
'transcribe_take'`, and costed per audio minute (`AUDIO_MINUTE_RATES_USD`,
  nova-3 at $0.0043/min, from the audio's duration).
- Silences don't use any model: they come from measured loudness.

**Gap-detection for filler cuts (`filler-cuts.ts`).**

- Deepgram's word timing alone is close but not precise enough to cut by,
  so the cut is placed by the audio itself.
- A filler is only removed when a measurable quiet gap (at least 40 ms,
  quieter than a noise-floor-relative threshold) sits on **both** sides of
  it. The cut never extends beyond those gaps.
- A filler that runs straight into a word has no such gap, so it is
  **never guessed at**. It is flagged for review in the cut editor, where
  the user sets the cut by ear.
- Rejected alternatives:
  - cutting at the transcriber's timestamps (clips syllables, as measured)
  - padding the timestamps (eats neighbouring words)
  - a model-placed cut (no better timing, and costs more)
- The rule is to prefer leaving a filler in over damaging speech.

**Local Supabase in Docker, local-only on purpose.** The trial runs
locally, and the user explicitly did not want a hosted Supabase account.

- `pnpm dlx supabase start` runs Postgres and Auth in Docker Desktop.
- Studio, the Data API, realtime, storage, edge functions and analytics are
  disabled in `supabase/config.toml`.
- Prisma connects directly; RLS is on with no policies (template rule).
- `.env.local` (gitignored) holds the local keys plus `GEMINI`/`DEEPGRAM`
  API keys.
- The `dev-onboarding` skill was updated for this local setup.

**Cost tracking.**

- Every AI call goes through a wrapper that calls `trackAiCall`, which
  writes one row per call to the `ai_usage` table, priced **at write time**
  (`src/server/lib/ai-usage/`).
- Models must be registered in `OPENROUTER_SLUGS`/`models.ts`, or the code
  doesn't compile (`TrackedModel`).
- MOAD (the org's dashboard) reads `ai_usage` directly and read-only over
  the Supabase Management API. The column contract in
  `prisma/schema/ai-usage.prisma` is therefore a cross-repo API: don't
  change it casually.
- Run the `ai-usage-check` skill on any branch touching AI calls.

**Export: in-browser real-time re-recording** (`export-video.ts`).

- How it works:
  1. An offscreen `<video>` plays each kept segment in order.
  2. Frames are drawn onto a canvas, then `canvas.captureStream(30)`.
  3. Sound goes through Web Audio (`createMediaElementSource` →
     `MediaStreamDestination`), so the user hears nothing.
  4. A `MediaRecorder` records both, **pausing across the jumps between
     segments** so the file holds exactly what plays.
- Format: VP9/Opus WebM, falling back to VP8 WebM, then MP4 (Safari).
- Why this approach:
  - ffmpeg.wasm would mean a ~30 MB download and a heavy client dependency
    (against `AGENTS.md`).
  - Server-side encoding would mean uploading the whole take and running
    ffmpeg on a server.
  - This way there's no dependency and the footage never leaves the
    browser.
- Costs:
  - The export takes as long as the edit runs.
  - The file's audio starts about 40–65 ms after its picture (section 4b).
  - The tab must stay in front, because hidden tabs stop `requestAnimationFrame`.
  - A MediaRecorder WebM has no duration header (players handle it, and the
    editor already probes for it).
- `export-button.tsx` gives progress, Cancel and the download
  (`<name>-edited.webm`). The download is always the **edited** sequence,
  regardless of the comparison toggle or a cut preview. When it's done, one
  toast: "Export finished", title only (the "<name> is downloading." line
  under it was dropped 2026-10-03 as redundant), or the wrong-length warning
  in its place (section 4f).

---

## 3b. Re-record and splice (audio-only v1, committed `e42ad94`)

**Decided by the user (2026-10-02):**

- **v1 is audio-only.** The user re-records a sentence with the mic only;
  camera + mic is not in v1. The user is responsible for matching what they
  say to what's on screen.
- **Expected and actual API cost: zero.** Recording (`MediaRecorder`),
  decoding, the gap search, trimming and level matching all run in the
  browser. The new take is never sent to Deepgram or Gemini, so nothing
  lands in `ai_usage`. All verification used the saved transcript.

**The flow as built:**

1. Each transcript line has a mic button ("Re-record the sentence at m:ss").
2. The panel (`re-record-panel.tsx`) shows the original sentence. If the
   sentence can't be re-recorded, Record is disabled and the reason shown:
   no clean pause before/after, trimmed into, split between clips, or
   overlapping another re-recorded sentence (`reRecordBlocker`).
3. Record, Stop, then Play original / Play with new take (the sentence plus
   1 s either side), Record again, Cancel, or **Use new take**.
4. The take plays in the editor and in export. **Undo last change** (the
   shared button, renamed from "Undo last cut") takes it back in one step
   (now one step of the full history, section 3c):
   the undo slot was `{ edit, replacements }` for clean-up, filler cut
   and re-record alike. Re-recording the same sentence again replaces its
   take.

**The picture during a replaced span** (the user's design): the original
picture keeps playing with its sound muted and the take over it. A shorter
take cuts the picture at its end, which then carries on from the span's
end; a longer one holds the span's last frame until it ends. So there is no
second `<video>`, only a second audio source: an `AudioBufferSourceNode`
through a gain node, in the editor (`use-sequence-playback.ts`, which turns
the video's **volume** to 0, because unmuting without a user gesture can
pause it) and in export (`export-video.ts`, where the source's sound goes
through a gain set to 0 and the recorder keeps running over the held frame).

**Model rules** (`sequence.ts`, all unit-tested):

- `Replacement = { span, takeSeconds }`; `playableSegments` turns a
  replaced span into a `voiceOver` segment with `holdSeconds`.
- A take plays only while its whole span is inside the trim and inside one
  clip range; otherwise the edit plays as if it weren't there.
- A take wins over any cut inside its span. Clean-up skips silences and
  fillers in replaced sentences, and a split inside a replaced span is
  refused.

**The take** (`re-record.ts`, `prepareTake`):

- Trimmed to its speech plus the same quiet either side that the original
  span kept around the sentence (`plan.speech` from the splice planner), so
  the pauses at the joins stay as they were.
- Speech is what's above both the recording's own gap threshold and the
  absolute -40 dBFS line: the relative threshold alone counted a silent
  recording as all speech.
- **The last 0.3 s of every recording is ignored:** a real take had the
  Stop button's click in it (a full-scale spike), which the mic hears at
  mouse-down just before the recording ends.
- One gain brings its speech level (90th percentile of 10 ms windows) to
  the original sentence's, capped at ±12 dB.
- **Mic: auto gain off, noise suppression on.** The user asked for both
  off, with the room-tone measurement deciding; with suppression off, a real
  laptop-mic take's background was -38 dBFS against the original's -53 and
  -60 (15–21 dB louder at the joins). With it on: -59.3 vs -59.4.
- Held in memory only, like every other edit: lost on reload.

**Real seam measurements** (`seam-check.mts`, the user re-recording "Let me
add a video here." at 0:25 of `Cap.mp4`, export through the app):

| Check          | Seam 1 (into the take)                                                         | Seam 2 (back to the original) |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| Clicks         | none: max jump 0.0017 vs 0.0020 within 40 ms                                   | none: 0.0013 vs 0.0017        |
| HF energy      | 1.7× the surrounding median (dry run: 1.6×)                                    | 1.2× (dry run: 1.2×)          |
| Added dead air | 0 (pause 0.05 s before and after)                                              | −30 ms (0.31 s → 0.28 s)      |
| Room tone      | take's quiet -59.3 dB; original before: -53 dB (only 2 windows of pause there) | original after: -59.4 dB      |

- **Level:** the take's speech is **2.0 dB below the speech around it**
  (-21.5 vs -19.5 dBFS), within 3 dB. Against the sentence it replaced it is
  **3.8 dB below** (-21.5 vs -17.7), outside 3 dB. The next section shows
  why: the ±12 dB cap.
- No clicks, so **no fades were added** (as agreed).
- Before/after WAVs for listening (3 s around each seam, and the whole
  sentence ±2 s) are in the second-session scratchpad:
  `real3-seam1-before.wav`, `real3-seam1-after.wav`,
  `real3-seam2-before.wav`, `real3-seam2-after.wav`,
  `real3-sentence-before.wav`, `real3-sentence-after.wav`. The `real2-*`
  files are the run with suppression off and the Stop click in the take.

**Gain, confirmed with logged values** (`seam-check-gain.mts`, a fourth
real take recorded the same way, 2026-10-02):

- The script captures, in the page, the decoded take (wrapping
  `decodeAudioData`) and every gain the app sets (wrapping `AudioParam`'s
  `value` setter), then recomputes the levels with the app's own functions.
  No logging was added to the app.
- Original sentence: **-17.7 dBFS**. Raw take: **-31.6 dBFS**, so the take was
  **13.8 dB quieter** (not ~16, the earlier guess). Gain needed +13.8 dB;
  applied **+12.0 dB, the cap**, and the app set exactly that.
- In the export the take sits at -20.1 dBFS: **2.4 dB under** the original
  sentence (within 3 dB this time), the cap's withheld 1.8 dB accounting for
  it. The third take's 3.8 dB shortfall fits a raw take ~15.8 dB quieter.
- **Noise floor:** at the +12 dB applied, the take's quiet in the export is
  -58.6 dB against the original's -59.4 dB. The full +13.8 dB would put it
  ~2.6 dB above the original's. Not shown to be inaudible, so per the user's
  rule **the cap stays at ±12 dB**.
- That take also showed **a click at seam 2** (max jump 0.033, 5× anything
  within 40 ms; 65× the high-frequency energy around it): the recording was
  only 2.34 s, Stop came while "here" was still sounding (-25 to -30 dB up
  to the cut), and the take ended mid-word. Fixed in `4574ee4`: such a take
  is refused with a message to record again (`stoppedMidSpeech`), not cut.
  Seam 1 had +60 ms of dead air (0.05 → 0.11 s); not investigated further.
- One of the dry runs before it had a corrupted export (the take read 5 s,
  the audio before the seam didn't match); a rerun was clean. It coincided
  with heavy paging (section 4d), so judge each run by its alignment
  correlation (≥ 0.99 when sound).

**The Record panel** also shows a live mic meter while recording (an
`AnalyserNode` on the mic stream, -60 to 0 dBFS; the bar is resized straight
on the element each frame, not through state) and says to pause a moment
before pressing Stop.

**Splice points** (`sentence-splice.ts` on `audio-gaps.ts`, which filler
cuts share): each join goes inside the real pause beside the sentence, at
its middle or 80 ms from the speech if that's closer. A pause that
_contains_ the transcriber's edge counts too (`15cd03e`): Deepgram stretches
a sentence's first or last word up to ~380 ms into the pause. A pause merely
near the edge does not. On `Cap.mp4`, **11 of 30 sentences are spliceable;
19 are refused** (11 at the start edge, 8 at the end), most because the
speech runs straight across the sentence boundary. Those can now have their
joins set by ear (section 3j).

**Known limitations of v1:**

- **Lip sync on face-on-camera footage:** the new words play over the
  original mouth movements, and a take of a different length freezes or
  skips the picture. Fine for screen recordings and voice-over; visible on
  talking heads. Accepted by the user for v1.
- Sentences without a clean pause on a side need their joins set by ear
  (section 3j), and such a join isn't guaranteed to be clean.
- Stopping while still speaking means recording again: the take is refused
  rather than cut mid-word.
- A take more than 12 dB quieter or louder than the original isn't fully
  level-matched (a real one was 13.8 dB quieter and ended 2.4 dB short).
- The take's speech is found against an absolute -40 dBFS line on its raw,
  pre-gain level, so a very quiet speaker's softest edges count as quiet.
- In the editor (not export), the joins are only as exact as the frame loop
  (~16 ms), and while a frame is held the native controls show "paused".
- Takes live in memory; reloading loses them, as it does every edit.

**e2e notes:** the re-record test is its own spec (`e2e/re-record.spec.ts`)
because Playwright only allows launch options (the fake-mic flags) at a
file's top level; the editor specs' helpers moved to `e2e/editor-helpers.ts`.
Its test video's pauses hold a faint tone (`quietLevel`, ~-57 dBFS): against
digital silence the encoder's fade-out after each tone reads as sound for
~0.3 s and pushes every pause's start back, which a real room never does.

---

## 3c. Undo and redo (full history)

- **Snapshots, not actions** (`history.ts`): every edit is immutable state
  that never touches the source, so a step is a snapshot of it,
  `{ trim, cuts, clips, replacements }`, and restoring one can't drift the
  way replaying inverse actions could. `History = { past, future }`; the
  present is the live state. An edit pushes the present onto `past` and
  clears `future`; Undo and Redo move it between the two.
- **Every edit is a step:** trim (a drag is one step, recorded at its first
  real move; each arrow-key nudge is one; a typed command's trim is one),
  clean-up, filler cut, split, reorder, merge, re-record. A reorder or merge
  that changes nothing isn't recorded (`moveClip`/`mergeClips` return the
  same array).
- **Re-recorded takes** are kept alive by the snapshots that reference
  them: Undo moves a take into `future`, Redo brings back the same
  `ReplacementTake` (and its `AudioBuffer`). A take is freed once no step
  holds it: a new edit after an undo, the cap, or loading another video.
- **Cap: 50 steps** (`HISTORY_LIMIT`). Far more than a session undoes
  through; a step is a few numbers except a take's audio (a few MB), so it
  bounds that on this 7.5 GB machine.
- **Buttons** sit where Undo was, in the clean-up bar: Undo last change and
  Redo, each shown only when there's something to undo or redo. **Shortcuts:**
  Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y, on `window` via `useEffectEvent`; ignored
  when focus is in an input, textarea, select or contenteditable, so the
  command bar keeps its own text undo.
- Undo and Redo pause the video on the restored trim's start, as Undo did.
- History lives in memory with the edit, so a reload loses both.
- **Reset to original** (clean-up bar, beside Undo/Redo): asks first, then
  goes back to `ORIGINAL_EDIT` (`edit-snapshot.ts`) as one step through
  `reset` in `history.ts`, which records the present like any edit, so one
  Undo brings back everything, takes included, and Redo resets again. Shown
  only when `isOriginalEdit` is false; that compares by effect, so a trim
  dragged back to the edges or a split merged again counts as original.
- **e2e:** the two fake-mic tests in `e2e/re-record.spec.ts` run one after
  the other (`mode: 'default'`). Run in parallel, the undo test's nine
  real-time exports starved the other's page (a 50 ms meter poll answered
  370 ms late) and its take came out 0.9 s, not the asserted 1.0 s.

---

## 3d. Preview speed (editor only)

- 0.5×, 1×, 1.5×, 2× under the player (`speed-toggle.tsx`), labelled
  "Preview speed", default 1×. Plain editor state: not in the edit, the
  snapshot, the history or the timeline.
- `useSequencePlayback` takes the rate: an effect after every render sets
  it on the `<video>` (a new element starts at 1×, and the frame loop would
  set it a few frames late — measured: the first samples after play ran at
  1×), and each take's `AudioBufferSourceNode` starts at it and is kept at
  it from the frame loop. Segment ends are in source time, so jumps and a
  held frame scale by themselves.
- The take's pitch rises with speed (Web Audio has no pitch correction),
  while the video's own sound keeps its pitch. Preview only, accepted.
- The player's own speed menu is hidden (`controlsList="noplaybackrate"`)
  so there's one control.
- **Export always runs at 1×:** it plays its own offscreen `<video>`.
- Clip speed (in the export) is a separate, undecided feature.

---

## 3e. Motion graphics v1: title card and watermark

- **Model** (`overlays.ts`): `title: { text, startSeconds, durationSeconds }`
  and `watermark: { image, aspect, corner }`, both in `EditSnapshot`, so
  every add, change and removal is one history step and reset clears them.
  One of each. The logo is a PNG data URL: nothing to revoke, and an undone
  logo comes back with its snapshot like a take.
- **Time base: the edited video.** "The first 3 seconds" means the export's
  first 3 seconds, whatever was trimmed or moved. A trim command's times
  stay in source time, as before. `editedSecondsAt` maps the playhead to
  edited time in play order; the playback hook now reports which segment
  it's in, because after a split and swap one source time both ends the
  edit and starts it (the end frame would otherwise show an opening title).
- **Export** (`export-video.ts`): `drawOverlays` paints the title (a dark
  band, centred white text, 8% of the height) and the logo (15% of the
  width, 3% in from the edges) onto the canvas after each frame, at the
  edited time the loop keeps per segment (and across a held frame), so
  they're in the recording.
- **Preview** (`overlay-preview.tsx`): HTML over the `<video>` with the same
  geometry, fitted to the picture inside the player's letterbox
  (`fitInside`) and sized in container-query units. Edited view only; not
  in Original, nor in a cut or take preview. A screenshot of the preview
  and the export frame at the same time were compared by eye and match.
  During a held frame under a longer take the preview's edited time stands
  still (the export's doesn't), so a title edge there can be off by the hold.
- **By hand** (`graphics-panel.tsx`): title text, start and duration (a
  draft until Add/Update), Remove; corner buttons, Add/Replace logo (PNG
  only), Remove watermark.
- **By command:** the schema gained `title` (text, start, end) and
  `watermark` (corner), same single Gemini call. Apply on a watermark plan
  opens the PNG picker, or moves the logo already there. The prompt names
  the four corners; the JSON schema leaves `corner` a nullable string
  (whether Gemini accepts `enum` with null wasn't tested) and zod checks it.
- **Checked against real Gemini** (2026-10-03, approved spend), through the
  app with every other server action blocked:

  | Command                                                           | Parsed                                |
  | ----------------------------------------------------------------- | ------------------------------------- |
  | "add the title Hello World starting at 1 second, for 1.5 seconds" | `title`, "Hello World", 1 → 2.5       |
  | "add a title saying Welcome to Retake for the first 3 seconds"    | `title`, "Welcome to Retake", 0 → 3   |
  | "put my logo in the top left corner"                              | `watermark`, `top-left`               |
  | "add a watermark in the top right"                                | `watermark`, `top-right`              |
  | "logo bottom left please"                                         | `watermark`, `bottom-left`            |
  | "add my logo as a watermark in the bottom right corner"           | `watermark`, `bottom-right`           |
  | "make the colours warmer"                                         | `unsupported`, every other field null |

  Each landed one `ai_usage` row (ids 46–52, `ok`,
  `google/gemini-3.5-flash-lite`, 171–192 micro-USD); total 1,277 micro-USD
  ($0.0013).

- **e2e record for this feature:** full suite 23/23 (run 3, 1,853 MB free),
  then 22/23 (run 4, 2,254 MB free): the existing export test
  (`editor.spec.ts`, "export records a real video…") came out 0.39 s longer
  than the edit, against 0.25 s allowed. That test alone, 5× on the new
  code and 5× on the committed code (`ec4269c`): 10/10. Two more full runs:
  23/23 (2,294 MB free) and 23/23 (2,556 MB free). The test has no title or
  logo, so the new code only adds a no-op `drawOverlays` per frame there.
  Not reproduced; cause not proven. Watch it alongside the two tests in
  section 4c. (Runs 1–2 failed on the duplicated message key noted in
  section 6, since fixed, not on this.)

---

## 3f. Automatic captions

- **Source:** the transcript's words (`captions.ts`), so no new
  transcription and no API cost. A caption ends at a sentence end, a pause
  over 0.7 s, or two lines of at most 24 characters.
- **Edited time:** each word is mapped through the playing segments
  (`editedCaptions`); a word whose middle doesn't play (cut, trimmed,
  outside every clip) is dropped, and reordered clips carry their words.
  Preview and export look up `captionAt` at the edited time and draw it
  with the title and watermark (`drawOverlays`, `OverlayPreview`): white
  bold text 6% of the height on the same dark backing, one box per line,
  6% up from the bottom.
- **Re-recorded sentences:** the span's **original** words, spread evenly
  over the take's playing length. **Limit:** the new take is never
  transcribed, so its captions are the replaced words, not timed to the new
  speech, and wrong if the user said something different.
- **The edit:** `captionsOn` in `EditSnapshot`: the toggle (Graphics panel)
  and the command are one undo step each; reset turns them off. The
  captions themselves are derived, not stored. Edited view only, like the
  other overlays.
- **Command:** two new action values, `captions_on` and `captions_off`; no
  new fields. Checked against real Gemini (approved): "turn captions on" →
  `captions_on`, "turn captions off" → `captions_off`, every other field
  null; `ai_usage` rows 53–54, 183 micro-USD each (366 in all).
- In the preview the second line sits over the player's own controls bar;
  readable, but the controls dim it while they show.

---

## 3g. Every editor action as a typed command

- **Schema** (`edit-command.ts`): new action values `split`, `merge`,
  `move`, `cleanup`, `undo`, `redo`, `reset`, `speed`, `rerecord`, `export`,
  and three nullable fields: `fromClip`, `toClip` (clips numbered from 1, as
  the Clips strip shows them) and `rate`. Split and re-record reuse
  `startSeconds` (source time).
- **Checked before it's offered:** `commandToPlan(command, context)` takes
  the editor as it is (`CommandContext`: clip count, whether a split is
  allowed there, what clean-up would remove, whether undo/redo/reset have
  anything to do, the transcript sentence at a time and its re-record
  blocker). A command that can't be done gets its own plain reason
  (`refused.*` in `messages/en.json`), never an Apply.
- **Apply runs the button's own handler** (`applyCommand` in
  `video-editor.tsx`), so every edit command is the same single undo step
  as by hand; undo, redo and reset move through the history like their
  buttons. Speed, re-record and export change nothing in the edit: speed
  sets the preview rate, re-record opens the panel for that sentence (the
  one the transcript labels with that time, else the one spoken then),
  export starts the same export as the button (`useVideoExport`, split out
  of `export-button.tsx` for this).
- **The honest reply** lists every command, and only what has no command
  as "in the editor itself": cutting one filler by ear, and the
  Edited/Original comparison.
- **Real Gemini** (2026-10-03, approved): all 18 shapes right through the
  app: split 10; merge 2–3; merge all (both null); move 2→1; move 1→end
  (toClip null); clean-up; undo; redo; reset; speed 2 and 0.5; re-record
  25; export; and as a regression check, trim, title, watermark corner,
  captions on, and an unsupported command. On the 2.9 s test video "cut from
  2 to 5 seconds" came back as 2–2.9: the prompt gives the length, and the
  app clamps a trim end to it anyway. One call (`ai_usage` row 71) failed
  with status `error` after 317 ms and no detail stored; the same command
  retried was fine. Cause unknown at the time; since then a failed call
  records its error type and HTTP status in `meta` (`failureMeta` in
  `track.ts`: `error_type`, `error_status`; never the message, which is free
  text). Checked end to end at no cost: a dev server started with an
  invalid `GEMINI_API_KEY` (an env var overrides `.env.local`), one command
  through the editor, and row 74 read `status` `error`, `meta`
  `{"error_type": "ApiError", "error_status": 400}`, 0 tokens, cost 0. The
  SDK's `ApiError` sets that name and a numeric `status`. 19 calls, 5,283
  micro-USD ($0.0053).
  **Each command now costs ~290 micro-USD, not ~183:** the longer prompt
  raised input tokens from ~230 to ~438.

---

## 3h. Annotation layer (80/20 slice)

- **Scope, chosen by the user (2026-10-03)** from an 80/20 proposal: filled
  box (color picker), blur box, text (white on the title's dark band),
  resize from one bottom-right handle, box/blur commands over named regions.
  **Left out:** the freehand pencil (stroke capture, scaling a path on
  resize, hit-testing a line), text color, a text command, editing an
  existing text's words (erase and redraw).
- **Model** (`annotations.ts`): `Annotation = { id, kind, rect, startSeconds,
endSeconds }` plus `color` (box) or `text`. `rect` is fractions of the
  picture (0–1), so the preview and the export, at any size, agree. Times
  are the **edited** video's, like the title's. In `EditSnapshot`
  (`annotations`), so every add, change (a whole drag) and removal is one
  history step, and reset clears them. `NewAnnotation` is the distributive
  Omit of `id` (a plain `Omit` on the union drops `color`/`text`).
- **Drawing** (`annotation-layer.tsx`): over the player, in the picture's
  own box (`fitInside`, as the overlays). With no tool picked it's
  pointer-events-none, so the player's controls work; with one, a pointer
  down pauses the video and the drag is drawn as it goes and handed up once,
  on release. A new item shows for 3 s from the playhead
  (`NEW_ANNOTATION_SECONDS`), cut short by the end. Select moves an item, or
  resizes it from its corner handle; Eraser deletes what it's clicked on.
  Drawing needs the Edited view (`editedNow`): the tools are disabled
  otherwise, with "Switch to Edited to draw."
- **Lane** (`annotation-panel.tsx`): one row per item over the edited
  video's length; drag the bar to slide it (`moveSpan`), its edges
  (`TrimHandle`, reused) to change start and end (`moveSpanEdge`, never
  closer than 0.1 s). Arrow keys slide a bar 0.1 s (Shift: 1 s), Delete
  removes it, the Eraser removes a clicked bar. The panel says: "Boxes and
  blurs stay where you put them: they don't follow anything that moves in
  the video."; box and blur command confirmations say it too.
- **Rendering:** the export draws annotations in `drawOverlays`, **before**
  captions, title and logo, so a blur blurs the video, not the captions.
  Text is clipped to its band; its height is 60% of the box's, so resizing
  scales it. The preview draws the same rects as HTML.
- **Blur, and why it's cheap:**
  - Export (`drawBlur` in `overlays.ts`): the patch is shrunk onto a scratch
    canvas at one pixel per 1/40 of the picture's width
    (`BLUR_BLOCK_FRACTION`), with high-quality (area-averaging) smoothing so
    it doesn't shimmer, then stretched back bilinearly. Two image copies a
    frame per blur and no per-pixel JavaScript; the scratch canvas is made
    once per export.
  - Measured in headless Chromium (CPU rendering), half of a 1080p frame,
    paint + blur + a 1-pixel readback to flush, 150 frames, two runs: no
    blur 0.3 ms; this **~3.0 ms**; high-quality stretching too 9.5–13.4 ms
    (it was the first version: the bicubic stretch is the cost);
    `filter: blur()` 26–31 ms. Script: `blur-bench2.cjs` in session
    `de7ea219-…`'s scratchpad.
  - Preview: CSS `backdrop-filter: blur(1.25cqw)` (half a block), on the
    GPU. It's a Gaussian, the export an average of blocks: similar, not
    identical. Measured on the e2e square: edge step 56 → 10 in the preview,
    63–91 → 10.7 in the export.
- **Command:** actions `box` and `blur`, one new nullable field `region`
  (`top-left`, `top-right`, `bottom-left`, `bottom-right`: a third of each
  side; `top`/`bottom`/`left`/`right`: halves; `center`: the middle third;
  `full`, the default). Times in the edited video; no end runs to its end.
  A box from a command is black (no color in the schema). The prompt gained
  four lines, so each command's input tokens (and cost) rise a little.
- **Checked against real Gemini** (2026-10-03, approved), through the app
  on a 7.9 s test video, with only the command parse reaching the server:

  | Command                                          | Parsed and shown                                                  | `ai_usage` row          |
  | ------------------------------------------------ | ----------------------------------------------------------------- | ----------------------- |
  | "blur the top-right corner from 1 to 2 seconds"  | blur, top-right, 0:01–0:02; applied: lane bar "Blur 1, 0:01–0:02" | 76, `ok`, 300 micro-USD |
  | "cover the bottom half with a box"               | black box, bottom half, 0:00 to the end                           | 77, `ok`, 341 micro-USD |
  | "blur the top-left corner from 20 to 25 seconds" | refused: "That range isn't in this clip.", no Apply               | 78, `ok`, 359 micro-USD |

  Total 1,000 micro-USD ($0.001). Input tokens are now ~540 a command (was
  ~438), from the four new prompt lines, so **each command costs ~300–360
  micro-USD**. Script: `live-annotate.cjs` in session `de7ea219-…`'s
  scratchpad.

- The reset confirmation now names graphics and annotations among what it
  removes.

---

## 3i. Audio problem flags (clipping, quiet speech, loud background)

- **What and where:** `audio-quality.ts`, run in `useTakeAnalysis` right
  after decoding, no API call. Clipping is measured on the decoded audio at
  full quality, channel by channel (mixing to 16 kHz mono smears peaks);
  quiet speech and noise on the 10 ms loudness the editor already measures.
  Shown as timeline flags (`TimelineFlag` kinds `clipping`, `quiet`,
  `noise`: red square wave, outlined speaker, cyan waveform), a count per
  kind, and a line under the track saying what each means and that nothing
  has been changed. A flag jumps the playhead to its start. Derived from the
  audio, so not part of the edit or its history.
- **The rules:**
  - _Clipping:_ a 50 ms window where at least 2% of a channel's samples are
    at or above 0.9 of full scale; windows under 1 s apart are one flag.
  - _Quiet speech:_ 2 s windows (0.5 s apart) with at least 30% speech
    (above the recording's gap threshold); a window is quiet when its speech
    (90th percentile) is 15 dB or more below the median window's; quiet
    windows joined, kept if they last 2.5 s or more.
  - _Loud background:_ 10 s windows (1 s apart) with speech in them; flagged
    when their 90th-percentile level is less than 15 dB above their 10th
    (the background in the pauses); then each edge is walked in 1 s at a
    time while that second's background is 6 dB quieter than the stretch's.
- **Measured on eight real recordings** in `Downloads` (decoded by installed
  Chrome as the app does; nothing copied into the repo): `Cap.mp4`, the
  26 September Cap recording, a Google Meet call, the Mentee and Mentor
  guides, the ETL intro and two WhatsApp videos (21 minutes in all).

  | Quantity                                       | Clean recordings (worst)                   | Problem, made from `Cap.mp4`                       |
  | ---------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
  | Share of a 50 ms window at ≥ 0.9 of full scale | 1.0% (`Cap.mp4`)                           | +6 dB into clipping: up to 10%, 38 windows at ≥ 2% |
  | Speech window below the typical level          | 12.8 dB (Mentor); 25 dB on one fading word | turned down 15–25 dB for 10 s: found every time    |
  | Speech above background (10 s windows)         | 22.7 dB (WhatsApp 16 May); the rest 24–35  | noise 10 dB under the speech: ~10                  |

  AAC and Opus round trips (WebCodecs) moved the clipping shares by under
  3%, so measuring the decoded file is sound. `Cap.mp4`'s peaks reach 1.05
  after decoding, but only momentarily (its worst window: 1.0% of samples
  near full scale), not the sustained pile-up clipping makes.

- **Results on the real recordings:** **`Cap.mp4`: no flags.** Seven of
  eight: no flags. The WhatsApp video of 28 May is flagged as a loud
  background from 0:01 to 0:17: during speech its background sits at about
  −32 dBFS, only ~12 dB under the voice (the clean ones: 23–35 dB). Its
  spectrum is between tonal and broadband (flatness ~0.08). **The user
  listened: it's background music.** The flag's wording ("Loud background")
  is accurate for music; it never says "noise".
- **`Cap.mp4` with problems added** (the shipped code on doctored copies):
  clipped 20–30 s → flags only inside it (+3 dB: 2, +6 dB: 3, +12 dB: 4
  stretches); quiet 50–60 s → 52.5–57.5 (−15 dB), 50–60 (−20), 50.5–60
  (−25), none at −10/−12; noise 80–100 s → exactly 80–100 at 5 and 10 dB
  under the speech, 80–95 at 15, none at 20/25. Nothing anywhere else.
- **What it can't do (left out, or not claimed):**
  - Quiet speech 30 dB down: in `Cap.mp4` it sinks to ~10 dB above the room
    tone, where loudness can't tell speech from background. Not flagged.
  - Quiet stretches of ~3 s were found only some of the time; the flag is
    for sustained quiet speech (the minimum is 2.5 s because a single 2 s
    window over a word fading into a pause raised a false flag on Mentee).
  - A noisy burst shorter than ~10 s (a door, a cough) isn't flagged; a
    music bed counts as background (the ETL intro's measured 18 dB, under
    the line).
  - Audio mastered to sit at full scale would be flagged as clipping: that
    is what it measures.
  - Not tried: heavily compressed broadcast speech with no pauses, which
    might read as a loud background. The podcast in `Downloads` was too
    big to decode with this machine's free memory.
- **Cost:** in Node, 0.1–1 s for 2–6 minute recordings.
- **Scripts** (session `de7ea219-…` scratchpad): `measure-audio.cjs`
  (first survey), `clip-experiment.cjs` (AAC/Opus round trips),
  `dump-audio.cjs` (decodes the eight to `audio-dump/`), `run-quality.mts`
  (the shipped detectors on them and on doctored `Cap.mp4`),
  `quiet-grid.mts` (the quiet rule's two settings).

---

## 3j. Joins set by ear (sentences with no clean pause)

- **The flow:** a sentence the planner refuses (no pause on a side) shows
  its reason and **Set the join by ear**. That opens the join editor in the
  re-record panel (`join-editor.tsx`): a zoomed loudness waveform around
  the sentence's start and one around its end (`joinViews`: a second of
  context), each with a draggable, keyboard-operable handle (10 ms steps,
  Shift 50 ms) and "Play around the start/end", which plays the original
  across that view. The replaced stretch is shaded. One line, in warning
  colour: "A join set by ear isn't guaranteed to be clean: play the new take
  in place before you use it." Record is enabled once the joins exist.
- **Where the handles start** (`initialJoins`): on a side with a pause, in
  it, placed as an automatic splice would be; otherwise at the quietest
  10 ms window within 0.25 s of the transcriber's edge (on real speech, the
  dip between two words).
- **Limits** (`joinBounds`, `moveJoin`): within a second of the sentence,
  inside the clip range (and trim) that plays it, clear of cuts and other
  re-recorded spans that start before it or end after it (those inside it
  don't count: a take wins over a cut in its span), each handle inside its
  own view, and never closer than 0.2 s to the other.
- **The same path as automatic sentences:** a by-ear plan is an ordinary
  `splice` plan with `byEar: true` and `speech` equal to the joins, so
  there's no pause to keep and the take is trimmed to its own speech
  (`takeRange`). Recording, preview, Use new take, undo/redo, reset and
  export are unchanged. A take already recorded moves with the joins (its
  span changes; its gain, matched when it was recorded, doesn't).
- **Re-opening:** a sentence's existing take is now found by which take
  covers the sentence's middle (was: an exact span match), so a by-ear
  sentence re-opens with its joins, and its take is replaced on apply
  (`replacing` id), not counted as overlapping.
- **Typed command:** "re-record the sentence at X" now opens the panel for
  a sentence that only lacks a pause; trimmed, split or overlapping ones are
  still refused with their reason.
- **Shared waveform:** `loudness-track.tsx` (waveform, gap line, shaded
  stretch, playhead, handles) is used by the filler cut editor and the join
  editor. A render-prop version failed the React Compiler lint (it reads a
  ref "during render"); the track takes a plain list of handles instead.
- **Seam on real audio** (`seam-check-byear.mts`, session `de7ea219-…`
  scratchpad): "So, yes, the video is added here." (0:29–0:31 of
  `Cap.mp4`, refused `no_gap_after`: "here" runs straight into "Now…", no
  window quieter than −31 dBFS there). Joins left where they start: 29.080
  (in a pause) and 31.305 (speech into speech). The take: the fake mic
  playing **the sentence's own audio from `Cap.mp4`** (30 ms fade at the
  end), so this measures the join mechanics, not a new performance. The
  export aligned at r = 0.9985 / 0.9997 and came out 108.78 s for 108.79
  expected.

  | Check                            | Seam 1 (in a pause)                      | Seam 2 (speech into speech) |
  | -------------------------------- | ---------------------------------------- | --------------------------- |
  | Clicks: max step at seam / 40 ms | 0.0027 / 0.017: none                     | 0.0026 / 0.0077: none       |
  | High-frequency energy vs around  | 3.0× (near-silent surroundings)          | 0.69×                       |
  | Dead air                         | pause 1.95 → 1.89 s                      | 0 → 0: none added           |
  | Level                            | take −16.6 dBFS vs sentence −16.4        |                             |
  | Room tone                        | take −56.5 vs original −59.4 (3 dB more) | none after (speech)         |

  WAVs: `byear-dry2-{seam1,seam2,sentence}-{before,after}.wav` in that
  scratchpad. An earlier run with ~1.6 GB free produced a corrupted export
  (127 s, alignment r 0.02–0.18) and was discarded, as in section 4d.

- **With the user's own voice** (2026-10-03, `seam-check-byear.mts real
byear-real`, joins left at the start candidates, export aligned at r =
  0.9984 / 0.9998, 108.78 s):

  | Check                            | Seam 1 (in a pause)                      | Seam 2 (speech into speech)                      |
  | -------------------------------- | ---------------------------------------- | ------------------------------------------------ |
  | Clicks: max step at seam / 40 ms | 0.0031 / 0.047: none                     | **0.027 / 0.013: a click** (2× its surroundings) |
  | High-frequency energy vs around  | 1.67×                                    | **3.9×**                                         |
  | Dead air                         | pause 1.95 → 1.89 s                      | 0 → 0: none added                                |
  | Level                            | take −16.3 dBFS vs sentence −16.4        |                                                  |
  | Room tone                        | take −52.3 vs original −59.3 (7 dB more) | none after (speech)                              |

  So a real, different performance joined straight into speech ("here" →
  "Now") clicks, where the dry run with the sentence's own audio didn't.
  Fixed since by fading the take's edges (below). WAVs: `byear-real-{seam1,seam2,sentence}-{before,after}.wav`;
  the user's take, cut back out of that export: `user-take.wav`.

- **Two bugs the user found in that session, fixed:**
  1. "Play with new take" seemed dead: the preview froze at its start
     (28.080 s). 2. After applying, the edited video looped on the take's
     first word ("so so so") and never got past the start join (29.080 s).
  - **Cause (one for both), measured:** the start join was a computed time,
    29.080000000000002; sought there, Chrome reports 29.08 for an MP4 (time
    to the microsecond) for the whole ~500 ms seek. Compared exactly, that
    is before the take's segment, so the frame loop took playback to be in
    the segment before, found it over, sought to the join again (restarting
    the take each time); and the preview, starting a second before the
    join, sought "forward" to its own start forever. Every write came from
    the frame loop (logged with callers); the buttons themselves were
    enabled and clickable (a trial click found nothing over them), and "Use
    new take" applied normally in the reproduction.
  - **Fix:** `isInSegment` / `SEEK_TOLERANCE_SECONDS` (1 ms) in
    `sequence.ts`: a time a hair before a segment's start counts as in it,
    in `playbackPosition`, the frame loop and `settle`; a take started at a
    hair before its start starts at 0. Automatic splices could hit it too
    (their starts are computed the same way).
  - **Tests that catch it:** a unit test (`sequence.test.mts`; fails without
    the tolerance), and the by-ear e2e now plays "Play with new take" past
    the join and plays the edited video through the span, the take started
    once. The WebM test video had hidden it (it reports exactly what was
    written and seeks within a frame), so that spec makes the video behave
    as Chrome does with an MP4: time to the microsecond, and the target
    reported for 100 ms after a seek. Without the fix: the preview froze at
    0.015 s, and (preview step removed) edited playback stopped at 1.08 s
    for a 3.1 s end join. On the user's take after the fix: the preview
    plays 28.08 → 29.85, edited playback 28.6 → through the take → 33.8.
- **The click, found and fixed:** in the user's export the take itself
  stopped dead: 2 ms before seam 2 it was still at -26 dB and dropped from
  0.044 to 0 in one sample; the original's side resumed smoothly from its
  own dip (-48 dB) where the end join started. Why: a by-ear take keeps no
  pause after its speech, so `takeRange` ends it at its last loud 10 ms
  window, mid-decay. Fix: `fadeSeconds` on a take (`JOIN_FADE_SECONDS`, 10
  ms, by-ear takes only; 0 for automatic ones, which start and end on room
  tone and whose seams measured clean), applied by `scheduleTakeGain` on
  the audio clock in both the export (`playTake`) and the editor
  (`startVoice`): in from 0 at the take's start, out to 0 at its end,
  picked up partway when playback starts inside it, scaled by the preview
  speed. No crossfade with the original is needed for this click, and
  there's no overlap to do one with (the export records segments one after
  another). **Limit:** a handle dragged into loud speech cuts the original
  itself mid-waveform on its side; the take's fade doesn't smooth that.
  The handles start at the quietest moment.
- **Verified on the user's real export** (`fade-model.mjs`): the fade is
  only a gain on the take's samples, so it was applied to the take's last
  10 ms in that export and measured:

  | Seam 2                          | Original        | User's export   | With the fade   |
  | ------------------------------- | --------------- | --------------- | --------------- |
  | Max step at seam (around)       | 0.0018 (0.0056) | 0.0269 (0.0128) | 0.0047 (0.0128) |
  | High-frequency energy vs around | 0.73×           | 3.87×           | 0.75×           |
  | Quietest 5 ms within 15 ms      | -50 dB          | -46 dB          | -49 dB          |

  No click, and the dip is the original's own valley between "here" and
  "Now". WAV: `byear-real-seam2-after-faded.wav`. **Not done:** a fresh
  export of a new real-mic take with the fade. Through the fake mic the
  click doesn't reproduce at all, even with the user's take and its decay
  restored (`user-take-tail.wav`): Chrome's capture processing reshapes the
  ending so the trim lands in quiet. Those A/B runs (fade off / on) show
  the fade changes nothing else: length 108.78 / 108.84 s, take level
  -16.4 dBFS both, pauses 1.88 s both, alignment r >= 0.9985.

- **Picture hold at the start join, fixed:** `advance` no longer seeks when
  the next segment starts where the current one ends and playback is
  already in it (a take's start join): the picture plays on. It used to
  seek anyway, holding an MP4's picture ~0.45 s while the take already
  spoke (automatic splices too). The by-ear e2e checks no seek happens at
  the start join (an unconditional seek fails it: 3 seeks there).
- **Unit tests** for the envelope (`re-record.test.mts`): from the start,
  resumed in the middle, halfway into either fade, at 2×, and unfaded for
  automatic takes.

---

## 3k. Picture transforms (crop, rotate, flip) and pixelate

- **Model** (`transform.ts`): `PictureTransform = { rotation, flipH, flipV,
crop }` in `EditSnapshot`, so every change is one undo step and reset
  clears it. Order is fixed: flip, then turn about the picture's centre,
  then crop. Rotation is any angle, kept in (-180, 180].
- **Empty corners, decided:** the frame grows to the turned picture's
  bounding box (`rotatedFrame`), so no part of the picture is lost; the
  corners are black. Exact 90° steps swap the frame (a 16:9 take becomes
  9:16) with no corners. A crop then keeps a rectangle of that frame and
  is the output. Zoom-to-fill was the alternative; it loses ~43% of the
  picture at 15° and more beyond.
- **One matrix** (`pictureMatrix`) maps the source picture to the output.
  The export draws through it (`drawFrame` in `overlays.ts`: black, the
  picture, then annotations in picture space, then title, captions and
  logo in output space). The preview (`picture-frame.tsx`) places the
  picture box from the same numbers and turns/flips it with CSS; the output
  frame clips it to the crop. Exports are sized to the output, rounded to
  even pixels (`evenPixels`).
- **Annotations are pinned to the picture** (the user chose this): they're
  drawn in source-picture space, so a blur over a face stays on it through
  a turn, flip or crop. Blur and pixelate sample the source video, not the
  canvas (so a box under a blur isn't blurred). Text turns with the picture
  but is unmirrored about its own centre, so a flip never reverses it. In
  the preview the annotation layer lives inside the turned picture box;
  pointer positions go through the inverse matrix (`outputToPicture`).
- **Title, captions, watermark belong to the output frame**, laid over it
  unturned. Their text is now sized against the frame's shorter side
  (`cqmin` in the preview), so a portrait crop doesn't push a 24-character
  caption line past its edges. Landscape outputs are unchanged.
- **Controls:** the Picture panel (`transform-panel.tsx`): a degrees field
  (applied on Enter or leaving it), Rotate left/right 90°, Rotate by
  dragging (a handle on the picture, Shift snaps to 15°, arrow keys 1°),
  Flip horizontally/vertically, crop presets Free/16:9/9:16/1:1/4:5, Adjust
  crop (a box over the whole rotated frame, the rest dimmed: move, resize
  from the corner keeping a preset's shape, or draw a new one), No crop.
  A preset crop is refitted when the picture turns; a free crop keeps its
  fractions. The Original view shows the untouched take.
- **Player controls:** turned or flipped, the browser's own controls would
  turn too, so they're hidden and a Play/Pause button under the player
  stands in. The <video> keeps its place in the tree, so a transform never
  reloads it.
- **Pixelate:** a fourth annotation kind (tool, lane, undo as blur). Export:
  the patch shrunk to one pixel per 1/30 of the picture's width and
  stretched back without smoothing. Preview: a small canvas per item,
  redrawn each animation frame, shown with `image-rendering: pixelated`.
- **Commands:** actions `rotate` (`degrees`: how far, clockwise positive,
  added to the current angle), `flip` (`axis`, horizontal by default),
  `crop` (`aspect` preset or `none`), `pixelate` (region and times as
  blur). Checked against real Gemini (2026-10-04, approved), through the
  app:

  | Command                                            | Parsed and shown                      | Row, micro-USD |
  | -------------------------------------------------- | ------------------------------------- | -------------- |
  | "rotate the video 15 degrees"                      | turn 15° clockwise, to 15° (applied)  | 79, 436        |
  | "crop to 9:16"                                     | crop to 9:16, centred (applied)       | 80, 446        |
  | "flip it horizontally"                             | flip horizontally (applied)           | 81, 433        |
  | "pixelate the top-left corner from 2 to 5 seconds" | pixelate top-left 0:02–0:05 (applied) | 82, 461        |
  | "turn it left 90 degrees"                          | 90° anticlockwise, 15° → -75°         | 83, 436        |

  Total 2,212 micro-USD ($0.0022). Input tokens are now ~680 a command, so
  **each command costs ~430–460 micro-USD**.

- **A real bug found on the way, fixed:** a drag's release read the drag
  from React state, which a pointer move may not have rendered yet; the
  rotation handle committed a stale angle (75° on a drag to 90°, or none).
  The handle, the crop box and the annotation layer now keep the latest
  drag in a ref and read it on release. The annotation lane's bars and
  edges use the older pattern and haven't been seen to miss; not changed.
- **Limits:** a box under a blur or pixelate isn't obscured (they sample
  the video); annotations near the picture's edge can be cropped away; a
  very large angle makes a large frame (1080p at 45°: ~2121×2121) and a
  heavier export.

---

## 3l. Clip volume, mute and fades

- **Model** (`clip-audio.ts`): `ClipAudio = { volume, muted, fadeInSeconds,
fadeOutSeconds }` on the clip itself (`Clip.audio`, absent when as
  recorded), so it's in every snapshot: one undo step per change, and reset
  (back to the untouched take) clears it. A change to a take never split
  makes it one explicit clip. Volume 0 to 2 (200%).
- **Fades** run over the clip's own played time, its kept pieces end to end
  (cuts skipped, a take's held frame included): straight lines from silence
  and to silence; fades longer than the clip together meet where their
  lines cross. `playableSegments` marks each segment of a clip with sound
  with its clip's settings, the clip's length and its offset in it
  (`Segment.audio`); clips as recorded carry nothing, so their segments are
  unchanged.
- **Split and merge:** both halves keep the volume and mute; the fade in
  stays with the first half, the fade out with the second. A merge keeps
  the first clip's volume, mute and fade in and the last clip's fade out.
- **Export:** one clip-level gain after both the source's sound and any
  take; each segment schedules its part of the envelope on the audio clock
  when it starts (`scheduleClipGain`, exact: ramps between the envelope's
  corners). Measured fade out ~20 ms late: the element's sound reaches the
  graph a little after the clock (section 4b's lead-in).
- **Preview:** a <video> can't go over 100%, so once any clip has sound
  settings the video's sound is routed through a Web Audio gain
  (`createMediaElementSource`, once per element: it stays routed), set each
  frame toward the envelope at the playhead (smoothed over 15 ms). A take
  plays into the same gain. Videos with no clip sound keep the browser's
  own path.
- **A re-recorded take** keeps its level-matching gain and edge fades; the
  clip's volume and fades apply on top (muting a clip mutes its take).
- **UI:** a Clip sound panel, a row per clip: Volume slider (5% steps; a
  drag is one change, on release), Mute, Fade in / Fade out seconds (on
  Enter or leaving the field). Over 100% can clip loud speech; the panel
  says so.
- **Commands:** `volume` (`percent`, on `fromClip` or every clip), `louder`
  / `quieter` (×1.5 / ÷1.5, up to 200%), `mute` / `unmute`, `fade_in` /
  `fade_out` (`seconds`, default 1; with no clip named, the first clip's
  fade in or the last clip's fade out: the start or end of the video).
- **The command prompt, trimmed:** it had grown to ~680 input tokens a
  command; rewritten as a terse list of actions and fields (examples only
  where needed), it's ~416 with seven more actions. Real Gemini, 2026-10-04
  (approved): all 7 new shapes and a 12-command regression sample (trim,
  split, merge all, move, title, watermark, captions, blur, rotate, crop,
  speed, an unsupported one) parsed right; rows 84–103. One call (row 100,
  "crop to 9:16") was rate-limited: `meta` `{"error_type": "ApiError",
"error_status": 429}` after 308 ms (the failure-reason logging at work);
  the app showed "busy", and the command parsed right when rerun. 19
  successful calls, 7,285 micro-USD ($0.0073); **a command now costs
  ~320–410 micro-USD** (was ~430–460).

---

## 3m. Clip speed

- **Model** (`sequence.ts`): `Clip.speed`, 0.25 to 4 (`MIN_CLIP_SPEED`,
  `MAX_CLIP_SPEED`, `clampSpeed`), absent at 1, so it's in every snapshot:
  one undo step per change, and reset clears it. `playableSegments` puts the
  clip's speed on each of its segments (`Segment.rate`); `segmentSeconds`
  is `(end - start) / rate` (+ any held frame), so everything built on it
  follows: the edited length, the clip strip's widths, `editedSecondsAt`,
  captions (`editedWord` scales by the segment's played length), and the
  clip's fades (`SegmentAudio.clipSeconds` and offsets, in played time).
- **Source time is unchanged:** the transcript, trim, cuts, splits and
  re-record spans stay in source seconds. Annotations and the title stay at
  their edited times (they belong to the output, as before).
- **Pitch kept** (`preservesPitch`, also the browser default). Probed in
  bundled Chromium and Chrome: a `<video>` keeps its sound from 0.25× to 4×,
  440 Hz stays 434–445 Hz; with pitch keeping off it scales (113 Hz at
  0.25×, 1758 Hz at 4×). Chosen over letting pitch change because speech
  at 2× with chipmunk pitch is rarely what anyone wants.
- **Export:** the offscreen video plays each segment at its rate, recorded
  in real time, so a sped-up clip exports faster than its source and a
  slowed one slower (export time = edited length). At 4× the browser must
  decode four times as many frames; a 1080p source may drop frames there
  (not measured on long 1080p video yet).
- **Preview:** `playbackRate` is the preview speed times the playing clip's
  speed, set each frame as a segment begins and after every render. The
  Original view is the untouched take at 1× (times the preview speed).
- **Re-recorded takes** play at 1× as recorded: re-recording a sentence in
  a sped clip is blocked (`sped`: "set the clip back to 1×"), the Speed
  field is disabled for a clip with a take, and a take that a merge puts
  in a sped clip still plays at 1× (its segment carries no rate).
- **Split and merge:** both halves keep the speed; a merge plays at the
  first clip's.
- **UI:** the clip panel is now "Clip sound and speed", with a Speed (×)
  field per clip (0.05 steps; on Enter or leaving the field). The clip
  strip shows a sped clip's speed ("2×") next to its played length.
- **Commands:** `clip_speed` (`rate` 0.25–4, `fromClip`, null: every
  clip). Out of range is refused ("A clip can play from 0.25× to 4×"), not
  clamped. A clip with a take refuses; every clip skips such clips and
  says so. The prompt now gives the clip count, so "the last clip"
  resolves; `speed` stays the preview rate ("play at 2x"), and its confirm
  points to the clip command.
- **Real Gemini, 2026-10-04 (approved with the feature):** "make clip 2
  play at 2x" (clip 2, 2×), "slow the last clip to half speed" (clip 3 of
  3, 0.5×), "speed the whole video up to 1.5x" (every clip), "make clip 1
  play at 8 times speed" (refused), and the regressions "play at 2x"
  (preview), "mute clip 2", "cut from 2 to 5 seconds", "move clip 3 to the
  start", "make the colours warmer" (unsupported): all right. Rows 104–112,
  9 calls, 3,683 micro-USD ($0.0037); input ~487 tokens (was ~416), **a
  command now costs ~410–424 micro-USD**.

---

## 3n. Transitions between clips; delete and duplicate

- **Model** (`transitions.ts`, `sequence.ts`): `Clip.transition =
{ kind: 'fade' | 'dissolve', seconds, after }`, the join into that clip,
  applying only while the clip with id `after` is right before it
  (`transitionInto`). So moving or deleting a clip drops the transitions at
  its joins with no bookkeeping, and moving it back restores them. Split,
  merge and duplicate rewrite `after` where the same join survives under a
  new id. All in `clips`, so each change is one undo step and reset clears
  them. 0.1–3 s, default 1 s, in the edited video's seconds.
- **Limits:** at most half the piece of picture (the segment) either side
  of the join, so transitions at both ends of a clip never meet; none
  against a re-recorded take (its sound and length are its own); applied
  shortened where the clips are short (`joinLimit`). The panel says "up to
  X s here", "plays X s here" or "not here".
- **Fade through black:** the clip before fades picture and sound to
  black/silence over the first half, the clip after up over the second
  half; the edit keeps its length. The captions, title and logo stay (they
  belong to the frame); annotations fade with the picture.
- **Dissolve:** the clips overlap by its length: the clip after starts that
  much before the one before ends, its picture blending in (linear) and the
  sounds crossfading at equal power (cos/sin, so unrelated sounds don't
  dip). The edit gets shorter by that much. `Segment.transition` is on a
  clip's first segment; `editedStarts`/`editedLength` give every segment's
  start and the total, and captions, `editedSecondsAt`, the export and its
  length check use them.
- **Export, the decision:** the export recorded one segment after another
  from one `<video>`, pausing the recorder across each seek; a dissolve
  needs two clips at once. **Two players ("decks") take turns:** while a
  clip plays, the other deck is sought to the start of a clip dissolving in;
  at the overlap it starts, both are drawn on the canvas (the incoming one
  with rising alpha) and both sounds go through their own gain chains
  (clip level → transition mix → the recording), and at the join it carries
  on alone without the recorder pausing. Every other join pauses across the
  seek as before. The second deck is opened only when the edit has a
  dissolve. Chosen over a frozen frame of the outgoing clip (which looks
  like a stall) at the cost of decoding two videos through each overlap.
  The fade is a black layer in `drawFrame` (`FrameMix.light`) and a
  scheduled dip (`scheduleTransitionGain`).
- **Preview:** a fade is a black layer over the picture (under captions)
  and a dip in the clip-level gain (the video is routed through Web Audio
  once any segment has a transition). A dissolve uses a second `<video>`
  over the first, rendered only while the edit has a dissolve: sought ahead,
  started at the overlap, faded in with its volume crossfading. At the join
  the main video jumps 0.2 s (× speed) ahead of it and takes over once it has
  caught up (silent meanwhile), so the seek never shows. The Original view
  has no transitions.
- **Delete** (`deleteClips`, a selected run or Delete/Backspace on a clip):
  what the clip played no longer plays, like a cut; never every clip. A
  sentence in a deleted clip can't be re-recorded (`deleted`: "undo the
  delete").
- **Duplicate** (`duplicateClips`, a selected run): copies right after the
  originals with the same sound, speed and any take (which plays in both);
  the first copy starts with a plain cut, and the transition into the next
  clip follows the copies. A source time can now be in two clips, so the
  clip strip's highlight and Split follow the clip playing
  (`segmentClips`, `findSplit`'s preferred clip), and captions show in both
  copies. Seeking on the (source-time) timeline into a duplicated range
  goes to the first copy; re-recording a sentence in it changes both.
- **Commands:** `fade_transition`, `dissolve`, `remove_transition`
  (`fromClip`/`toClip` side by side, or just `fromClip`: the join after it;
  all null: every pair, skipping joins with no room), `seconds`;
  `delete_clip`, `duplicate_clip` (`fromClip`). Refusals: not side by side,
  no such clip, no room at that join, only one clip (no join / nothing left).
- **Real Gemini, 2026-10-04 (approved with the feature):** "add a fade
  between clips 1 and 2", "dissolve between all the clips for half a
  second" (every pair, 0.5 s), "remove the transition between clips 2 and
  3", "add a fade between clips 1 and 3" (refused: not side by side),
  "delete clip 3", "duplicate the first clip", and the regressions "fade
  out the last 2 seconds" (still the audio fade, on clip 3), "make clip 2
  play at 2x", "play at 2x" (preview), "split at 3 seconds", "make the
  colours warmer" (unsupported): all right. Rows 113–123, 11 calls, 4,521
  micro-USD ($0.0045); input ~534 tokens (was ~487), **a command now costs
  ~355–434 micro-USD**.

---

## 3o. Color adjustments, text styling and the pencil

- **Color model** (`color-grade.ts`): `ColorGrade = { brightness,
contrast, saturation (0–2, 1 as recorded), look: none | black_and_white |
warm | cool }`. The whole video's in the snapshot (`color`), a clip's own
  on the clip (`Clip.color`, on top of the video's; split, merge and
  duplicate carry it). Each change one undo step; reset clears both.
- **How the per-frame cost stays low:** every adjustment is linear in RGB,
  so a clip's whole grade (the video's, then its own) is composed into
  **one** 3×4 color matrix and applied in **one** pass as an SVG
  `feColorMatrix` (`color-interpolation-filters: sRGB`, as CSS's own
  filters). The preview sets `filter: url(#id)` on the `<video>` (and on the
  dissolve player, and a pixelate's copy of the picture); the export sets
  `context.filter = url(#id)` on its canvas while drawing the picture, from
  filters it mounts itself for the export's length. A clip with nothing set
  draws with no filter at all. Measured per 1080p frame (draw + readback):
  no filter 0.6 ms / chain of CSS brightness() contrast() saturate() 34 ms /
  one matrix 14 ms in headless (software) Chromium; 1.6 / 4.5 / 3.5 ms in
  Chrome on the GPU. Blur and pixelate patches are graded with the same
  filter when drawn back (an average and a color matrix commute), so a
  blurred patch matches the graded picture. Captions, title and logo are not
  graded; annotations' own colors (boxes, text, pencil) aren't either.
- **Warm and cool** are slight casts (warm: red ×1.1 +3%, blue ×0.85 −2%;
  cool the other way); black and white is saturation 0 (Rec. 709 luma).
- **Text styling** (`text-style.ts`): `TextStyle = { font: sans | serif |
mono | handwriting (CSS generic families, the same font in HTML and
canvas), size (0.5–2× the default), color, background (a band at 60%, or
none) }` on the title (`TitleCard.style`), the captions (snapshot
  `captionStyle`) and each on-video text (`style`). The default is the old
  look exactly (white on black at 60%). Fields: font and the background
  switch at once; size and colors on Enter or leaving the field (one change,
  not one per picker step). On-video text: the style of the text picked
  with Select, or else of new text.
- **Pencil** (`kind: 'pencil'`): one fixed width (0.6% of the picture's
  width), any color (the box color field); the stroke's points are kept as
  fractions of its rect, so it moves and resizes like any annotation and is
  pinned to the picture (turns, flips and crops with it). Preview: an SVG
  polyline, non-scaling stroke sized in container units; export: a canvas
  path, round caps and joins. The eraser takes it off whole.
- **Commands:** `color` (`property` brightness / contrast / saturation with
  `percent` the change, 20 if none, or black_and_white / warm / cool /
  normal; `fromClip`, null for the whole video) and `text_style` (`target`
  title / captions / text; `color` and `background` as a name or #rrggbb,
  background "none"; `font`; `percent` size). Refusals: colors already
  normal, no title, no text, nothing it can apply.
- **Real Gemini, 2026-10-04 (approved with the feature).** First run (14
  calls, rows 124–137, 7,726 micro-USD): "make the title red" refused and
  "bigger and yellow" lost its color (Gemini sent "red", not #rrggbb), and
  "add a fade between clips 1 and 2" came back a dissolve. Fixed: color
  names accepted in code, the transition line reworded. **Tried and
  reverted: only `action` required** (unused fields left out): half the cost
  (~250 micro-USD, ~23 output tokens instead of ~143; output is ~2.4 and
  input ~0.3 micro-USD a token here), but Gemini then skipped fields it
  needed: "make clip 2 warmer" and "give the second clip a cool look" lost
  their clip, "reduce the contrast a lot" its amount, "bigger and yellow" its
  size, and "increase the brightness" sent an invalid `target` (rows
  138–153, 4,054 micro-USD; raw replies read from a temporary server log,
  removed). Back to every field required (the parse still accepts a missing
  one as null). **Final sweep, 28 commands** (all 14 new and every older
  shape: trim, split, merge, move, title, captions, blur, rotate, crop,
  mute, clip speed, preview speed, delete, transitions, an unsupported
  one): all right; rows 160–179 and 181–188, 15,340 micro-USD ($0.0153),
  ~656 input / ~140 output tokens, **a command now costs ~450–570
  micro-USD** (was ~355–434). Two calls were rate-limited (429, rows 154 and
  180: ~20 calls a minute is the limit; no cost). This feature's Gemini
  total: 63 calls, 28,536 micro-USD ($0.029).
- **Cutting the cost later:** most of a command's cost is its ~19 null
  fields in the output. Merging the per-action enums (corner, region, axis,
  aspect, property, target, font) into one field would drop about six of
  them (~25% of output) without making any optional. Not done here.

---

## 3p. Separate audio: the Audio lane

- **The slice** (user's choice, 2026-10-04): the core lane plus typed
  commands; no per-item fades or waveforms yet. Extracting refuses a clip
  that's sped up or has a re-recorded take (also the user's choice), so an
  extracted item is exactly the take's own sound under the clip.
- **Model** (`audio-lane.ts`): `AudioItem = { name, buffer (decoded),
pieces (source ranges played back to back), skipSeconds, seconds,
atSeconds (edited time), volume (0–2), muted }`, in the snapshot
  (`audioItems`): one undo step per change; reset clears it. An added file is
  one piece; an extracted clip is its kept pieces (cuts skipped), placed
  where the clip starts. Trimming the start skips more of the source and
  moves the start; trimming the end plays less; neither past what the
  source holds. Items may overlap; they're mixed.
- **Extracting** decodes the take's own sound once (as the analysis
  already does: ~23 MB a minute held while the lane uses it), adds the item
  and marks the clip `soundInLane`: its segments play muted through the
  clip-sound gain, its sound controls say "Its sound is in the Audio lane",
  and re-recording in it is blocked (`in_lane`). Undo puts it back.
- **Playback:** `playLane` starts each item's parts (`playingBetween`) as
  AudioBufferSources on the audio clock, for one _stretch_ at a time: a
  segment and any dissolving on from it (`stretchFrom`), i.e. what the
  export records without pausing. Export: scheduled as each stretch starts,
  stopped before the recorder pauses for a seek. Preview: started where
  playback is when a stretch begins, at the preview's speed (pitch shifts
  at 2×, as a take's does), stopped on pause or seek; none in the Original
  view. **Bug caught by the preview test:** the playback hook's effect
  re-runs every render, and restarting the lane there started every item
  anew every frame (dozens of starts a second, audible clicks); the lane is
  now kept across re-runs while the items, stretch and speed are the same.
- **Not here:** lane items don't follow clip moves (that's the point of
  taking a sound out); the transitions' fades and dips don't apply to the
  lane; captions still come from the video's transcript.
- **Commands:** `add_audio` (`startSeconds`, null: the playhead; the file
  picker opens on Apply), `extract_audio` (`fromClip`), `delete_audio`
  (`fromClip` as the track's number, null: the last added). Refusals: past
  the end, no such clip, sped / take / already out, no tracks, no such track.
- **Real Gemini, 2026-10-04 (approved with the feature):** "add music at
  0:05", "add a sound file here" (the playhead), "extract the audio of clip
  2", "detach the sound from the first clip", "delete the music" and "remove
  audio track 1" (both read as delete_audio; refused only because the lane
  was empty), and the regressions "fade out the last 2 seconds", "make clip
  2 play at 2x", "make it black and white", "add a fade between clips 1 and
  2", "delete clip 3", "add a sticker of a cat" (unsupported): all right.
  Rows 189–200, 12 calls, 6,898 micro-USD ($0.0069); ~716 input tokens,
  **a command now costs ~570–590 micro-USD**.

---

## 3q. Several videos in one project

- **The design** (told to the user first; no decision needed): the first
  video uploaded stays the main one. Added videos (`sources.ts`:
  `AddedVideo = { id, name, file, url, durationSeconds, width, height }`)
  and each one's trim (`sourceTrims`) are in the snapshot: adding a video is
  one undo step, undo takes it away, reset removes them all. Adding one
  appends a clip of its whole length after the others, with `source: id`
  (`Clip.source`, absent for the main video).
- **Clips of any video:** `playableSegments(…, sourceEdits)` plays an added
  video's clip with its own trim and none of the main video's cuts or takes;
  segments carry `source`. Split, reorder, speed, color, transitions,
  delete, duplicate and the Audio lane work per clip. A split divides the
  playing clip in its own video; a merge refuses clips of two videos (one
  clip is one video), by hand (Merge disabled) and as a command
  (`merge_videos`). Lookups by a source time (`playbackPosition`,
  `clipIndexAt`, `editedSecondsAt`) are within one video.
- **The main video's own:** transcript, captions, clean-up, filler cuts,
  re-recording and the audio checks. Transcribing an added video would cost
  a Deepgram call each, and its analysis more memory: left out.
- **Timeline:** shows the video the playhead is in, named; its trim handles
  trim that video. The typed "cut from 2 to 5" trims the main one only.
- **Preview:** each added video has its own <video> over the main one
  (`data-testid="added-player"`), shown only while it plays. The playback
  hook finds each clip's player (`elementFor`), switches players at a join
  between videos (the main one paused meanwhile, "away", which isn't
  stopping) and hands a dissolve across videos to the right players (the
  dissolve player loads the incoming clip's video). With more than one
  video, the editor's Play/Pause stands in for the player's own controls
  (they only play the main video). A clip's volume and fades route each
  player through its own gain. Preview pixelates read an added player's
  own pixels where it's fitted.
- **Another shape:** fitted whole into the main video's frame (`fitRect`,
  centred, black bars): `object-fit: contain` in the preview; in the export
  drawn into a frame-sized canvas first, so blurs and pixelates sample the
  fitted picture. Rotate, crop and annotations apply to that frame.
- **Export:** a player per video (and a second for a dissolve between two
  clips of one video), all opened before recording starts; each clip plays
  on its video's player; recording pauses across a switch as across any
  seek. The main video's player opens first: its picture is the frame.
- **Risks, as told:** memory (a decoder per added video in the preview,
  up to two per video in the export: fine for two or three on this laptop);
  the export is still real time; undo keeps an added video's file and URL
  alive (released when the main video is replaced or the editor closes).
- **Commands:** `add_video` (no fields; the file picker opens on Apply).
  **Real Gemini, 2026-10-04:** "add another video", "append a second video
  file at the end", "import another clip from my computer" (all add_video),
  and the regressions "add music at 0:05" (still add_audio), "extract the
  audio of clip 2", "merge clips 1 and 2", "make it black and white",
  "delete clip 2", "make clip 2 play at 2x", "add a sticker of a cat"
  (unsupported): all right. Rows 201–210, 10 calls, 5,776 micro-USD
  ($0.0058); ~732 input tokens, **~572–586 micro-USD a command**.
- **Left out:** transcripts and captions of added videos, a timeline of all
  videos at once, typed trims of added videos, removing a video other than
  by deleting its clips, undo or reset.

---

## 3r. Save and reopen projects

- **The user's choices (2026-10-04):** projects in this browser
  (IndexedDB), not Postgres (the editor has no accounts: a projects table
  would be open to anyone reaching the app, and media can't go through the
  server anyway, uploads being capped ~13 MB); source videos copied into the
  browser's storage on first save; the transcript saved with the project.
- **What's saved** (`projects.ts`): the name, the edit (the undo snapshot:
  trim, cuts, clips with their speed, sound, colour and transitions, takes,
  title, logo, captions on/off and style, annotations with pencil strokes,
  transform, colours, the Audio lane, added videos and their trims), the
  main video's transcript, and references to media. Media is kept apart,
  each file once, keyed by name, size and modification time: the videos
  and added audio files as their bytes. Takes are short and kept as their
  samples (structured clone of Float32Arrays). An extracted clip's sound is
  decoded again from its video on reopening. A schema version is kept: a
  project of another version is refused, not half-loaded.
- **Not saved:** the undo history (it holds a whole snapshot per step,
  sound buffers included; a reopened project starts with none, and reset
  still goes back to the original take); silences, loudness and audio flags
  (measured again locally, free); playback state.
- **Save, autosave:** Save writes the media not yet kept, then the record.
  Once saved, the project saves itself 1.5 s after any change to the edit
  (an effect on the snapshot's pieces; playback and the playhead don't
  count), writing the record only (media is already there). The browser is
  asked to keep the site's storage (`navigator.storage.persist`).
- **Reopening:** My projects (on the upload screen after a reload, and in
  the project panel) → Open: the video, its saved transcript (no Deepgram
  call; `useTakeAnalysis` takes it), the edit, no history. **A missing
  file** (the browser's storage cleared or evicted): the project doesn't
  open half-way; "Find the missing files" asks for each, takes one only if
  its name and size match, then opens.
- **Delete** asks first, then removes the project and any media no other
  project uses.
- **Commands:** `save_project` (`text`: the name; none keeps the current
  one, or the video's name the first time), `open_project` (`text`: the
  saved name, matched ignoring case, else the latest containing it); opening
  over changes never saved says they'll be lost. Refused: no projects, no
  such project.
- **Risks, as told:** browser storage can be cleared or evicted (asked to
  persist; a missing file is found again by hand); quota (the videos are
  copied: the browser's disk use grows by their size); older saved data
  (the version check).
- **Left out:** sharing or syncing between browsers or machines, saved undo
  history, exporting or importing a project file, anything on the server.
- **Real Gemini, 2026-10-04:** "save the project" (the current name),
  "save this as Holiday edit", "open my project holiday" (found "Holiday"),
  "load the interview project" (refused: none by that name), and the
  regressions "add another video", "add music at 0:05", "make it black and
  white", "export the video", "undo", "add a sticker of a cat"
  (unsupported): all right. Rows 211–220, 10 calls, 5,858 micro-USD
  ($0.0059); ~766 input tokens, **~579–593 micro-USD a command**.

---

## 3s. Motion graphics: entrances, exits, a lower third, a zoom

- **What's there** (`motion.ts`, `motion-panels.tsx`): an `Animation`
  (an `in` and an `out` `Motion`: none / fade / slide from or to a side /
  pop, 0.1–3 s) on the title and on each on-video text; one lower third
  (name, subtitle, start, duration, its own text style) that slides in from
  the left over 0.5 s and out the same way; one zoom (from, to, push in or
  pull out, 105–300 %). "None" everywhere is today's behaviour.
- **Timing on the edited timeline.** Everything here is timed in edited
  seconds, the same clock as captions and annotations: the preview's
  `editedNow` and the export's `editedSeconds()` (after cuts, clip speed
  and dissolve overlaps). So a sped-up clip, a cut or a dissolve changes
  which picture is under a lower third or a zoom, never when it shows; a
  zoom from 10 to 15 s is 5 s of the finished video whatever the clips do.
  An entrance and an exit each take at most half the item's time on
  screen, so a short item still arrives and leaves. The eases: ease-out
  cubic for fades and slides, ease-out-back (a small overshoot) for the
  pop, smoothstep for the zoom. A slide travels a whole frame width or
  height.
- **Where it applies.** The zoom scales the picture about the frame's
  centre after crop, rotation and flip (`zoomedMatrix` on the picture
  matrix in the export; a `scale()` wrapper in `PictureFrame` in the
  preview, which `toPicture` undoes so drawing lands where clicked).
  Annotations are pinned to the picture, so they zoom with it; the title,
  captions, the lower third and the logo sit on the frame and don't. The
  title's and texts' motion is applied around their own centre (canvas
  translate/scale with `globalAlpha`; `motionStyle` in the preview).
- **Edits:** each change (a panel field, a command) is one undo step;
  reset clears them (`isOriginalEdit` checks the lower third and the zoom;
  the title and texts go with their items); saved with projects (new
  snapshot fields, older saves read as none, same `PROJECT_VERSION`).
- **Commands:** `lower_third` (`text` "name, subtitle", split at the first
  comma or " - "; start defaults to the playhead, 4 s), `animate_in` /
  `animate_out` (`target` title or text, `effect`, `region` the side,
  `seconds`; the title by default; refused without one), `zoom_in` /
  `zoom_out` (start defaults to the playhead, 3 s; `percent` over 100 is
  the zoom, up to 100 how much more; none: 130 %). One new schema field,
  `effect`; the prompt grew by three lines (~90 input tokens).
- **Verified on real exports** (`e2e/motion.spec.ts`): a 320×180 grey
  video with a red 60 px square in the middle. A 200 % push-in from 2 to
  4 s: the square's measured width matches the eased zoom at 1, 3, 3.8 and
  5 s (1× outside) and stays centred; the same with a 1:1 crop and a 2×
  second clip (4.5 s export, zoom at edited 3.2–4.2 s). The title mid-way
  through a 1 s slide sits left of centre by the eased offset for that
  frame's time (within 8 px), is centred after, has fewer white pixels
  while fading, and is gone after its end. The lower third is absent before
  its start, short of its place by the eased offset late in its slide
  (within 5 px), at the lower left, absent after. Text popping in is seen
  faint and narrower (48 → 55 → 61 of 65 px) before it's whole. Checks
  read the frame's real time, so where export frames land doesn't matter.
- **Left out:** more than one lower third or zoom, a zoom toward a point
  other than the centre (Ken Burns pan), motion on captions or the logo,
  per-letter or path animations, keyframes.
- **Real Gemini, 2026-10-04:** "add a lower third saying Jane, CEO from 5
  to 10 seconds", "slide the title in from the left", "zoom in slowly from
  10 to 15 seconds" (130 %), "fade the title out", "make the title pop in
  over 1 second", "pull out from 150% between 2 and 6 seconds", and the
  regressions "fade out the last 2 seconds" (still a clip fade), "add a
  fade between clips 1 and 2" (still a transition), "add a title saying
  Hello", "zoom to 150%", "make the title red": all right. Rows 221–231,
  11 calls, 7,020 micro-USD ($0.0070); **~853–865 input tokens, ~626–651
  micro-USD a command** (was ~766 and ~579–593).

---

## 3t. The logo by hand

- **Asked (2026-10-04):** drag the logo anywhere and resize it by hand;
  PNG and JPG; a logo command still puts it in a corner by default; and
  captions at the bottom of the video, off by default. Checked first on a
  real recording (`Cap Recording - 26 September 2026.mp4`, 1080p, with a
  mocked transcript so no Deepgram call).
- **Already there:** captions off by default (`captionsOn: false`) and
  drawn 6% up from the bottom, centred, in the preview and the export;
  measured on the real video, the caption's bottom was 26 px above the
  video's in a 430 px player. The logo command with no corner gives
  bottom-right (`DEFAULT_CORNER`). Nothing changed for either.
- **Added:** `Watermark` gains `size` (its width as a fraction of the
  frame's; absent: 15%) and `at` (its top-left as fractions of the frame,
  once placed; absent: in its corner). `watermarkRect` reads them, so the
  export and the preview agree, and keeps a placed logo inside the frame
  even after a later crop. `logo.ts` holds the pure moves (move, resize by
  the corner keeping the shape, resize from the field, back to a corner)
  and the limits: 5–60% of the frame's width, never taller than the frame.
  `LogoBox` (`logo-box.tsx`) is a button over the logo on the Edited
  preview: drag it to move, drag its corner grip to resize, arrow keys
  move 1% (Shift: 5%), + and − resize by 1%. The preview follows the drag
  live (a draft, not an edit); letting go is one undo step, as is each key
  or a typed "Logo size (%)". A corner button (or the command) puts a
  placed logo back in that corner at its size; no corner shows pressed
  while it's placed by hand. Replacing the image keeps its size and place.
  JPG: `LOGO_TYPES` = PNG and JPEG, for the picker's `accept` and the check.
- **On the logo, the box takes the pointer:** an annotation can't be
  started on top of the logo. The logo sits on the frame, not the
  picture: it doesn't zoom with a push-in, as before.
- **Verified on the real video:** dragged from the corner to (0.225,
  0.233), resized to 30% wide; the 1920×1080 export's green logo measured
  (0.225, 0.233), 0.300 × 0.267 of the frame, the same as the preview.
  `e2e/logo.spec.ts` does the same on the synthetic video in CI.
- **Left out:** rotating the logo, its opacity, more than one logo, a
  logo for part of the video only.

---

## 3u. Redesign, stage 1: the website (2026-10-05)

- **Asked:** a polished, distinct site with one design system; dark and
  light mode switched in the top bar on every page (dark default,
  remembered); public pages (landing, how it works, features, contact,
  log in / sign up); after login a home page that starts a project from one
  box (type, attach, speak) and opens the editor once the video is in;
  saved projects as their own page; contact working locally. Stage 2 (the
  editor's layout) is next. **No feature's behaviour changed.**
- **The user's choices (2026-10-05):** accounts are **local Supabase
  Auth** (email + password, the Docker Supabase); contact messages go to
  **local Postgres** (`ContactMessage`, table `contact_messages`); real
  Deepgram calls for voice approved up to $0.05 (one made: $0.0003).
- **Design system:** DESIGN.md section 2. Graphite + electric lime (dark),
  off-white + deep lime (light); Geist / Space Grotesk / Geist Mono.
- **Theme:** `data-theme="light"` on `<html>`, set before paint by
  `THEME_SCRIPT` (`src/lib/theme.ts`) from `localStorage`; `ThemeToggle` is
  a `role="switch"` named "Light mode".
- **Pages:** `(site)/` route group (top bar + footer): `/`, `/how-it-works`,
  `/features`, `/contact`, `/login`. `(app)/` group: `/home`, `/projects`.
  The editor keeps its folder and gets its own `layout.tsx` (full-width
  top bar).
- **Auth:** `proxy.ts` sends a signed-out visitor from `/home`,
  `/projects`, `/editor` to `/login?next=…`, and a signed-in one from
  `/login` to `/home`. When Supabase isn't configured (CI) or can't be
  reached, nothing is guarded (it fails open, as the session refresh
  already did). `src/server/auth/session.ts` (`currentUser`,
  `authConfigured`); actions in `(site)/login/actions.ts` (sign in calls
  `provisionUser`, the template's convention). **The server actions
  themselves are not gated** (the AI ones included): pages are. Worth
  adding if this is ever hosted.
- **Home → editor:** `editor/projects/editor-start.ts` holds the picked file and the
  typed command in memory across the client-side navigation; the editor
  takes it once on mount and loads the file; `CommandBar`'s
  `initialCommand` asks it once the video is ready (one ask, guarded against
  development's double effects), and it still waits for Apply. A reload
  of the editor starts empty, as before.
- **Projects page:** `listProjects` as before; the picture is drawn in the
  browser from the stored main video (`projectVideo` in `projects.ts`), at
  1 s or half way; opening goes to `/editor?project=<id>`, which calls the
  editor's existing `openSaved`.
- **Voice:** `VoiceCommandButton` (records ≤ 30 s, 16 kHz mono WAV) →
  `transcribeVoiceCommand` (Deepgram nova-3, feature `voice_command`, its
  own `ai_usage` rows). Leaving the page mid-recording drops the recording
  instead of sending it. Verified with a synthesized spoken command fed as
  Chrome's fake mic: "Turn captions on and add a title that says welcome."
- **Contact:** `sendContactMessage` writes a row; verified against the
  local database. Its migration: CI generates it on the pull request
  (`docs/rules/migrations.md`), plus the hand-written ENABLE RLS one. Locally
  the table was created by hand first, for testing.
- **e2e:** `auth.setup.ts` signs a test user in (signing up the first time)
  and saves the session for every test (`e2e/.auth/`, ignored); with
  accounts off it saves an empty one. `site.spec.ts` (signed out),
  `home.spec.ts` (home → editor with a command; projects page). The
  editor-starts-empty test moved there from `editor.spec.ts`.
- **Checked in the browser:** every page, dark and light, at 1440 and 390
  px wide (screenshots); the light editor (its old layout) reads fine.
- **Known at the time:** `pnpm test` on this Windows machine failed 41
  `check-standards` self-tests and `check:standards` reported 17/24, as on
  `main`. Fixed since: see "Current totals" in section 2.

---

## 3v. Redesign, stage 2: the editor (2026-10-05)

- **Asked:** chat on the left (type, attach, speak; a reply with Apply
  changes / Cancel; nothing changes before Apply; Deepgram for voice); the
  video with the timeline in the middle, edited directly on the picture
  (drag, resize and rotate the logo and text, zoom and crop, the pencil);
  the tools on the right, a panel each with a heading, and a search; both
  sides can be hidden; a saved sign and progress for long jobs; keyboard
  shortcuts with a help list.
- **The user's choices (2026-10-05):** add **rotation** for the logo and
  on-video text; **aim the zoom** by dragging an area on the video (a zoom
  used to always centre on the frame); chat **attach routes by file type**
  (video → added, PNG/JPG → logo, audio → Audio lane).
- **New behaviour (only these):**
  - `Watermark.rotation` (degrees, clockwise): drawn about the logo's
    centre in the export (`drawFrameOverlays`) and the preview (CSS
    `rotate`). `LogoBox`: a handle above it (drag), `[` / `]` (1°, Shift
    15°), and a "Logo rotation (°)" field (`DegreesField`). Angles are
    measured in the frame's pixels (`angleTo`), so a wide frame doesn't
    skew them; a turned logo's corner resize is unturned first
    (`unturned`). A turned logo can pass the frame's edge and is cut off
    there (it isn't pushed back in).
  - Text annotations' `rotation`: in picture space, after the unmirroring
    scale, so on screen it turns as dragged whatever the flips; the band
    and the clip turn with it. Preview: `rotate(±θ)` on the item (−θ under
    one flip). A round handle at the top of the selected text, and "Text
    rotation (°)". Verified flipped: preview and export put the turned band
    in the same place (mean x 125.4 vs 125.5 px).
  - `Zoom.focus` (frame fractions): `zoomViewAt` gives the scale and a
    centre moving from the frame's to the focus as the zoom grows, which
    keeps the shown area inside the frame all the way (unit-tested);
    `clampFocus` moves an edge focus in. Export: `zoomedMatrix` takes the
    view. Preview: `scale(s) translate(…)` on the zoom layer (still starts
    `scale(`). Clicks map back with `unzoomedPoint`. "Set area on video"
    (Zoom panel) shows the whole frame with the area (`ZoomBox`): drag to
    aim, corner to zoom closer (area width = 1/amount); one undo step each.
- **Layout** (`editor-shell.tsx`): a three-column grid under the site's top
  bar, the page no longer scrolls; each column scrolls. The grid needs
  `lg:flex-none` (flex-1 overrode its height) and `grid-rows-[minmax(0,1fr)]`
  (else the row grows to the tallest column), and the scrolling columns are
  `relative`, or the visually hidden file inputs (absolute) stretch the
  page. Hidden columns stay mounted (`hidden`), so the chat history and
  half-typed fields survive. Open/closed is remembered per browser
  (`editor-layout-store.ts`, a `useSyncExternalStore` that reports "open"
  during hydration: reading storage in a state initializer caused a
  hydration mismatch that broke the grid).
- **Chat** (`command-bar.tsx`, still `CommandBar`): a message list. Only
  the latest answer is open (`role="status"`, "You asked…", Apply changes /
  Cancel); answered ones stay as a record without the status role or
  buttons ("Applied" / "Cancelled — nothing changed"). Enter sends,
  Shift+Enter is a new line. Attach and the voice button sit in the box.
- **Toolbar:** the file name, Edited/Original, then running jobs (loading
  video, reading the sound, transcribing), the saved badge (Saved / Saving…
  / Not saved / Save failed), Undo / Redo / Reset (`HistoryControls`, moved
  out of the clean-up bar; same names, same only-when-possible rule),
  shortcuts, add video, replace video, Export (primary; its progress now has
  a bar), and the column toggles.
- **Tools** (`tool-panels.tsx`): Project, Clean up, Transcript, Clip sound
  and speed, Audio, Picture, Zoom, Color, Transitions, Annotations,
  Graphics, each the existing panel; search matches the start of words in
  a panel's name and keywords (`messages: Editor.tools.keywords`).
- **Shortcuts:** Space (play/pause; not on a button), S (split at the
  playhead), Delete (the selected clips, else the one at the playhead;
  never all), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, `[` chat, `]` tools, `/`
  find a tool, `?` the list. Ignored while typing and when a focused control
  already used the key. Clip selection moved up into the editor
  (`ClipSelection`) for Delete.
- **Tests:** new `editor-layout.spec.ts` (chat record, search, hiding,
  shortcuts, saved badge), logo turned by typing/keys/handle and exported
  (attached through the chat), text turned and exported (and undone), zoom
  aimed and resized on the video and exported. Changed for the layout:
  two tests clicked an exact "Apply" (now "Apply changes"); the blur
  preview check is now relative to the same edge unblurred (the screenshot
  is downscaled less now that the player is ~575 px, not 768: 68–72 sharp,
  20.7 blurred; it was 56 and 10).
- **Checked in the browser:** the editor at 1440 and 1280 wide and on a
  phone (the columns stack), dark and light; a reply in the chat; the
  search narrowed; the shortcut list.

---

## 3w. Whole-app QA pass on main (2026-10-05)

A user's walk through everything, in Chromium driven by Playwright, with the
real recording `Cap.mp4` (1080p, 1:48) and real Deepgram and Gemini calls.

- **Tested and fine:** sign up (bad inputs refused, existing email told to
  log in), log in (wrong password told; `next` honoured), log out; Home,
  Projects and the editor (`?project=` too) send a signed-out visitor to
  log in; contact (blank refused; a real message reached
  `contact_messages`); every page dark and light at 1440 and 390 px, no
  horizontal scroll; Home voice (the spoken sentence came back word for
  word), typed command, attach → editor; the transcript (30 sentences, the
  "Transcribing…" pill meanwhile); Apply changes and Cancel; the tool search
  (crop, volume, logo, subtitles, fade, pencil, music, save, brightness,
  re-record, silence, zoom each found the right panel); hiding both sides
  (player 736 → 917 px); every shortcut; title, logo (attached in the chat,
  dragged, resized, turned), text drawn and turned by its handle, the
  pencil, an aimed zoom, a crop; split, dissolve, volume, speed;
  re-recording (sentences with no clean pause correctly offer "set it by
  ear"; one with pauses took a 3.4 s take for 3.5 s); clean-up; undo, redo,
  reset; save (0.6 s), reopen from Projects with everything the same and
  no new transcript call; export: 108.85 s for the 108.87 s source, "Export
  finished", the logo and the aimed zoom in the same place as the preview
  (mean difference 2.7–3.3 levels at 6.5 and 7.5 s). No console errors.
- **Fixed:**
  - The command brought from Home was answered, but the chat then showed a
    second "Reading your command…" forever and locked its box: development
    mounts twice, and the mutation hook's pending state stuck. The chat now
    keeps what it's reading in its own state (`command-bar.tsx`); one call
    still (the server saw one). Test: `home.spec.ts`.
  - On a phone the menu stayed open over the next page: the top bar stays
    mounted across pages. `MobileMenu` closes it when the page changes.
    Test: `site.spec.ts`.
  - Signed in, the footer still offered "Log in / Sign up" (which only
    bounced to Home); it offers "New project" then. Test: `home.spec.ts`.
  - Added a test that a transcript line seeks (it did; untested before).
- **Not changed (by decision):**
  - Leaving the editor with an unsaved edit gave no warning. Added since
    at the user's request: section 3x.
  - The chat keeps a cancelled command's text in its box (to edit and send
    again); applied ones clear it.
  - Projects are per browser (IndexedDB): another browser, or a new
    profile, has none. As built (section 3r).
  - With accounts on and Supabase down, nobody can log in and the app pages
    need one: correct, but a stopped Docker means a locked-out local app.
- **Cost:** ~8 transcripts of the 1:48 recording (each script run that
  loaded it) ≈ $0.06, plus ~5 Gemini calls ≈ $0.003: over the few cents
  asked. Only the first run needed a real transcript; the rest should have
  been mocked.

---

## 3x. "Leave without saving?" and a reused transcript (2026-10-05)

- **Asked:** warn when leaving the editor with unsaved edits, including the
  browser's own prompt on closing the tab; and in future test scripts,
  reuse one saved transcript instead of paying for a new one each run.
- **Unsaved** means the undo history isn't the one last saved (or loaded):
  every edit, undo and redo makes a new history object, `savedHistory`
  is set when a video loads (with its fresh history) and to the history a
  save held when it succeeds. Not the save status: autosave runs 1.5 s
  after a change, so "Saved" can show while the newest change isn't. Undo
  back to the saved state still counts as unsaved (it's a new history):
  asked once too often, never too seldom.
- **`LeaveGuard`** (`leave-guard.tsx`), only while unsaved: `beforeunload`
  (the browser's prompt on closing, reloading or typing another address),
  and a capture-phase click listener on the document that stops any
  same-site link out of the editor before the client-side navigation starts
  and shows "Leave without saving?" (Stay / Leave without saving).
- **Not caught:** the browser's Back button inside the app (client-side, no
  `beforeunload`, and Next has no way to cancel it), and Sign out (a button
  that navigates after its action). Listed, not changed.
- **Transcript cache** (`e2e/transcript-cache.ts`, `reuseTranscript(page)`):
  answers the editor's transcript request from a file keyed by the audio's
  hash; a recording not seen before makes the real call once and its
  transcript is kept (`RETAKE_TRANSCRIPT_CACHE`, else the temp folder:
  outside the repo, as it's the recording's words). Spoken commands never
  match. Tested with a stand-in for the paid call.
- **Full suite:** 85/89 passed; `site.spec.ts:6` (a page's first compile
  past 30 s), `motion.spec.ts:222`, `multi-video.spec.ts:195`,
  `re-record-by-ear.spec.ts:26` failed under load (1.6 GB free) and passed
  alone (5/5). None navigates away from an edit.

---

## 3y. Clearer Home and editor; projects you can manage (2026-10-05)

- **Asked:** Home and the editor clear to a first-time user at once, with
  real design effort; no feature's behaviour changed, only layout, grouping
  and wording; plus rename, delete (confirmed) and download on Projects.
- **Home:** two choices side by side, each an icon, a title and a line:
  "Edit with AI" (an optional first command, voice, the example commands)
  and "Edit by hand" (four tiles of what's in front). Both "Upload & edit",
  or take a video dropped on the card. By hand sets the remembered columns
  (`setSideOpen`): chat hidden, tools shown. The by-hand input is labelled
  "Video to edit by hand" (the AI one keeps "Choose a video file").
- **Editor, top:** the project's name in the toolbar, an input that reads
  as a title (`ProjectTitle`), with Save beside it until first saved, then
  the saved badge. Enter on a new project saves it under that name; a saved
  project renamed (Enter or leaving the field) is saved under the new name.
  The Project panel lost its name field, Save and toggle: it's the Project
  tab (status line, My projects always shown). Export's visible text is
  "Export" (still named "Export video"). The toolbar is one row from 1400 px.
- **Editor, right:** tabs (`ToolPanels`): a vertical rail, icon and label
  each: AI & Clean up (clean-up, and "Ask in the chat" with examples and
  Open the chat when it's hidden), Picture (crop/rotate, zoom, colour),
  Sound (clip sound and speed, audio lane), Graphics (title, captions, logo,
  lower third; then annotations), Transitions, Transcript, Project. Each
  tab: a heading and one line, then its panels. The search looks across all
  tabs and labels each result with its tab. Every panel stays mounted.
  Long explanations fold behind "How this works" (`MoreInfo`); state notes
  (the Original view, "Add a zoom first") stay visible.
- **Chat, empty:** a heading, how it works, four examples with icons, a
  voice tip; the conversation takes the space once it starts.
- **Clean-up while reading:** "Still reading the recording…" instead of
  "Nothing flagged" until the transcript is in.
- **Projects page:** each card: open (picture or name), rename in place
  (Enter keeps, Escape cancels; `renameProject` changes only the name),
  download its video (the saved original: a project stores the video and
  its edit, and the edit itself comes out through Export), delete after a
  "Delete …?" dialog (Keep it / Delete project).
- **Theme script:** tried `next/script` (beforeInteractive) to silence
  React's dev warning about a `<script>` in a component; measured with
  Next's JS delayed 3 s, a light-mode page was still dark at
  DOMContentLoaded. Kept the plain `<script>` (light at once), with a note.
- **Tests:** `openTool(page, panel)` (`editor-helpers.ts`) opens the tab
  holding a panel, as a user would; it waits for the tabs (or an empty
  editor, which has none). A codemod inserted it before each use of a
  tabbed panel, then hand fixes. Tests save through the name at the top.
  New: by-hand start, renaming at the top, Projects rename / download /
  delete.
- **Cost:** one Deepgram transcript of `Cap.mp4` (~$0.008), then every
  screenshot run used the saved copy (`reuseTranscript`: 0 paid calls).

## 3z. Editor rebuilt to the PDF design reference, stage 1 (2026-10-06)

- **Asked:** rebuild the editor's structure and interactions to match the
  owner's PDF (`Retake.pdf`, editor pages 8–12): our colours and fonts, not
  its palette; no feature lost or changed; nothing in the PDF that needs a
  new feature. Stage 1: the layout, the add-and-edit-on-video flow for
  Title, Text, Logo and Annotations, the split fix, the Original view made
  view-only, and the keyboard shortcuts help removed.
- **Layout** (`editor-shell.tsx`): the editor is the whole window, its own
  top bar instead of the site's: back to Home, the name and saved status,
  undo / redo (always there, greyed out when there's nothing) and reset,
  Before / After (Edited | Original), the theme, Hide panels, Export.
  Hide panels folds both sides away; a "Show tools and chat" button brings
  them back; remembered (`editor-layout-store`, now one `panels` flag).
- **Tool rail** (`tool-rail.tsx`, replaces `tool-panels.tsx`): Project at
  the top, then FIX (Clean up), ADD (Captions, Text & logo, Annotate, Audio,
  Videos), ADJUST (Frame: crop/rotate/flip and zoom; Colour; Speed & fades:
  each clip's speed, volume, fades; Transitions). A tool opens its panel
  with a heading, one line of help and a search across every tool; clicked
  again it folds away. Every panel stays mounted. In the Original view the
  panels are a disabled fieldset with a note saying why.
- **Right column** (`side-tabs.tsx`): Assistant (the chat) and Transcript
  (sentence count on the tab). A start from "Edit by hand" opens on the
  Transcript; "Edit with AI" on the Assistant.
- **Over the video:** a small bar (Select, Draw, Crop). Nothing is a form
  that seems to do nothing: Title, Text, Logo, Box, Blur and Pixelate each
  go on the video at once, at the playhead, picked, with handles; listed in
  "On this video"; on the Text lane; with "Drag it on the video to move it.
  Drag a corner to resize." Picking one shows a floating bar: Replace (a
  logo's file; a title's or text's words), Timing (from / to), Delete.
  The picked item's words and size are in its panel; everything else
  (timing fields, style, motion, the lower third, the logo's corner and
  rotation, the drawing tools, colours, each item's timing lane) is under
  "More options", unchanged.
- **The title can be moved** (`title-box.tsx`): a new optional `at` (its
  centre, fractions of the frame) on `TitleCard`; absent, it's centred as
  before, so old projects and the title command are unchanged. Its band
  follows it up or down; the export draws it at the same place. Resizing
  is its existing text size. This is the one model change in stage 1: the
  PDF asks for handles on the title, and the title had no position.
- **Picking on the video:** with no tool out, the annotation layer picks
  by click (`quiet`: items outlined only under the pointer, so the picture
  looks as it exports); the title and the logo pick themselves. The logo
  box gained `selected` / `onSelect`.
- **Timeline** (`editor-timeline.tsx`, replaces `timeline.tsx` and the clip
  strip): one timeline in the edited video's time: Split, Merge, Duplicate,
  Delete, a zoom slider, a ruler to scrub; lanes for Video (the clips
  themselves, as wide as they play: Split cuts the clip right where it is,
  no second strip under a full-length one), Text (title, lower third,
  annotations, logo, captions; click to pick) and Audio (the lane's items,
  "Add music or audio"). Silence, filler and audio-problem flags sit on the
  ruler where they play (left off where cut). The trim handles sit on the
  trimmed video's edges; dragged past the end they untrim. The Original
  view shows the untouched take, view only. The player has its own bar:
  time, Play / Pause, preview speed (the browser's controls are gone).
- **Original view:** the video plays, nothing edits: tools, timeline
  buttons, the chat, re-record, undo and redo are off, and a line says
  "Original — view only… Switch to Edited to make changes." with a button.
- **Keyboard:** the shortcuts list and the single keys (Space, S, Delete,
  [, ], /, ?) are gone; Ctrl/⌘+Z and Ctrl/⌘+Shift+Z / Ctrl+Y remain (not in
  the Original view). A focused clip still takes Delete and Alt+arrows, as
  its own control's keys.
- **Tests:** `openTool` maps old panel names to their new homes (rail tool,
  More options, or a right tab). `seekTo(page, s)` still means a moment of
  the main video's own recording: the scrubber carries what plays
  (`data-segments`) and the helper clicks where that moment plays in the
  edit. Tests that typed into the chat open the Assistant tab first. Undo
  "not there" became "disabled". Layout spec rewritten for the rail, Hide
  panels and the keys.
- **Skipped from the PDF (each needs a new feature):** Google sign-in and
  sign-up, Forgot password; the assistant's step-by-step progress checklist
  and Stop, and the "working on your request 64%" bar over the video; the
  canvas zoom (− 100% +) on the video bar; the Before / After wipe slider
  (we keep the Edited / Original switch); waveforms drawn in the clips;
  the player's volume, fullscreen and CC buttons; proposed AI cuts marked
  on the timeline before Apply. Pages other than the editor (site, log in,
  Home, Projects) weren't asked for.

**Stage 2: the remaining tools** (same day):

- **Clean up** (`cleanup-bar.tsx`, now `CleanupPanel`): the preview is up
  front, not behind a first click: how many long silences and filler words,
  "Saves about N seconds", the length before and after (left off when both
  round to the same), and one button, "Remove silences and filler words",
  that does it; Undo puts them back. Filler words with no clear pause stay
  flagged for a hand cut, as before.
- **Transcript** (`transcript-panel.tsx`): the checks' flags in place:
  filler words highlighted in their sentence (outlined when they need a
  hand cut), a "2.4 s pause" chip after the sentence a long silence
  follows, and "Background noise / Quiet speech / Distorted at 0:12" under
  the sentence a problem is in; pauses and problems jump there. Chips at
  the top count each kind (Filler words, Pauses, Bad audio) and show only
  the sentences with it. Re-record stays on each sentence, with the
  automatic splice and "Set the join by ear" unchanged.
- **Captions:** on/off up front, the style under More options.
- **Speed & fades:** a card per clip (name and Mute, volume, then fade in,
  fade out and speed in one row) to fit the panel. **Transitions:** says
  how to get a join when there's only one clip, instead of nothing.
  Section headings that repeated the panel's own title are for screen
  readers only (Colour, Audio, Transitions, Speed & fades).
- **Flaky under full local load** (passed alone, one worker): the two
  re-record specs (the fake mic sometimes delivered silence: "No speech was
  heard"), the contact form on a cold compile, a projects reload export.
  Recorded in 4c.

## 3za. A calmer site and editor (2026-10-06)

- **Header:** signed out, only Retake, How it works, Features, Contact us
  and Sign in (no theme switch); signed in, only New project, Projects, the
  theme switch and Sign out.
- **Landing page:** a new hero, How it works (four steps), Features (asking
  for edits, the timeline, motion graphics, re-recording a sentence), the
  contact form, and Frequently asked questions (seven `<details>` rows: a
  click opens the answer, another closes it). The How it works and Features
  pages render the same sections (`components/site/landing-sections.tsx`).
  Every claim is about something the app does.
- **Contact us:** Email and Message only. `ContactMessage.name` is now
  optional (older messages keep theirs); CI generates the migration.
- **Editor:** one panel on the left. The Assistant and the Transcript are
  tools on its rail with the others (the Assistant open to begin with,
  "Edit by hand" opening on the Transcript); the right column is gone. One
  tool is always open; the panel hides and shows only from a small icon on
  the left edge ("Hide the tool panel"), remembered as before. Hide panels,
  Show tools and chat and the panel's close button are gone. Inside the
  panel, labels, legends, sub-headings, buttons and fields are a size
  smaller and quieter, help lines are one short sentence, and the outer
  cards around each tool's fields are gone. The chat's empty state lost its
  icon and heading (the panel already names it).
- **Tests run:** site, home, editor-layout, annotations, the typed-command
  and chat tests, and the transcript and re-record tests. `openTool` shows
  the panel first if it's hidden; tests that read a tool's fields after a
  typed command open that tool first (it shares the panel with the chat).

## 3zb. Site pages on their own; a fuller landing page (2026-10-06)

- **Header:** the theme switch is back for signed-out visitors (Retake, How
  it works, Features, Contact us, theme switch, Sign in); signed in: New
  project, Projects, theme switch, Sign out.
- **Own pages:** How it works (six steps in full, and what leaves your
  computer), Features (four parts, each with its list of real features) and
  Contact us (Email and Message) are each their own page; nothing in the
  header or the hero scrolls the landing page any more.
- **Landing page:** the hero; How it works and Features in short, each
  linking to its page (`HowItWorksSummary`, `FeaturesSummary` in
  `components/site/landing-sections.tsx`, beside the `…Full` versions the
  pages use); a drawn demo of re-recording one sentence (`retake-demo.tsx`,
  decorative); who it's for; a Start a project block; the FAQ. The contact
  form is only on its page now.
- **Tests run:** site and home.

## 3zc. Repo clean-up (2026-10-06)

- **Removed, unused here:**
  - the entry points and folders for other agents (`GEMINI.md`, `QWEN.md`,
    `.cursor/`, `.codex/`, the empty `.codex-logs/`), which the standards
    check marks optional; this repo uses Claude Code only;
  - the `e2e-build` skill, which needs Codex;
  - nine compiled Python caches committed in `skill-creator` (now ignored);
  - two dead editor exports (`isStill`, `TITLE_BAND_COLOR`) and thirteen icon
    wrappers nothing used.
- `check-standards.test.mjs` now writes those optional files into its own
  fixture instead of copying them from the repo, so their checks stay
  covered. AGENTS.md and CLAUDE.md no longer list the removed files.
- **Kept, though unused by Retake, because the template's rules describe
  them:** the admin RBAC console and feature flags (with their tables), the
  example Prisma model, the analytics helpers, `ErrorBoundary`, `Card` and
  `Badge`, the route factory, Sentry and PostHog wiring and their skills.

## 3zd. Highlights: the best moments, to watch and download (2026-10-07)

- **Find highlights**, a tool in the left panel (group with Assistant and
  Transcript), opens a pop-up with 3 to 5 cards. Each card has a title, a
  one-line description, its times, and a small muted preview that plays
  the moment while pointed at. Picking a card plays that moment in the
  pop-up and stops at its end.
- **Download** on each card records just that moment of the original
  video with the existing export (`useVideoExport`), with none of the
  edit's text, graphics, colour or sound changes; the file is
  `<name>-highlight-<n>.webm`. "Crop to vertical (9:16)" crops the
  downloads only (a centred 9:16 crop). One download at a time, since
  each plays through in real time. Close, or Escape, shuts it; there is no
  Apply, and the edit and timeline are never touched.
- **How moments are chosen:** `findHighlights` (actions.ts) sends the
  transcript's sentences, numbered with their times, to Gemini
  (`gemini-3.5-flash-lite`, `feature: 'find_highlights'`, so each call is a
  costed `ai_usage` row through `generateContent`). Gemini answers with
  sentence numbers only; `planHighlights` (highlights.ts) turns them into
  times from the transcript, so a moment always starts on a sentence's
  first word and ends on its last, padded up to 0.15 s into the pause,
  never into a neighbouring word. Invalid or overlapping picks are dropped,
  at most 5 kept, in playing order. The result is cached for the session
  (TanStack Query), so reopening the pop-up doesn't pay again.
- **No transcript, no guess:** over 5 minutes, no sound, a failed or empty
  transcript, or one still being written each get their own message, and
  no AI call is made.
- **Assistant:** "find the best moments" (`find_highlights`) opens the
  pop-up after the usual confirm.
- **Site copy:** a Features point for highlights, and the privacy notes
  (How it works, FAQ) now say the transcript text goes to Gemini when you
  find highlights.
- **Tests:** unit tests for the planning (`highlights.test.mts`); e2e
  `highlights.spec.ts` with a canned transcript and canned Gemini picks via
  `mockActions` (no paid calls): card order and times, playback stopping at
  the end, the downloaded files' length, picture (the test square at its
  ~0.95 s place) and 9:16 size, the timeline unchanged after Close, no
  second request on reopening, the Assistant command, and the no-sound
  message. The prompt itself was not tried against real Gemini (zero API
  cost rule); the reply is schema-checked and a bad one shows "No clear
  highlights were found".

## 3ze. Make it, part 1: a whole edit from one request (2026-10-07)

- **Asked:** a Make it page and a Home card ("Make it with AI"). Upload a
  video, type or say a request ("make this an Instagram reel", "make it
  funny", "make it professional", "make this an ad"); Retake plans the whole
  edit, guesses what's missing, asks 1 to 3 short questions first only when
  the request is unclear, and shows the plan with Apply / Cancel. Apply
  builds it in the normal editor (undo, redo, save and export as usual).
  Edit mode only (the user's footage). **Not in part 1:** create from
  scratch, follow-up requests, the second plan check.
- **Flow** (`(app)/make/`): `make-it.tsx` reads the file (`probeVideo`; up to
  5 minutes), runs the editor's own `useTakeAnalysis` (Deepgram transcript,
  filler cuts with clean gaps), takes a 256 px JPEG every 2 s (`frames.ts`,
  from the middle of each 2 s stretch), then calls `planMakeIt`
  (`actions.ts`). Pictures are sent in every case. The plan is a TanStack
  query keyed by the video, the request and any answers, so the same request
  isn't paid for twice.
- **The AI call:** `planMakeIt` → `generateContent` with `feature: 'make_it'`
  on `gemini-3.5-flash-lite` (already registered), so each call is a costed
  `ai_usage` row. The reply is structured JSON (`MAKE_REPLY_JSON_SCHEMA`):
  questions, style, a one-line summary, whether the picture matters, sentence
  numbers to drop and to zoom on, dead stretches (only when the picture
  matters), captions mode, transition kind, vertical, face positions per
  picture (0–1000 grid), a music file name from the folder's list, an
  optional title, and what it can't do. With answers given, questions are
  ignored. A meeting, call, slides or screen recording is judged by its
  speech only (no zooms, no faces, no dead stretches): the prompt says so,
  and `pictureMatters: false` plans from the sentences.
- **Planning** (`make-plan.ts`, `planMake`, pure and unit-tested): the model
  names only sentence numbers, picture numbers and choices from fixed lists;
  times come from the transcript. A talking video keeps its kept sentences
  with 0.25 s of room (from the pause only), joined across pauses up to
  0.8 s; a video whose picture matters keeps everything but dropped
  sentences and dead stretches, a stretch never cutting into a kept
  sentence. Each kept piece is a clip; fillers with clean gaps are cuts; a
  fade or dissolve goes only where at least 1.5 s was taken out. Zooms are
  push-ins over the named sentences (in edited time, never overlapping, at
  most 6; 1.12× professional to 1.4× funny). Removing every sentence
  removes none. The result is one `EditSnapshot`.
- **Never invents names:** the title is the only text Make it writes on
  screen (captions are the transcript). `inventedNames` drops a title with a
  capitalised word mid-sentence, or an @/# handle, that was never said nor in
  the request, and the plan says "Left out a title that named someone…".
  What can't be done is listed under "What Retake can't do here".
- **New in the editor** (each kept through save, undo and reset):
  - Captions **word by word** (`captionWords` in the snapshot,
    `editedCaptions(..., true)`): one word at a time, held to the next unless
    a pause over 0.7 s comes first. A "Word by word" box in Captions.
  - **Several zooms**: `autoZooms` in the snapshot beside the hand-set
    `zoom`; `zoomsViewAt` shows whichever is under way (preview and export).
    Not on the timeline or editable one by one yet: Undo/Reset take them away.
  - **A crop that follows a face**: `Crop.follow` keys (the crop's left edge
    at seconds of the main video), eased between keys (`transformAt`), in the
    preview (at the playhead) and the export (per frame, from the main
    video's own time). The face may drift a fifth of the crop's width before
    the crop moves; a run at one place keeps only its ends, so it pans
    between them. No face in any picture: a centred 9:16 crop. Turning the
    picture or setting the crop by hand drops the follow. An already-vertical
    video isn't cropped.
  - **Ducked music**: an Audio lane item with `duck: true` goes down to a
    quarter (about −12 dB) under speech, ramping over 0.3 s (`duckingPoints`,
    `speechSpans` from the words in edited time), in the preview and the
    export. Make it lays the track at 35%, repeated to fill the edit.
- **Music:** `public/music/` with `LICENSES.md` (free-licence only: CC0,
  Pixabay, CC BY with credit). It holds no tracks yet: Gemini is told "Music
  files: none", the plan says "No music: there are no tracks in public/music
  yet", and nothing fails. Files are listed server-side (`readdir`), named
  for their mood, fetched from `/music/<name>` and decoded in the browser.
- **Apply:** `handOffStart` now carries the transcript and the edit; the
  editor loads the file with that transcript (no second Deepgram call) and
  sets the history to one step after the untouched video, so one Undo takes
  the whole plan away and Redo brings it back.
- **Privacy copy:** How it works and the FAQ say Make it sends the
  transcript and small pictures (one every 2 s) to Gemini; the video file
  itself is never uploaded. The Make it page says so while it works.
- **Tests:** unit tests for planning (`make-plan.test.mts`: kept ranges both
  ways, face follow, invented names, a whole plan, no speech / no faces / no
  music, already vertical, the reply schema), word captions, ducking, the
  following crop, several zooms, reset. e2e `make-it.spec.ts` with a canned
  transcript and canned Gemini replies (no paid calls): Home's card; a reel
  planned (the request carried the transcript and 3 pictures for 6 s), the
  plan's lines, Apply → two clips, word captions on, no second transcript
  request, the export 102×180 with the crop following the square (mutation:
  without the follow the square is out of the frame at 3 s), one Undo back
  to one clip and Redo; questions then a plan, the dropped title and the
  "can't do" line, Cancel keeps the request; music measured in the export
  (660 Hz 0.35 in the pause, under 0.15 under speech; mutation without
  ducking: 0.348 under speech).
- **Real footage, no paid call:** `Cap.mp4` (1:48, 1080p) with its cached
  transcript and a canned reply (3 sentences dropped, 3 zooms, word
  captions, vertical, a title, a 660 Hz "track"): 55 pictures sent (396 KB
  request); plan 1:48 → 1:40; the export 608×1080, 100.52 s for a 100.46 s
  edit; the title and single-word captions in its frames, the zoom visible;
  music 0.07–0.10 under speech (0.0875 due) and 0.349 in a pause (0.35 due).
  (Reading frames by seeking a 100 s recorder WebM returned the first frame
  every time; playing it and grabbing frames on the way worked.)
- **Fixed before merge (2026-10-07): "Minified React error #441".** The
  owner's 6 October recording (production build) failed after the
  transcript with that message. In the server log (production, reproduced
  with the real upload): "Maximum array nesting exceeded. Large nested
  arrays can be dangerous." Decoding a server action's arguments, React
  counts every character of the strings inside an array against a limit of
  1,000,000 and rejects the request before the action runs (a 500, which
  production shows as #441). The pictures went as an array of base64
  strings: `Cap.mp4`'s dark, flat screens came to 393 KB, the 6 October
  recording's busier ones to 1.19 MB. Now they go as one string separated by
  spaces (`FRAME_SEPARATOR`), split and checked on the server, as the
  transcript's audio already did. That recording now gets a plan (1.19 MB,
  200).
  - **Why the tests missed it:** the e2e mock replaced the whole plan request
    with `[{frames: []}]` before it reached the server, so React never
    decoded real pictures there; the test videos are 6 s synthetic clips (3
    tiny pictures), and the real-footage check used the same mock on a
    recording far under the limit. The mock now sends the real request,
    pictures whole, with only the request's text emptied (validation stops
    it before any AI call). A new test records 70 s of square noise in the
    page, picks it in the real file input (a `DataTransfer`, as the file is
    too big to pass back and forth), and checks the 35 pictures (over
    1,000,000 characters) reach the server and come back as a plan. Run
    against the old build it fails with exactly the owner's message; it adds
    about two minutes to one CI shard.
  - **Reproduced at no cost:** the production server ran with a preloaded
    fetch stub (scratchpad `fake-ai.mjs`, `NODE_OPTIONS=--import`) answering
    Deepgram and Gemini with fake replies, so the whole real path ran with no
    paid call.
  - **Errors on the page are plain words now:** a failed transcript, pictures
    or plan shows "Retake couldn't write the transcript… / plan the edit just
    now. Go back and try again in a moment."; only a busy AI's own message
    (written for people) is shown as it is. A plan request that throws is
    reported with `captureClientError`. Tested: a plan request answered with
    a 500 shows the plain message and nothing of the error.
- **Three fixes before merge (2026-10-07), the owner's:**
  - **Short-form is under a minute, in code.** A reel, TikTok or Short
    (Gemini's new `format`, or the request's own words: `isShortForm`) must
    come out under 60 s; `planMake` holds it to 59 (the export can run a
    few hundredths over). When the plan runs longer, sentences go in
    `dropOrder`: those not among the reply's `keyMoments` first, the
    longest first (fewest jumps), then key moments from the least
    important, never the last one; if one sentence or a stretch with no
    speech is still too long, only its first 59 s are kept
    (`firstSeconds`). Filler cuts and dissolves only shorten it. Short-form
    is always vertical. On `Cap.mp4` (1:48) with its cached transcript and
    a canned reply: 58.6 s, 19 of 30 sentences.
  - **Vertical never cuts the picture off.** A crop follows a face only when
    Gemini's new `subject` is `one_person` and a face was found; a screen
    recording, meeting, slides or anything else keeps the whole picture,
    fitted inside 9:16 with black bars above and below: `Crop.fit` and
    `fittedCrop` (a crop rect reaching past the frame, which the preview's
    black frame and the export's black canvas already show as bars; turning
    the picture refits it). The export's canvas is never longer than the
    picture's longest side (`exportSize`), so 1920×1080 fitted is recorded
    at 1080×1920, not 1920×3413; ordinary crops are unchanged. The cap is
    the turned frame's longest side, not the picture's: measured against
    the picture first, a 15° turn (356×256 for 320×180) was shrunk to
    320×230, which CI's `transform.spec.ts:299` caught (fixed the same day).
  - **The plan says what it's making.** Its heading is "An Instagram Reel,
    about 45 seconds" (TikTok, YouTube Short, or the style: a professional
    edit, a funny edit, an ad), from the final length; then Gemini's
    summary, now asked to say how the footage was shortened; then
    "Shortened from 1:48 to 0:59", "Kept 19 of 30 sentences…", filler words
    cut, and "Under 60 seconds…" or "Cut further to stay under 60 seconds,
    keeping the key moments".
  - **Tests:** unit (the limit on a 140 s talk with key moments kept, one
    100 s sentence cut to 59 s, no limit for a professional edit, short-form
    detection, a screen recording fitted with bars and its 1080×1920
    export size, a fitted crop refitted after a turn). e2e: the busy 70 s
    video's reel comes out under 60 s in the plan and the editor; a screen
    recording's export is 180×320 with black rows above and below, the
    picture's own background at both side edges and the whole square in.
    Privacy text unchanged: nothing new is sent.
- **Not tried against real Gemini** (zero API cost rule): the prompt, the
  face positions it gives and the questions it asks are untested on the
  real model. A reply that doesn't fit the schema shows "Retake couldn't
  make a plan from that". Expected cost: ~260 tokens a picture, so a
  5-minute video is ~40k input tokens a plan, well under a cent on
  Flash-Lite.

## 3zf. Make it, part 2: quality (2026-10-07)

- **Asked:** the edit Make it builds should look polished: kinetic text in
  the request's style, better captions, a couple more transitions used
  sparingly, better moments for short videos (50–59 s, complete thoughts,
  opening with the strongest line), a second cheap Gemini check of the plan
  against the request, and a face followed only when one person clearly is
  the subject. **Not in part 2:** create from scratch, follow-up requests.
- **Kinetic text, in the editor for everyone:** a new motion, **word by
  word** (`MOTIONS`, `MotionState.reveal`, `revealedWords`): each word fades
  and rises in, one after another, then the text is at rest. Title and
  on-video text, in the preview (`RevealText`, word spans) and the export
  (`drawText`, word by word with each one's opacity and rise); in the
  Animation fields and as a typed command ("animate the title in word by
  word"). The export draws every title card through one `drawTitle`, so
  Make it's **key lines** (`autoTitles` in the snapshot: more titles, each
  in its own time) look and move exactly like the title. Key lines show on
  the Text lane (a click goes there; undo/reset change them).
- **Make it's text, by style** (`TEXT_STYLE`, `TEXT_MOTION`): reel bold and
  quick (word by word in 0.6 s), professional calm (serif, a slow fade),
  funny playful (yellow, pops), ad punchy (slides in). The title sits above
  the captions (0.4 of the frame), near the top of a vertical one (0.18);
  key lines near the top, after the title, never two at once, each only
  words quoted from its sentence (`quotedLine`, at most 8 words; anything
  else is dropped, as invented names are).
- **Captions:** `captionMode` (replacing part 1's `captionWords`; old
  projects map over) is lines, one word at a time, or **highlight** (the
  lines, with the word being said in yellow, white on yellow text:
  `Caption.spoken`, `spokenWordAt`, `highlightColor`), in the preview and
  the export; a "Caption style" select in Captions. Gemini picks a look
  (`CAPTION_LOOKS`: classic, bold_words, highlight, large, off), which maps
  to a mode and a size. Captions stay at the bottom.
- **Transitions:** a **slide** (`TRANSITION_KINDS`): the next clip comes in
  whole from the right over the last one, overlapping like a dissolve
  (`overlapsClips` replaces every "is it a dissolve" check: the two-player
  preview, the export's decks, the length, the crossfaded sound); drawn
  with `slideOffset` (preview: the second player's `translateX`; export:
  `FrameMix.incomingShift`). Also in the Transitions panel. A **zoom cut**
  is no new kind: a 0.4 s pull-out from 1.15× at the join (`autoZooms`).
  Make it puts a transition only at the three joins where the most was cut
  (or where the order jumps), whatever the reply asks.
- **Moments:** the reply now names `moments` (complete thoughts, first and
  last sentence, best first) instead of key sentences. A short-form edit
  over a minute is built from them (`chooseSentences`): whole moments in
  order of strength, then single sentences, each only if it still fits
  under 59 s, until it reaches 50 s. Dead sentences never; a moment never
  half. It **opens with the strongest moment**, cut out of the stretch it's
  in at its pauses (`around`) and moved first; the plan says "Opens with
  its strongest line: …".
- **The second check** (`checkMakePlan`, `feature: 'make_it_check'`,
  Flash-Lite, text only, so a fraction of the plan's cost): after the plan
  is made, `describePlan` gives it what's made, how long, the sentences in
  play order (marked when cut short), the title, key lines, captions and
  transitions; it answers problems and corrected text, captions,
  transitions and sentences to drop. With a problem, `applyCheck` patches
  the reply and the plan is made again (the code's rules still hold: length,
  quotes, names). The plan says "Checked against your request: nothing to
  fix", or lists what was fixed, or, when the check can't run, "this is the
  plan as first made" (never a failure). Both calls write `ai_usage` rows.
- **Vertical:** a crop follows a face only when the subject is one person
  **and** a face is in at least half the pictures; anything else (a meeting
  grid, a screen) keeps the whole picture with black bars (part 1's fit).
- **Features page:** Make it under "Edit by asking"; word-by-word titles,
  caption styles and slides under motion graphics.
- **Tests:** unit (word reveal; highlighted captions; slide overlap,
  offset and sound; caption modes and key lines as edits to reset; the
  50–59 s fill, whole moments, the opener cut out of one long stretch;
  quoted key lines; sparing transitions, slide and zoom cut; the face rule;
  `describePlan` and `applyCheck`). e2e: a slide on a real export (red on
  the left, whole blue on the right a third of the way through, not
  blended; a mutation ignoring the slide fails it); the second check fixing
  a plan (title and highlight captions), the title's words not yet in at
  0, plain at rest, and in the export: barely in at 0.1 s, whole by 2.5 s,
  with the spoken word yellow; a failed check leaving the plan as made; the
  70 s video's reel opening with its strongest moment, 50–59 s. (On CI the
  highlight check first found only 2–3 yellow pixels, every try: that test's
  reply followed a face, a 102 px wide export where the encoder blurs a tiny
  yellow word under the threshold. It now uses a screen recording, fitted at
  180×320 with captions on black: 91 yellow pixels, 0 with the highlight
  switched off.) Run
  locally: the Make it, graphics, motion, site and the two transition
  specs; the full suite on CI only (low memory here).
- **Not tried against real Gemini** (zero API cost rule): the new prompt
  fields and the check's prompt.

## 3zg. Make it: designed verticals for videos whose picture doesn't carry them (2026-10-07)

- **Asked:** for a reel/TikTok/Shorts/ad request on a video Make it already
  judges "the picture doesn't carry this video" (a static Zoom/Meet meeting
  with a name card, a screen that never changes): no small card in black
  bars, but a designed 9:16 video around the speech: a full-frame animated
  background (colours by style, drawn on canvas, nothing paid), the picture
  hidden or a small rounded corner card (so nothing important is lost), a
  big animated title and key-line cards in the speaker's own words, centred
  captions reacting to each word, a small sound-wave or progress bar. Cuts,
  the 60 s limit, transitions, caption styles, the second check and music
  unchanged; the preview's frame itself 9:16 and the export matching it;
  real footage unchanged.
- **When:** `planMake` designs when the request is short-form or an ad,
  `pictureMatters` is false, there is speech, and it would otherwise fit
  with black bars (no single face followed: a talking head still gets its
  face crop). Gemini's new `card` says `corner` (the picture shows
  anything worth keeping: a name card, a face, a slide, a screen) or
  `hidden` (it shows nothing). A picture that matters, a professional or
  funny edit, or a silent video: unchanged.
- **The edit:** `design: { palette, picture }` in the snapshot (undo, reset,
  save as ever; old projects open with none). The crop is part 1's fit, so
  the frame is 9:16 (1080×1920 for 1080p). No push-ins on the sentences (the
  picture isn't what's said); zoom cuts grow the card.
- **Drawing, one set of functions** (`design.ts`): `drawDesign` paints the
  gradient (turning slowly between the palette's two colours), three soft
  shapes drifting, the progress bar and the wave (moving while a caption
  is on screen), from the edited time; `cardRect` places the card (lower
  left, 44% wide, the picture's shape, rounded). The export calls them on
  its canvas (`drawFrame`'s designed branch: background, the picture in the
  card with any clip dissolving or sliding in, the fade, then the text); the
  preview's `DesignCanvas` calls `drawDesign` on a canvas filling the 9:16
  output frame, and `PictureFrame` puts the video (and the dissolve's second
  player) in the same card, or hides it. Annotations don't show in a
  designed frame, in either.
- **Text:** captions in the middle (`DESIGN_CAPTION_Y`), the word being
  said growing 30% and settling over 0.18 s (`wordPop`; times from
  `editedCaptions(…, timed)`, or a one-word caption's own start:
  `saidWordAt`); colour only in highlight mode (`captionMode` now in
  `Overlays`). Titles and key lines become rounded cards just around their
  words, the title 25% bigger, wrapped to fit the frame (`cardLines`; the
  preview measures with a canvas at the frame's own size, so it breaks the
  same lines as the export), word by word across lines (`lineReveals`).
  Every word still comes from the transcript (key lines quote it; titles
  with names never said are dropped).
- **Checked in the browser:** the preview's frame and the export's frame
  side by side at 2.5 s: the same two-line title card, centred popping word,
  card with the test video, wave and bar. Before wrapping, a long title
  overflowed in the preview while the export squeezed it: fixed by the
  wrapping.
- **Tests:** unit (designed when, card or hidden, palette by style, not for
  a picture that matters, professional, silence; 1080×1920; no sentence
  zooms; the card's place; `wordPop`; `cardLines`, `lineReveals`,
  `saidWordAt`). e2e: a designed reel: the plan says so, the preview's frame
  is 9:16 with the background canvas and the card low on the left, and the
  preview's screenshot and the export's frame at 1 s agree region by region
  (both background edges and the card's corner within 25 levels), the
  export 180×320, coloured, the card showing the video's own blue. Two
  existing tests that measure a black-bar export now say the picture
  matters (their screen recording would now be designed).
- **Not tried against real Gemini** (zero API cost rule): the `card` field.

## 3zh. Make it: time limits and plain AI errors (2026-10-07)

- **Reported:** "Planning the edit…" stuck over 5 minutes, no error, after
  the owner changed the Gemini key.
- **Found:** the new key works (free calls: the model list and
  `countTokens` both 200; it's a 53-character `AQ.` key, not the usual
  `AIza…`). The `ai_usage` rows told the rest: the owner's Make it plans
  sent **~159k input tokens** (a 5-minute video's 150 pictures: Gemini 3.5
  reads each at ~1000 tokens, not the ~260 assumed in 3ze) and took **81–103
  s** when they worked; three failed with **503 (overloaded)** after 23–87
  s; and after every plan since 14:43 there was **no `make_it_check` row at
  all**: rows are written when a call ends, either way, so those checks
  never ended. The SDK has no time limit by default (and retries only when
  asked), so the page waited on an unanswered call until the network layer's
  own ~5-minute limit. Not proven with a paid generation call (zero API cost
  rule).
- **Fixed:**
  - `withTimeout` (`src/lib/with-timeout.ts`): aborts the call through its
    signal and rejects with `TimeoutError` at the limit even if the call
    ignores it. `generateContent` takes `timeoutMs`; the plan has 60 s
    (`PLAN_TIMEOUT_MS`), the check 30 s. A time-out is an `ai_usage` error
    row (`error_type: TimeoutError`). The page stops waiting 5 s after the
    server's limit (`PAGE_GRACE_MS`), whatever happens to the request, and
    shows "Retake couldn't plan the edit just now. Go back and try again in
    a moment." with Back; a check that times out shows the plan as first
    made, as before.
  - `rethrowAiError(provider, feature)` (replacing `rethrowAsBusy`, on every
    AI action): `aiFailureOf` (`src/lib/ai-failure.ts`) names a time-out
    (504), a refused key (401/403, or 400 "API key not valid": 401), a usage
    limit (429) or a busy AI (503); each becomes an AppError with plain
    words ("The Gemini API key was refused. Check GEMINI_API_KEY in
    .env.local, then try again.", "The Gemini usage limit has been reached…")
    and a `log.warn('AI call failed', { provider, feature, failure, status })`
    on the server; anything else is still a reported bug. The page shows the
    server's words for 401, 429 and 503 only (`isPlainAiStatus`), the
    transcript's too (Deepgram's key or limit).
  - The plan's pictures go at **medium detail** (`mediaResolution`, ~256
    tokens each): about a quarter of the tokens, so a 5-minute plan fits the
    60 s comfortably and costs less.
- **Checked on a production build** with a preloaded fetch stub (no paid
  call): Gemini never answering: the page showed the message at 60 s, Back
  kept the request, the server logged `failure: "timeout"`, and `ai_usage`
  has the 60012 ms `TimeoutError` row. Gemini refusing the key (its real 400
  "API key not valid"): the plain key message at once, logged
  `failure: "key"`, an error row.
- **Tests:** unit (`withTimeout` with a fake AI that never answers: given up
  at 50 ms, the signal aborted; an answer in time, its own failure;
  `aiFailureOf` for each kind and the rest; `isPlainAiStatus`). e2e: a plan
  request held forever gives the plain message after about a minute and a
  way back; a refused key shows the server's words.
- **Careful:** a production `pnpm build` here replaced `.next` under the
  owner's own `next start` on port 3000, which then served blank pages;
  tests ran against a separate server on 3100 (`E2E_BASE_URL`). Rebuild
  before restarting a local production server.

## 3zi. Redesign to the owner's design files (2026-10-08)

- **Asked:** make the whole site match `design/landing.html` (public pages)
  and `design/app.html` (the app) exactly, dark and light, keeping every
  feature; true content instead of the design's placeholders; free in beta.
- **How the designs were read:** each is a bundled page that unpacks its
  boards into iframes. A Playwright script (temporary, not committed)
  screenshotted every board while scrolling it (sections animate in on
  scroll), clicked the app prototype's own nav for each screen, and dumped
  every element's computed font, colour, border, radius and shadow. Those
  numbers are what the code uses.
- **Tokens** (`globals.css`, DESIGN.md): night blue `#09081A` / lavender
  white `#F7F6FD`; violet `--accent` for fills, `--accent-fg` for accent text
  (every `text-accent` became `text-accent-fg`); brand gradient utilities;
  fonts Manrope, Instrument Serif, Geist Mono (Geist and Space Grotesk gone);
  light CSS motion all under `prefers-reduced-motion: no-preference`. A
  `data-theme` on any element scopes a theme (the day-and-night slider).
- **Public site** (`(site)/`): glass pill header (active page dotted, wide
  theme switch, Open Retake), new footer (Features, How it works, Pricing,
  Contact & FAQ, Privacy). Home: hero with a drawn app window and floating
  notes; the five-scene story (sticky stepper following the scroll, the
  picture of the app changing per scene); Make it's style tabs and
  before/after slider; three promises; a day-and-night slider; the closing
  band. Features: three sections beside pictures of the app. How it works:
  two paths (AI, by hand), each a scroll story. **Pricing** (new): free while
  in beta, eight features, after beta undecided, limits = 5-minute videos
  for transcripts/Make it/highlights, projects in the browser's storage.
  **Contact**: Name (optional, into the existing nullable `name` column),
  email, "What's it about?" (kept as `[topic] ` at the start of the message:
  no schema change), message; then the FAQ (9 questions, true answers).
  **Privacy** (new): who, what's collected (Supabase account, PostHog usage,
  Sentry errors, contact messages; videos stay in the browser), Deepgram and
  Gemini and what each receives, keeping, choices, changes.
- **Sign-in** moved to an `(auth)` group (same `/login`): the design's split
  screen, show/hide password, a link to switch to sign-up (the tabs went).
- **App**: the app bar (New project / Projects, filled when current, initial,
  Sign out; icons only on a phone). Home: "What are we _making_ today?",
  Make it with AI (request box, its four starting points, Upload and
  describe hands the video and request to `/make` via `make-start.ts`;
  nothing is planned until Make it is pressed there), Edit by hand, and the
  old Edit with AI (a command waiting in the editor) kept as a third row so
  no feature is lost; recent projects under them. Make it: the three-step
  indicator, gradient-framed form, starting points, the plan as tiles with
  the check in green. Projects: serif heading, search, sort by last edited
  or name, count, video length on each picture. Editor: logo mark and the
  segmented Edited/Original in its bar; the rest follows the tokens.
- **Drawn pictures**: the design's photos and app screenshots are drawn in
  markup and SVG (`app-screen.tsx`, `make-screen.tsx`, `scenes.tsx`), scaled
  by `.mock-frame` (tan(atan2()) to turn widths into a scale), and hidden
  from screen readers.
- **Tests**: unit for the contact schema (name, topic) and the projects
  search/sort; e2e `site.spec` rewritten (story stepper, Make it tabs and
  slider, new pages, pricing, how-it-works paths, login switch and password
  toggle, phone overflow), `home.spec`, `make-it.spec` (Home hands its video
  to Make it), `auth.setup` (Sign in button). Light background checked at
  `rgb(247, 246, 253)`.

## 3zj. App screens: two ways in, Make it as a chat, the chat-only view (2026-10-08)

- **Home:** the "Edit with AI" row (a command typed on Home, waiting in the
  editor) is removed, the owner's decision. "Edit by hand" is now "Edit
  manually"; nothing else on Home changed.
- **Make it:** the form shows the attached video as the design's attachment
  row (a still from it, its length, `720p · 12 MB · ready`, Replace) and a
  paperclip beside the mic. Once Make it is pressed, the page is a chat on
  the left (Retake AI, the request, then the progress, questions or the plan)
  beside the picked video on the right. The plan has Apply, Edit manually and
  Cancel.
- **The editor from Make it:** Apply hands the plan over as before plus
  `studio` (the request, the plan's lines, the lengths). The editor then
  opens on the edited video with only the chat on the left (the tool rail
  hidden, not removed, so nothing in its panels is lost) and no timeline; an
  "Edit with AI / Edit manually" switch in the top bar and a "Want finer
  control?" card open the full editor on the same edit and history. Edit
  manually on the plan opens the full editor straight away (as "Edit
  manually" on Home does: on the transcript). The plan, the edit and the
  history are exactly as before; only what's shown differs.
- **Tests:** e2e `home` (two ways in; the command test removed with its
  feature; the saved-projects test uploads through Edit manually),
  `make-it` (after Apply, the existing checks go on in the full editor via
  the switch; new: the chat and the chat-only view and back, and Edit
  manually from the plan). Full suite 113/113 locally on a production build.

## 3zk. The site shows the real app, in the mockups' layouts (2026-10-08)

- **Layouts are the mockups'** (`design/landing.html`, `design/app.html`): an
  earlier attempt (PR #19, closed) rearranged the story, hero, Make it and
  How it works; those are back as in the mockups, and only their pictures
  are real: the story's and How it works' device frames, Features' pictures
  and the day-and-night slider hold screenshots of the app; the hero window
  holds stills of the footage; Make it's before/after plays the footage and
  the app's own exports. Clicking a device screenshot opens it full size (Esc
  or a click outside closes it).
- **App screens to the mockup:** Make it's plan is the mockup's review screen
  (the video beside a plan card of rows: Length, Shape, Captions, On screen,
  Motion, Music; the check; Apply and open, Edit manually, Change my request,
  Cancel; the plan's words unchanged). After Apply the editor shows the chat
  on the right, Your edit and Want finer control beside the video from
  1280 px (under it below that).
- **Footage:** Pexels 35571635, "Stunning Sunrise Over Serene Mountain Range"
  by Yogendra Singh (Pexels License; CREDITS.md), upright 9:16, no people.
  It has no sound: the shots script gives the app's copy a stand-in voice
  (noise shaped like syllables, written as a WAV) so the transcript steps
  run; the words are a voice-over written for it, answered by the fake AI.
  Not committed: the download and the working copy.
- **`e2e/site-shots.ts`** (own config, never run by the suite;
  `SHOTS_CLIP=… FFMPEG=… E2E_BASE_URL=… pnpm shots` on a production build,
  restarted afterwards so it serves the new files): ffmpeg cuts the app's
  copy, the "before" (1920×1080 VP9, ~1.3 MB, poster 2160×1216), the hero
  picture (1080×810) and timeline stills (640×360) from the full-resolution
  download; the app takes 10 screens per theme at 2x (device slots at
  1100 × 710, the app's desktop layout; day and night at 1440 × 930); each
  Make it style is applied and exported through the app and re-encoded for
  the site (720×1280, ~2.1 MB, poster). Stills go through `next/image`
  (`sizes`, quality 85, allowed in `next.config.ts`).
- **Why the earlier pictures were blurry:** recorded in real time in a
  headless browser from a 4K/60 fps file, which dropped frames (a 20 KB
  "before"), at 1x or smaller than shown.
- **Notes:** long pauses count from 7 s, longer than the clip, so Clean up
  says "No long silences"; the plan cuts the pause between sentences instead.
  Highlight and plan sentences are numbered from 1.

## 3zl. Make it: the plan's summary and length agree (2026-10-09)

Found in the real Make it runs (a 3-minute walkthrough and a short clip).

- **Summary cut mid-word:** every note was `slice(0, 200)`. Now `clipText`
  cuts at the last space before the limit, with an ellipsis; the summary
  may run to 400 characters (the real one was about 230), other notes 200.
- **Summary length disagreed with the plan** ("to 55 seconds" for a 50 s
  edit): Gemini writes the summary before the code cuts the edit to fit or
  applies the check. `summaryWithLength` puts the edit's own length (rounded,
  as the heading shows it) in place of a length said of the result ("to 55
  seconds", "a 55-second reel", "0:55 long"); the original's length and the
  lengths of parts cut stay. The prompt now asks for no lengths at all.
- **A check's "too short" did nothing** (44 s reel stayed 44 s): the check
  had no way to say it but free text, shown under "fixed". It now answers
  `tooShort`. For a reel, TikTok or Short, `planMake` (told by `tooShort`)
  takes back sentences the plan had left out, its moments first, never the
  check's own drops, up to 50–59 s, and the Length row says so. When nothing
  more fits, or the edit isn't short-form, a warning on the plan says it's
  shorter than asked, with the real length; a short-form edit under 50 s of
  a video that runs longer gets the same warning without the check.
- Tests: unit (`make-plan.test.mts`) for each; e2e (`make-it.spec.ts`) for
  the whole summary with its real length and the warning, with the fake AI.
  Not tested against real Gemini (no paid calls).

## 3zm. Make it: follow-ups in the chat (2026-10-09)

- **Where:** the chat in the chat-only view after Make it's Apply (the
  "Edit with AI" mode). There, what's typed is a follow-up to the plan; in
  the full editor ("Edit manually") the chat stays the command chat. Same
  layout as the mockup: only the intro, the four examples and the
  placeholder speak of the plan instead.
- **The call** (`followUpMakeIt` in `make/actions.ts`, feature
  `make_it_follow_up`, the same model and 60 s limit as the plan): the
  request, the follow-ups applied before, the plan as it is now (its reply
  JSON), the edit's length now, the transcript and the follow-up. No
  pictures, so it costs a fraction of a plan; what only they told (the
  subject, faces, whether the picture matters) stays as the first plan saw
  it (`followUpPlan`). The answer is the whole plan again plus `maxSeconds`,
  a length asked for ("30 seconds", or "shorter": about two thirds of now).
- **The plan** is made by `planMake` as the first one was. `maxSeconds`
  limits any edit (never lifting a reel's 59 s) and fills to 85% of it; an
  edit asked to be short is never warned as short. `planMake` now also
  returns the reply as used (its sentences as cut to fit or lengthened), so
  a follow-up starts from the edit as it was, not the reply's first guess.
- **What changed** (`planChanges`): the length in whole seconds ("Length
  50 s to 35 s"), sentences kept, shape, captions, title, key lines, zooms,
  transitions, music. Nothing changed: said so, with no Apply.
- **Apply** records an undo step and puts the new plan's edit in place;
  **Cancel** changes nothing. The editor keeps the plans applied; a
  follow-up builds on the one the edit is now (`isPlanEdit`: the plan's own
  values, which Undo puts back), so after Undo it changes the plan before.
  Changed by hand since: it builds on the last plan applied and says that
  applying replaces those changes.
- **Unclear:** 1 to 3 questions in the chat, answered there, then the plan.
  **Can't do:** listed plainly; nothing changes for those parts.
- **Errors:** the first plan's: the server's plain words for a refused key,
  a usage limit or a busy AI; otherwise a plain "couldn't update the plan".
- **Not done:** no second check on a follow-up's plan (the code's own rules
  for length, quotes and names still hold); follow-ups only in the
  chat-only view.
- Tests: unit (`make-plan.test.mts`) for `maxSeconds`, `planChanges`,
  `followUpPlan` and its schema, `isPlanEdit`; e2e (`make-it.spec.ts`) for
  the whole flow with the fake AI (questions, changes, Cancel, Apply, Undo,
  can't do; the request carries no pictures). Breaking the after-Undo base
  (always the last plan) fails it. Not tested against real Gemini.

## 3zn. Make it: shapes, fit and briefs (2026-10-09)

- **Shape** (`reply.shape`): vertical 9:16, square 1:1, portrait 4:5,
  horizontal 16:9, or original (the video's own). Reels, TikToks and Shorts
  are always 9:16 (the 59 s limit stays). The prompt keeps an ad's own
  shape unless the request names one. A video within 2% of the shape is
  left alone (`how: 'matches'`).
- **Fit** (`reply.fit`, `fitAsked`): bars (`Crop.fit`, as before), blur
  (`Crop.fit` + `Crop.blur`, new) or fill (a centred crop, or the crop
  following one person's face). Fill only when asked, or for one person on
  camera in a reel, never in an ad unless asked; otherwise bars or blur.
  A designed vertical (meeting reels) only when no fit was asked. The plan
  card's Shape row says the shape and fit, then why ("So nothing of the
  picture is cut off", "Zoomed in because one person on camera is the
  subject", "As you asked").
- **Blur** draws the picture 16 px wide (`blurSampleSize`), stretched to
  cover the frame (`coverRect`), darkened 35%: the preview with a canvas
  scaled by CSS (`BlurBackdrop` in `picture-frame.tsx`, drawn from the
  editor's own video every frame), the export with `drawImage` in
  `drawFrame`, so the two match. Not zoomed with the picture; drawn from the
  main video only (an added clip from another file would show the main
  one's frame blurred in the preview).
- **Export sizes** come from `exportSize` as before; checked for each:
  1920×1080 to 9:16 bars or blur 1080×1920, filled 608×1080; 1080×1920 to
  16:9 bars 1920×1080, filled 1080×608; square 1920×1920; portrait
  1536×1920; a match, its own size.
- **Brief** (`reply.brief`): audience, tone, length, what to show and a
  call to action, each in the request's own words. Used: the length as
  `maxSeconds` (now on the first plan too, not only follow-ups; the
  follow-up reply is the plan's own shape), the call to action as text over
  the last 3 s (words from the video or request only; a key line it meets
  goes). The plan card lists what it used ("From your brief: …").
- **Follow-ups**: "make it square", "keep the black bars", "zoom in on the
  speaker" change shape and fit; the chat lists "Shape: … to …" and "Fit:
  … to …".
- Tests: unit for every shape and fit on a wide, a tall and a matching
  video (crop and export size), the fill and design rules, the brief and
  call to action, and the blur's maths; e2e: a wide video made a vertical
  ad over a blur, a tall one made horizontal with bars, a wide one that
  already matches then made square by a follow-up, each export's real size
  read from the file and its colours compared with the preview's. Turning
  the export's blur off fails it (preview blurred, export black). Fake AI
  only; not tested against real Gemini.

## 3zo. Make it: a screen recording is never a corner card (2026-10-09)

- **Bug:** a reel made from a screen recording came out as the designed
  vertical frame (section 3zg): the palette over the whole frame, the screen
  a card 44% wide in the lower left. Cause: `planMake` designs a reel or ad
  whose picture "doesn't carry it" (`pictureMatters: false`), and the prompt
  told Gemini a screen recording is judged by its speech (and named "a
  still screen" as a designed case). Not a scaling or offset bug: the card
  is placed in the corner on purpose, for meetings.
- **Fix:** `designable` excludes `subject: 'screen'`, so a screen recording
  takes the fit path (bars or blur, `how: 'whole'`): full width, centred,
  nothing cut off. The prompt no longer names a screen as a card case.
  Meetings are designed as before. Only 9:16 was affected; 1:1, 4:5 and 16:9
  already showed it whole.
- Tests: unit (each shape: no design, the crop full width and centred;
  a meeting still designed; fails without the fix); e2e: a one-colour
  (green) screen recording made 9:16, 1:1, 4:5 and 16:9, each export's own
  size checked and its frame read: green over the middle 80% of the
  centred, full-width area, none in the frame's corners (fails before the
  fix on 9:16: nothing green in the middle).

## 3zp. Make it: only a meeting is ever a corner card (2026-10-10)

- **Still happening after 3zo** on the owner's real recording (`Cap
Recording - 26 September 2026.mp4`: a screen with a webcam bubble). Two
  real runs (approved, about 4 cents each), on 3zo's code: the first got
  the designed frame (picture hidden), its label not captured; the second,
  captured, came back `subject: one_person`, `pictureMatters: true`, `fit:
fill`. So Gemini doesn't call it a screen, and 3zo only excluded the label
  `screen`. Its answers also differ run to run on the same file.
- **Fix:** the designed frame (palette, corner card) is used only for
  `subject: 'meeting'` (and, as before, only with no fit asked for). Every
  other label (screen, slides, one person, other) takes the fit path. A
  label outside the list is read as `other` (`.catch`), so it never stops a
  plan nor earns a meeting's layout. The prompt says only a meeting is ever
  a card.
- **Still open:** with `one_person` and `fit: fill`, #23's rule zooms in to
  follow the face (a reel of one person on camera), so the second real run
  came out a 608×1080 crop around the webcam bubble, most of the screen cut
  off. Whether that zoom should give way for a webcam over a screen is the
  owner's call.
- Tests: unit, each label (screen, slides, other, one_person, an unknown
  one) in 9:16, 1:1, 4:5 (full width, centred) and 16:9 (matches); a meeting
  designed unless a fit was asked for; fails with 3zo's condition. e2e: the
  exported frame of a one-colour recording for screen in every shape, and
  for slides, other and an unknown label at 9:16.

## 3zq. Make it: a screen recording's two treatments (2026-10-10)

- **Purpose `screen`** (a demo, walkthrough, project talk or shared screen,
  even with a webcam bubble; the prompt now says so) has exactly two
  treatments, `summary.screen.treatment`:
  - `whole`: the whole screen, bars or a blur, full width and centred; a
    webcam bubble stays the small overlay it is in the recording. Never a
    fill, a face crop, a push-in or a zoom cut (a zoom cut becomes a plain
    cut).
  - `designed`: the existing designed frame with `picture: 'hidden'`:
    palette, big captions, key lines, title and end card, transitions. No
    picture of the screen, never the corner card. Any shape (its own too).
- **Which:** asked for (`reply.treatment`: "text only" → designed, "show the
  screen" → whole), else designed only when the request reads as an ad,
  promo, teaser or highlights reel (`PROMO_REQUEST`), else whole. Whole
  whenever the second check couldn't run (`planMake`'s `unchecked`, set by
  the Make it page). An unknown label is `other`, never designed. The Shape
  row says the treatment and why; a follow-up switches it (the chat's "Fit:
  … to designed around the speech").
- Meetings and one person are as before (3zp).
- **Found while checking (not fixed):** Export straight after the editor
  opens a long video can run before the editor has its transcript: the
  export then has no captions, and once came out an empty 110-byte file.
  Waiting a few seconds avoids it.
- Tests: unit for the default, each promo wording, text only, show the
  screen, unchecked, an unknown label, a designed horizontal ad, meetings
  and one person unchanged; e2e on exported frames of a one-colour
  recording: default whole (full width, centred), the "text only" follow-up
  and a promo designed (no screen, no corner card), an unknown label whole.
  The owner's recording (fake AI, `screen`) exported both ways at 9:16.

## 3zr. Export waits for the transcript (2026-10-10)

- **Bug:** clicking Export straight after the editor opened a long video
  (Make it's Apply on a 4:41 recording) started before the editor had its
  transcript: the export had no captions, and once came out an empty
  110-byte WebM (a header, no frames), downloaded as if it were the video.
- **Fix:** `useVideoExport` takes `ready` (the editor passes: the
  transcript is in, or known not to come: no audio, too long, failed). Until
  then the Export button is disabled and reads "Getting ready…"; the typed
  "export" command says the same and doesn't start. Highlight downloads
  (no captions) are always ready. An export under `MIN_EXPORT_BYTES` (1 KB)
  is reported to Sentry and shown as "The export came out empty.", with no
  file offered.
- Tests: unit (`isUsableExport`); e2e: the transcript held back as a long
  video's would be, Export clicked at once (nothing downloads, "Getting
  ready…"), then a real export once it's in; and a recorder made to hand
  over nothing (the error shown, no download). Both fail with the guards
  taken out.

## 3zs. Make it: the user's words decide a screen recording's treatment (2026-10-10)

- **Found in two real runs** (approved) of the owner's 4:41 recording on
  main: "shorten this walkthrough" and "make a promo ad" both came back
  `subject: screen` with `treatment: "whole"` filled in, so the promo came
  out the whole screen, and both plan cards said "As you asked". Their
  replies are kept as fixtures (`e2e/fixtures/real-run{1,2}-reply.json`).
- **Fix:** `planMake` reads the user's own words (`request` and, from a
  follow-up, `followUps`): `askedTreatment` finds text only ("text only",
  "just the text", "captions only", "no screen"…) or the screen shown
  ("show the screen", "keep my screen", "full screen"…), the latest ask
  winning; Gemini's `treatment` is ignored otherwise (and a value off the
  list is read as none). Then the promo wording (ad, promo, teaser,
  highlights) makes it designed; else whole. `fitAsked` likewise counts
  only with fit words (bars, blur, zoom, crop, fill the frame). Reasons:
  "Showing the whole screen so the product stays visible", "It's a promo,
  so it's text and captions"; "As you asked" only when asked.
- **Export longer than the plan** (run 1: 3:56 → 4:01, run 2: 3:11 → 3:20):
  not reproduced. Replaying both replies on the same recording with a
  synthetic transcript, and a probe with 49 plain joins, exported within
  0.05 s of the plan (recorder resume → video playing about 4 ms a join).
  What those lacked is the real transcript (its 12 filler cuts); not
  confirmed without one (a paid transcription, not yet approved).
- Tests: unit with the two real replies (run 2 + "make a promo ad" →
  designed, run 1 + "shorten this walkthrough" → whole, "text only" / "show
  the screen" win in a request or a follow-up, Gemini's own "designed"
  ignored, an unknown value ignored, close variants, fit words); fails
  with Gemini deciding. e2e: the treatments test with the new reasons.

## 3zt. Make it: an honest brief, and designed text that never overlaps (2026-10-10)

- **Found in a real run** (approved) of the owner's 4:41 recording with
  "make a promo ad" on main: the plan and export were right, but the card
  said "From your brief: energetic tone" (Gemini's `brief.tone`, not the
  user's), the popping caption word overlapped its neighbours, and the
  title overlapped the captions. The reply is kept as
  `e2e/fixtures/real-run3-reply.json`.
- **Brief (owner's decision):** like the treatment (3zs), a part is the
  user's only when every word of it is in the request or a follow-up
  (`saidInBrief`; a length when they give one in numbers). The rest still
  show, as "Chosen for a promo: …" for a promo's wording, else "Chosen for
  you: …" (`summary.brief.said`, `chosenFor`).
- **Pop (cause):** the said word was drawn 1.3× about its own middle while
  its neighbours stayed put, so it ran into them. **Fix (owner's choice):**
  each word pops on its own (`wordPop` now rises over 0.05 s, so nothing
  jumps) and the line is laid out at the words' popped widths
  (`popLayout`): the neighbours slide apart and back. The growth is cut back
  so the line stays inside a 5% safe margin each side; a line already at
  its widest pops less.
- **Also found:** captions were wrapped by characters, never by width, so
  a full line of large captions ran off a 9:16 (or 1:1, 4:5) frame's edges.
  A line that would pass the margins is now drawn smaller to fit
  (`captionFontPixels`); captions in a vertical designed reel can be
  smaller than before.
- **Title (cause):** in a designed frame of the video's own shape the title
  sat 40% down at 1.25× and wrapped into the captions at 60%, for its whole
  3 s, not just the fade. Key lines and the call to action could do the
  same. **Fix (owner's choice):** every designed card is laid out between
  the top margin and the captions' top (two lines at full size), with room
  for its entrance (`designedCardLayout`); too tall, it's made smaller, down
  to the captions' size; still too tall, the captions wait while it shows.
  With large captions that happens in 1:1 for the owner's title ("Fathom AI
  meeting notetaker") and in 1:1 and 4:5 for a long one; 9:16 and 16:9 fit.
- Tests: unit (the brief with run 3's real reply: "make a promo ad" chosen
  for a promo, "make it energetic" the user's, follow-ups, every word,
  audience, show, length; the pop curve never jumps; `popLayout` never
  overlaps, moves no faster than a word grows, a full line pops less;
  `captionFontPixels` inside the margins in each shape; `designedCardLayout`
  per shape and title, and the captions waiting). e2e: the plan card's two
  labels; and a designed promo exported in 9:16, 1:1, 4:5 and 16:9 with
  every drawn frame checked through its canvas calls (`e2e/text-boxes.ts`):
  no text overlapping, no caption past the margins, no caption into a card.
  It fails on main's drawing code (pops into neighbours, lines past the
  edges, title into captions).
- **The owner's recording** (cached transcript, run 3's real plan and check
  through the fake AI, no paid call), exported 16:9 and 9:16: every frame
  checked the same way, 6,204 and 6,258 frames, no problem; the title and
  captions both show for the first 3 s; 3,499 and 3,548 frames with a word
  popping; both exports 3:11.38 for a 3:11 plan ("Export finished"). The
  card says "Chosen for a promo: energetic tone".

## 3zu. Saves, exports and re-linking you can trust (2026-10-11)

From the whole-repo review (three reliability gaps):

- **Saves (`projects.ts`):** a write resolved when its request succeeded,
  not when its transaction committed, so a write the browser aborts on
  commit (its storage full) could still show "Saved"; and media went in
  before the project, in their own transactions, so a failed save could
  leave media behind. Now every write waits for its commit (`committed`:
  `oncomplete`, or `onabort` with `tx.error`), and a save is one
  transaction over the media and the project: all of it, or none.
  Storage full (`isStorageFull`, a `QuotaExceededError`) shows "Your
  browser’s storage is full. Delete a project or free some space, then
  save again."; any other failure, as before.
- **Export (`export-button.tsx`, `export-video.ts`):** a hidden tab draws
  no frames, so an export would stall or come out wrong. Hiding the tab now
  stops it (`visibilitychange`, aborted as "tab hidden") with "Export
  stopped: this tab was hidden." and no file. `nextFrame` also settles
  when aborted: waiting on a frame a hidden tab never draws, the export
  would otherwise never notice the abort.
- **Re-linking (owner's choice of fingerprint):** a stand-in file had to
  match only the name and size. Media references now keep a fingerprint
  (`mediaFingerprint`: SHA-256 of the size and the first and last 1 MB,
  read once per file); re-linking checks it. Projects saved before have
  none and still re-link on the name and size. Storage keys are unchanged.
- **Test dependency (owner's decision):** `fake-indexeddb` 6.2.5, pinned,
  dev only, Apache-2.0 (not MIT, accepted), for unit tests against a real
  IndexedDB implementation.
- Tests: unit, a commit that fails, and one failing as storage full (both an
  error, nothing saved, no media left, the message's words); a file of the
  same name and size but other content refused, the same content taken;
  the fingerprint reading both ends; an old project re-linking; `nextFrame`
  ending on abort with no frame. Each fails with its fix taken out (five
  mutations of `projects.ts`). e2e: hiding the tab once recording is under
  way (frames held back, as a hidden tab does) stops the export with the
  message, no file after the edit's length; fails without the listener or
  without the abortable `nextFrame`.
- **Not covered:** how a real browser reports storage full (Chrome, and
  Safari and Firefox not at all): the tests make a commit fail the way it
  can there. A fingerprint misses a change of the same size in a file's
  middle only.

## 3zv. Paid AI actions need a signed-in user (2026-10-11)

From the whole-repo review: the paid actions had no session check of their
own; the only guard was proxy.ts's sign-in redirect, which lets a request
through when Supabase can't be reached (or isn't configured).

- **Guard:** `requireUser()` (`session.ts`, a 401 `AppError`) and a
  `signedIn: true` option on `validatedAction` (run before the input is
  parsed; `authorize` is the admin console's and needs a staff seat). On all
  seven paid actions: the four editor ones and Make it's plan, check and
  follow-up. Fails closed: no session, a bad one, Supabase unreachable, or
  accounts not configured all refuse. Login, contact and the admin flag
  actions are unchanged. `docs/rules/auth.md` says so.
- **Production:** `missingProductionSettings` (`env.ts`): with
  `NODE_ENV=production` and the Supabase URL or key unset or empty, the
  server refuses to start (instrumentation loads env.ts at boot): "Accounts
  aren't set up: … must be set in production, or every paid AI action
  refuses. Set them, then start again." Not during `next build` (CI's build
  has no Supabase). Checked by hand: a build without them passes; `next
start` without them logs the message, and every request is a 500. Next
  keeps the process up ("Failed to prepare server") rather than exiting.
- **Then it exits (follow-up PR, owner's decision):** the check moved to
  `src/lib/production-settings.ts`, and `instrumentation.ts` runs it first
  at boot: missing settings are logged (an error naming them) and the
  process exits with code 1 once the log is out. Only for a production
  server: never in the build, development or tests; env.ts still throws on
  it as a backstop. Checked by hand: a build without them passes; `next
start` without them exits 1 after ~3 s with the message; a build made
  without them starts and serves (200) when they're set at runtime (the
  boot check reads them then, not from the build).
- **Time limits:** Deepgram's request now runs under `withTimeout` (its
  `timeoutMs` required): 60 s for a take, 30 s for a voice command. The
  editor's Gemini calls: 30 s for a command, 60 s for highlights (Make it's
  were already 60/30 s).
- **Found while testing:** `withTimeout` aborted the call before rejecting,
  so a call that fails at once on abort (an AbortError) won the race and
  showed "Something went wrong" instead of the time-out message. It now
  rejects first.
- **Test runner:** `pnpm test` adds `--experimental-test-module-mocks`
  (works on Node 22.23 and 24; owner's choice of no test bypass in the app).
  `scripts/ts-resolve-hooks.mjs`: the `@/` alias built `file:///C:/C:/…` on
  Windows (fine on Linux), now `new URL('../src/', import.meta.url)`;
  `server-only` resolves to Next's own empty module, as on the server; a
  package path with no `exports` (`next/navigation`) is retried with `.js`.
  `DeepgramError`'s parameter property became a field (Node can't strip it).
- **Hand check** (local server, no session): `POST /editor` with the
  voice-command action was redirected to /login (Supabase up, with or
  without a made-up session cookie); posted to `/pricing` or `/` it's
  "Server action not found" (Next only runs an action on a page that has
  it); with the auth service stopped and a made-up cookie, the redirect let
  it through (200) and the action answered `{"ok":false,"error":"Sign in to
use this.","status":401}`; no `ai_usage` row was written.
- Tests: unit, each paid action refused for no session, Supabase
  unreachable, a throwing lookup, a bad session and accounts off (no
  provider call), and reaching its provider when signed in; each editor
  call given up at its limit with its request aborted (fake timers);
  `withTimeout` with an immediate AbortError; the production check. Seven
  mutations (the guard, the options on either file, each timeout, the
  ordering, the env check) each fail their tests. e2e unchanged: its mocks
  answer every paid action (transcripts, highlights, commands, Make it's
  plan, check and follow-up), so CI needs no sign-in.
- **Not covered:** real Supabase sign-in in unit tests or CI (local e2e
  signs in for real; CI runs with accounts off).

## 3zw. Contact form limit and a safe sign-in redirect (2026-10-11)

From the whole-repo review: the public contact form wrote to the database
with no limit, and sign-in's `next` check let `/\evil.com` through (a
browser reads the backslash as a slash).

- **Redirect** (`login/next-path.ts`, owner's rule): `next` is used only
  when it starts with a single "/" and `new URL(next, location.origin)`
  keeps the origin; the browser-resolved path is returned. Anything else
  goes to `/home`. It is the only place `next` is read (the proxy only
  writes it; the leave guard checks its own links' origin).
- **Contact limit** (owner's choices): a hidden `website` field (out of
  sight, out of the tab order, `aria-hidden`), and a per-sender limit
  counted from the saved messages themselves, so it survives restarts and
  holds on every instance. A sender is an HMAC-SHA256 of their IP with
  `CONTACT_IP_SECRET` in the new nullable `contact_messages.ip_hash` (plus
  an index), never the IP, never logged. 5 messages per rolling hour per
  sender; 30 per hour shared by everyone who can't be told apart (no IP, or
  no key: development, tests, a demo). Both checks refuse the same way: 429,
  "Your message couldn't be sent right now. Please try again later." Refusals
  are logged by check only.
- **The IP:** the last `x-forwarded-for` entry, the one the host wrote:
  Vercel replaces the header with the client's IP, a proxy appends to it,
  and a client can only add entries before it. Self-hosted with no proxy,
  Next fills it from the connection only when missing, so a client could
  set it: there, the limit can be dodged by changing the header.
- **The secret:** `CONTACT_IP_SECRET` in env.ts (at least 32 characters
  when set) and `.env.example` (how to generate it: `openssl rand -hex 32`).
  Required for a production server: the boot check from 3zv now names it
  too, in its own sentence. Optional elsewhere (the shared limit applies).
- **Migration:** schema only (additive: a nullable column and an index);
  CI writes it. Previewed with `generate-migration.mjs --check`: against the
  local database it also showed `name DROP NOT NULL`, which is already in
  the committed `20261006092640_feat_calmer_site_and_editor` (that database
  just hadn't applied it). After merging, run `prisma migrate deploy`
  locally before using the contact form.
- **Privacy page:** the Messages item now says a coded form of the network
  address is kept with each message, only against floods; dated 11 October.
- Tests: unit (redirect: normal paths, `//evil.com`, `/\evil.com`,
  `/\/evil.com`, `\\evil.com`, `https://evil.com`, another host, a tab,
  `javascript:`; the IP's last entry; the keyed hash; a normal message kept
  with a hash and no IP; the honeypot refused; 5 then refused, another
  sender through, a spoofed prefix not, refused just inside the hour and
  allowed after it; the shared 30; the production check with the secret).
  Six mutations each fail their tests. e2e: the hidden field is out of
  sight, not offered to a screen reader and sent empty; a refused message
  shows the plain words. The existing contact test passes unchanged.
- **Hand checks** (a production build, a throwaway database, dropped
  after): one sender's 6th and 7th messages refused, another sender's
  accepted, the honeypot refused the same way; hashes 64 characters, no IP
  in the table or the log. Signing in with `next` of `//evil.com`,
  `/\evil.com`, `https://evil.com` or `/` + tab + `/evil.com` landed on
  `/home`; `/projects` on `/projects`; no off-site request.
- **Not covered:** how a real host passes the client's IP (only Vercel's
  documented behaviour, not tested), and several messages sent at once from
  one sender (the count and the save aren't one transaction, so a burst can
  get a few past the limit).

## 3zx. A daily AI allowance per user (2026-10-11)

From the whole-repo review: the seven paid AI actions had no per-user
ceiling, and sign-up is open with email confirmation off, so one account
could spend without limit.

- **What counts (owner's choice):** calls per kind per UTC day, set in one
  place, `DAILY_AI_LIMITS` in `src/lib/ai-limits.ts`: typed edit commands
  300, spoken commands 200, transcripts 30, highlight searches 30, Make it
  60 (a plan, its check or a follow-up each count one). Changing a number
  is a code change (PR, CI, merge, deploy) and applies to today's counts at
  once. The Pricing page's limits note reads the same numbers.
- **Worst case** (the highest cost each kind has been seen at in
  `ai_usage`): about $4.58 a day for one account (Make it plans $3.69 of
  it), so about $458 a day for 100 accounts. Sign-up is open and email
  confirmation is off: that is the exposure before a public deploy.
- **The table:** `ai_allowances` (new; `user_id`, `day` as a date,
  `kind`, `used`; primary key on the first three). No foreign key to
  `users`. Not `ai_usage`, which is MOAD's. Additive: CI writes the
  `CREATE TABLE` migration, then a hand-written migration enables RLS with
  no policies (as `contact_messages`: `d9f4788`, then `4152f73`), so the
  first CI run's `check:rls` is red by design.
- **Check and count:** `validatedAction`'s `allowance` option (implies
  `signedIn`): after sign-in and input parsing, before the handler.
  `takeAllowance` is one conditional `updateMany` (`used < perDay`,
  increment); the day's first call creates the row, and a unique-key race
  counts against the row the other request made. At the ceiling: 429,
  "You've used today's 300 typed edit commands. They reset at midnight UTC,
  in 14 h 0 min.", and no provider call.
- **Fairness (owner's condition):** if the handler throws (the provider
  failed, timed out, or answered unreadably at the wrapper), the call is
  given back. An answered call counts even when its reply is unusable,
  because the provider was paid. A malformed request costs nothing (it
  fails parsing first).
- Tests: unit, each of the seven actions counted under its ceiling,
  refused at it with the plain message and no provider call, allowed again
  the next UTC day; 50 simultaneous requests with 10 left take exactly 10,
  and 20 first-of-the-day ones all count once; a provider failure and a
  time-out are given back, an unusable answer counts. The database is an
  in-memory stand-in that pauses on every call, as a round trip does.
  Seven mutations each fail their tests, a check-then-count version among
  them (only the simultaneous test catches it, as it should).
- **Real Postgres, by hand** (a throwaway database, dropped after): the real
  `takeAllowance`, 400 at once on a fresh day, took exactly 300; 50 at once
  with 10 left took exactly 10; a give-back then one more reached 300 again.
- **On a running server, by hand:** at 299 used, a typed command went
  through and the count reached 300; at 300, two more were refused with the
  message and no provider was called (no `ai_usage` row).
- **An unplanned real call during that check:** one `parse_edit_command`
  call to Gemini, about $0.0006 (646 micro-USD). I had set `GEMINI_API_KEY`
  to an empty value to keep the provider out of reach, but Next's env loader
  (`@next/env`) deletes an empty variable and then loads the real key from
  `.env.local`. It was recorded in the throwaway database's `ai_usage`, not
  the real one, so the real cost table doesn't include it. See the rule in
  section 6.
- **Also:** e2e (121 tests) ran against the branch with invalid,
  non-empty AI keys; the real `ai_usage` stayed at 374 rows throughout.
- **Not covered:** the allowance under a real host's load, and real
  Supabase sign-in in CI (CI runs with accounts off).

## 3zy. README and ARCHITECTURE.md describe main as it is (2026-10-11)

From the whole-repo review: the README was the template's (it never named
Gemini, Deepgram, IndexedDB, browser export or Make it, called
`e2e/smoke.spec.ts` the only coverage, and said `pnpm test` ran only
`scripts/*.test.mjs`), and a comment in `video-editor.tsx` said projects
weren't saved yet.

- **README:** what Retake is, the stack, the architecture in short, how to
  run it locally (Docker and local Supabase), the production settings
  (`CONTACT_IP_SECRET` and how to make it), the tests, what CI checks, and
  the scripts. The template's skills table and "Still open" list are gone
  (they described the template); `AGENTS.md` and `CLAUDE.md` are linked.
- **ARCHITECTURE.md:** a Mermaid diagram of how a video moves through the
  app (rendered with Mermaid 11 to check it: no errors, 15 nodes, 17
  links), a module map, each decision with its reason, trade-off and the
  file that shows it, the known limits, deployment notes and what to do
  next. No score or rating.
- **Gemini's timing:** the "250-700 ms off" figure is not given, by the
  owner's decision: section 3 retracts it (its ground truth was invalid).
  ARCHITECTURE.md says the timestamps drifted too much to cut by, and gives
  Deepgram's measured 25-105 ms against fillers of 170-315 ms. The figure
  appears nowhere else in the docs or code (only in the verbatim session
  logs).
- **Comments:** the `VideoEditor` doc comment said projects would be
  persisted "(storage + a Prisma row) once the database is wired up" and
  that everything stays on the machine; it now says the file stays, the
  audio goes to Deepgram and commands to Gemini, and projects are saved in
  IndexedDB. No other comment found contradicting the code (searched for
  not-yet/TODO/later/never-leaves claims).
- **Checked against the code:** every figure (2,557-line `VideoEditor`,
  510-line `planMake`, 1,342 lines of scaffolding, the 5-minute caps, the
  request sizes, the models and prices, the time limits, the daily limits)
  was measured on main; Vercel's 4.5 MB request limit is from its own
  documentation.

## 3zz. The editor's files grouped into folders by concern (2026-10-11)

From the architecture review: `src/app/[locale]/editor/` was one flat
folder of 115 files. Grouping confirmed by the owner; a move only, with no
renames and no logic changes.

- **At the root:** only `page.tsx`, `layout.tsx`, `actions.ts` (a route's
  server actions stay at its root, as in `make/` and `contact/`) and
  `video-editor.tsx`.
- **Folders:** `model/` (the edit: clips, cuts, speed, transitions,
  transform, color, the audio lane, added videos, undo), `overlays/`,
  `audio/` (transcript, audio analysis, filler cuts, re-recording),
  `assistant/` (commands and highlights), `export/`, `projects/` (saving,
  opening and the hand-off from Home or Make it), and `components/` split
  into `shell/`, `preview/`, `timeline/`, `panels/` and `assistant/`. Each
  test moved with its file; `clip-speed.test.mts` (no `clip-speed.ts`) is
  in `model/`. The map is in ARCHITECTURE.md.
- **How:** `git mv` for all 111 moved files (git detects every one as a
  rename), and a script that rewrote each import that pointed at a moved
  file, keeping its style (relative stayed relative, `@/` stayed `@/`):
  332 specifiers in 90 files, including e2e, `next.config.ts` and
  `make-plan.ts`. Prettier then re-wrapped the imports that grew longer.
  One path wasn't an import: `projects.test.mts` reads `messages/en.json`
  through `new URL('…', import.meta.url)`, so it gained one `../`.
- **Checked:** with import specifiers blanked, every changed code file is
  identical to before except that `new URL` line; no import, string or
  docs path names an old location; lint, typecheck, Prettier,
  check:standards/env/secrets and the build pass, and the build's route
  list is unchanged (no folder became a route). Unit tests: 531 before and
  after (530 pass, the Windows-only skip), same names. E2E: 121 before and
  after, all passing.
- **Local e2e at 4 workers:** each full run had 2 timing failures (a chat
  reply not shown in 5 s, a recorded take not ready in 10 s), different
  tests each run, before the move as well as after; each passed on one
  rerun alone. CI runs one worker per shard.

## 3zza. planMake split into named steps, same plans (2026-10-11)

From the architecture review: `planMake` was one 510-line function. It is
now 63 lines that call named steps, each its own exported function in
`make-plan.ts` (placement A: the shared constants and helpers stay put;
splitting the file is a follow-up). No decision changed.

- **Finding:** `planMake` was already pure. Reading the request, calling
  Gemini, validating the reply and the second check live in `actions.ts`
  (`planMakeIt`, `checkMakePlan`) and `make-it.tsx` (`checkFound`,
  `applyCheck`), so the split covers what `planMake` does.
- **The steps:** `planContext` (what every step reads, once: the user's
  own words, `promo`, the words on screen may use), `cutEdit` with
  `transitionJoins`, `lengthLimits`, `openingMoment`, `fitToLimit`,
  `lengthenForCheck`, `shortLabel`, `screenTreatment` (the treatment and
  its plan-card reason, now decided in one place), `shapeAndFit`,
  `planZooms`, `musicBed`, `planTitle`, `keyLineTitles`,
  `withCallToAction`, `captionSettings`, `planSummary`.
- **Behaviour locked first:** `make-plan-replay.test.mts` plans 100
  scenarios (the owner's three real replies with their second-check
  replies, planned, checked and unchecked as the Make it page does; the
  four screen-recording asks checked and unchecked; and variants reaching
  every branch) and compares each whole plan with
  `e2e/fixtures/make-plan-replay.json`, written once from the unchanged
  code. The check replies are `e2e/fixtures/real-run{1,2,3}-check.json`.
  It passed on the old code and after every step.
- **Steps tested alone:** `make-plan-steps.test.mts`, 17 tests. Each step's
  logic was broken on purpose, one at a time (17 breaks), and each made at
  least one test fail; `make-plan.ts` was restored after each (same
  SHA-256), and none is in the diff.
- **Real transcript replay (local only):** runs 1 to 3 over the real
  transcript of the 4:41 recording (kept outside the repo), 25 plans,
  byte-identical before and after.
- **Counts:** unit tests 531 to 649 (101 replay, 17 steps); e2e 121, all
  passing.

## 3zzb. Make it's quick questions, and room for a whole brief (2026-10-11)

Someone with a clear vision can describe it, or answer a few quick
questions, and the plan follows. Question list, skip rules and the request
limit agreed with the owner.

- **The questions** (`make/make-questions.ts`, the screen in
  `quick-questions.tsx`): fixed choices on one screen, no AI call, each
  with "You decide" (picked by default) and a Skip all. In order: what it
  is (Instagram reel, TikTok, YouTube Short, ad, other); an ad's shape
  (vertical, horizontal, keep the video's shape), shown once it's an ad;
  the voice-or-music choice and the music's genre or mood, **defined but
  hidden until music is built**; tone and call to action (optional text,
  120 characters, the brief parts' limit).
- **Skip rules**, in code from the request's own words, whole words only
  ("add captions", "advice" and "adjust" are no ad; "short" and "story"
  never match inside a word, and "short" alone isn't a YouTube Short):
  what it is, when the request names a reel, TikTok, Short(s), story or an
  ad/advert/promo/commercial; an ad's shape, unless it's an ad with no
  shape (vertical, 9:16, square, "keep its own shape"…) and no short-video
  platform named; tone and call to action, each when the request gives
  one. A long brief that says it all asks nothing.
- **The answers count as the user's own words** (`choiceWords`, read with
  the request by Gemini and by the honesty rules), and `planMake` puts
  them in place of Gemini's guess first (`applyChoices`): what it is, an
  ad's shape, the tone and the call to action. A later chat follow-up
  naming the same thing still wins. A screen recording clicked as an ad is
  designed, as a promo. On the plan card, what was clicked reads "From
  your brief", what was left to "You decide" "Chosen for you"; only the
  questions shown are labelled (`summary.questions`, absent when none
  were, so earlier plans are unchanged).
- **Planning waits for the answers:** the video is read and transcribed
  behind the questions, and planning starts only on "Make the plan" or
  Skip all.
- **The request limit is 1,000 characters** (was 300), in the box and in
  `planMakeIt`, `checkMakePlan` and `followUpMakeIt` (which carries the
  original request back); new follow-ups keep 300 (`MAX_FOLLOW_UP_LENGTH`),
  answers to Gemini's own questions 300 (`MAX_ANSWER_LENGTH`). Measured on
  the local `ai_usage`: about $0.00005 more per call at the most (+0.3% of
  a plan). The box counts what's left and, past 1,000, keeps the text as
  typed, says so plainly and holds Make it back. The request and the
  answers stay in the prompt's contents, never its instruction.
- **Tests (fake AI only):** 11 unit tests of the skip rules, the answers
  and the plan following them (each rule removed on purpose, 16 breaks,
  each made a test fail, then restored); 2 server tests of the limits;
  7 e2e tests of the flow (`e2e/make-questions.spec.ts`). The existing
  Make it e2e tests press Make it through `submitMake`, which takes Skip
  all when the request leaves questions open: what they assert is
  unchanged.

## 3zzc. The user decides how long it runs (2026-10-11)

On a real run, "make an ad" on the 4:41 screen recording got a 59 s limit
Gemini chose on its own (`maxSeconds: 59`), and the plan cut it to 56 s.
Rules agreed with the owner before building.

- **A length question:** "How long, at most?" 15 s · 30 s · 60 s · You
  decide, after what it is and an ad's shape. Asked only when the request
  states no length (the same whole-word length rule the plan uses, now in
  `make-questions.ts`: "30 seconds", "45-second", "0:45", "1 minute").
- **`askedLength`** (a `planMake` step): the length is the user's only. The
  latest ask wins: a chat follow-up naming a length, or asking it shorter
  or longer (Gemini's number for it); else the click; else a length the
  request states (Gemini's reading). Left to You decide or Skip all, an ad
  runs at most 30 s (`DEFAULT_AD_SECONDS`) and a reel, TikTok or Short
  keeps its 50-59 s rule, labelled as chosen. **A length Gemini fills in on
  its own never limits the plan.** It's a most, never padded.
- **The plan card:** the length has its own line in the Length row, "As
  you asked: at most 30 s" (clicked, typed or asked in a follow-up) or
  "Chosen for you: at most 30 s", and it left the "From your brief" line.
  A reel asked for 60 s says "Capped at 59 s: reels, TikToks and Shorts
  run under a minute". With a length, "Cut to fit within N s" replaces the
  reel-only "under 60 seconds" lines, which were wrong for any other limit.
- **Real run replayed** over the real transcript (local only): main's code
  gives 56.4 s under Gemini's 59; this branch, the question left to You
  decide, 28.2 s under 30. Only length-driven outputs changed (the limit,
  sentences kept 13 to 7, clips, the call to action's timing); shape,
  treatment, captions, title, transitions and every label stayed the same.
  The real run's replies are now fixtures (`real-run4-*.json`).
- **Existing tests changed, each approved by the owner** (8 expectations or
  inputs, listed side by side in the PR): the follow-up length test now
  gives its follow-up words; one replay scenario states its length (one
  captured field, `brief.said.lengthSeconds`, false to true); the long
  brief's length moved to its own line; four question lists gained
  `length`; one "says it all" brief gained "20 seconds"; one e2e title
  names the length question.
- **Tests:** 5 unit tests for the length (skip rule, each answer and the
  default, a follow-up's 45 s beating a clicked 30, "make it shorter" as
  the user's ask, no padding, the fourth real reply); 4 e2e tests of the
  flow. Each length rule removed on purpose (11 breaks) made a test fail.
  Unit 662 to 667; e2e 128 to 132.

---

## 4. Unresolved issues

### 4a. The command-test regression from earlier instructions is solved

Both command e2e tests failed after the `CommandReply` consolidation,
including one that had passed before. **Root cause, confirmed:**

- The Playwright-reused dev server was started at 06:12, and
  `messages/en.json` changed at 06:20. **next-intl in `next dev` does not
  reload message files**, so the served HTML still had the old keys.
- Evidence: the page rendered the raw key `Editor.command.asked`, and the
  served HTML contained the old `confirm.asked`.
- Fix: restart the dev server. Both tests passed, and the fix was committed
  in `72c8d35` and `a0d6159`.
- A warning comment now sits at `reuseExistingServer` in
  `playwright.config.ts`.
- **Standing lesson:** after editing `messages/*.json`, kill whatever is
  listening on port 3000 before running e2e.

### 4b. RESOLVED (2026-10-02): export A/V sync on 1080p H.264 sources is fine

The suspected ~140 ms picture delay is **not real**. Nothing about sync
blocks committing export.

**The decisive measurement** (`sync-1080-edges.cjs`, scripts list below):

- Source: a synthetic 1920×1080 **H.264** take (recorded as
  `video/webm;codecs=h264,opus`, because Chrome can't reliably
  `decodeAudioData` its own fragmented-MP4 recordings).
  - Lasts 13 s.
  - A tone toggles every second.
  - A square moves 20 px/s (at 320-wide scale), keyed to the same audio
    clock.
- Exported whole through the app.
- For each tone edge k after the source's startup stall (k = 5–12): seek
  the export to the moment edge k is heard, and read which source time the
  picture shows.

Results:

| Edge     | Heard at (export)  | Picture shows  | Offset                                     |
| -------- | ------------------ | -------------- | ------------------------------------------ |
| k = 5–11 | 5.362 s … 11.362 s | exactly 5 … 11 | **0 ms** (±50 ms, the method's resolution) |
| k = 12   | 12.36 s            | 11.8           | 200 ms                                     |

- A 140 ms picture lag would read about 3 px off at every edge; it doesn't.
- The single k = 12 outlier is the last edge, at the end of the file.
  It's consistent with the seek-landing artifact below, not a steady lag.
- The source's own seek-based readings were garbage (−3000 … +2000 ms)
  because seeking in Chrome's H.264 recordings lands on sparse keyframes.
  The export is made by _playing_ the source, not seeking it, so it isn't
  affected. It lands exactly on time, which it couldn't if the source were
  out of sync.

**Corrected 2026-10-02: the lead-in is about 40–65 ms, not ~150 ms.**

These notes used to say the export opens with about 0.15 s of still, silent
frame, because the recorder starts before playback. Both parts were wrong:

- The ~150 ms came from comparing tone onsets decoded with
  `decodeAudioData`, which drops a track's start offset in the container.
  The synthetic source's audio track starts **140 ms** into its file (first
  WebM blocks: video at 0 ms, audio at 140 ms), so its tone looked 140 ms
  earlier than it really plays.
- Corrected with the container's timestamps (`webm-starts.cjs`), the
  export's tone starts 39–65 ms after the source's. That matches the
  export's own audio track starting 33–59 ms after its video track.
- The proposed fix (start or resume the recorder only once `play()` has
  resolved) was built and measured: 39–56 ms after vs 39–65 ms before, the
  same within run-to-run spread. It was reverted, not committed.
- A `Cap.mp4` export (split in three, reordered) came out at 108.84 s for a
  108.865 s edit, each segment in place (correlation 0.946–0.997, vs 0.055
  for the original order) and offset 20 ms, which is the method's
  resolution. The earlier reading of 108.96 s wasn't reproduced.
- No further work is planned on the lead-in unless the user asks.

**Superseded:** the earlier 260 ms "video shift" came from a weak
frame-activity correlation on a mostly static screen recording (r = 0.525),
and the first 1080p attempt used a broken source. Disregard both.

**Already ruled out:**

- dropped frames or the encoder failing to keep up: 28.5 fps exported vs
  24.5 fps source, median gap 33 ms
- drift that accumulates per segment join
- wrong segment order or content: real-footage audio correlation 0.81–0.96
  per segment, synthetic pixel checks exact

**Recommended next steps:**

1. ~~Commit export~~: done in `2c2f0a5` after the full check set (see the
   top of this file).
2. ~~Remove the lead-in by starting the recorder after `play()`~~: tried
   2026-10-02 and measured to make no difference (see the correction
   above), so not committed.

**Verification scripts** (scratch, not in the repo; recreate if missing):

They were in the session scratchpad:
`C:\Users\alish\AppData\Local\Temp\claude\C--Users-alish-Desktop-t1-alishbasaboor\62ad89d8-1854-4e7d-b25e-4e27fe05024e\scratchpad\`

| Script                                     | What it does                                                                                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-export.cjs`                        | Exports a 3-way split plus reorder of `C:/Users/alish/Downloads/Cap.mp4` through the running app in installed Chrome (`channel: 'chrome'`, needed for H.264/AAC). Compares per-segment audio envelopes. Server actions are aborted, so no Deepgram spend. |
| `verify-sync.cjs` / `verify-sync-1080.cjs` | Synthetic A/V sync checks (tone edges vs square position).                                                                                                                                                                                                |
| `fps.cjs`                                  | Frame-rate comparison between source and export.                                                                                                                                                                                                          |
| `sync-1080-edges.cjs`                      | **The decisive 1080p H.264 sync check** (section 4b): A/V offset at each tone edge of an exported synthetic take.                                                                                                                                         |
| `verify-video-lag.cjs`                     | Frame-activity correlation (the weak 260 ms reading, superseded).                                                                                                                                                                                         |

Run them from the repo root (`node <script>`) with the dev server up. The
real-footage export output is `cap-edited.webm` in that folder. **Never
copy the user's recordings or exports into the repo.**

Added 2026-10-02, in that day's second session scratchpad
(`…\bb3649b5-7aa1-4aee-b39a-763a50b36f04\scratchpad\`):

| Script                             | What it does                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leadin.cjs`                       | Exports the **saved** `sync13-source.webm` (not re-recorded, so runs compare like for like) and reports the tone-onset difference plus seek-based sync. Its onset uses `decodeAudioData`; correct it with the next script. |
| `webm-starts.cjs`                  | Reads each track's first block timestamp straight from a WebM container. The correction for `decodeAudioData` rebasing a track to zero.                                                                                    |
| `sync-play.cjs`                    | A/V sync by **playing** a file (`requestVideoFrameCallback`), not seeking it; also counts frames and the longest frame gap, which exposes stalls.                                                                          |
| `stall-export.cjs`                 | Logs every animation-frame gap over 100 ms in the page during one export.                                                                                                                                                  |
| `real-splice.mts` / `classify.mts` | Run `planSentenceSplice` over the real `Cap.mp4` transcript and audio saved by the earlier session, and classify why sentences were refused.                                                                               |
| `rerun-splice.mts`                 | The same planner run after the contains-the-edge rule: counts spliceable sentences on `Cap.mp4` (Deepgram) and `fixture.wav` (exact timings).                                                                              |
| `seam-check.mts`                   | **The real seam check** (section 3b). `fake <label>` feeds `fake-mic-take.wav` as the mic; `real <label>` opens headed Chrome for the user to record. Exports, measures both seams, writes before/after WAVs.              |
| `seam-check-gain.mts`              | The same, plus the raw take's speech level, the gain needed, applied (and as set by the app), and the noise floor at each. Run 2026-10-02 as `real5`.                                                                      |
| `check-cutoff.cjs`                 | Fake mic of continuous real speech: checks the panel refuses a take cut off by Stop.                                                                                                                                       |

### 4c. Dev-server pauses under e2e load: observed, cause unknown, not profiled

- **Observed:** under peak e2e load, `next dev` occasionally pauses for
  3–6 s. Seen in a timestamped server log during the pre-commit check runs
  for export.
- **Effect:** a command e2e test whose request lands in a pause longer than
  5 s fails. That is how the two command tests failed in one run before the
  two clean 17/17 runs export was committed on.
- **Not export:** the pause shows up in requests unrelated to export, and
  export code runs only in the browser.
- It is the likely explanation for the earlier one-off `route.fetch: read
ECONNRESET` in the unsupported-command test (inside the `mockActions`
  helper), which wasn't reproduced in 3 full runs plus 24 focused repeats.
- **Cause unknown.** It has not been profiled; don't claim a cause without
  doing so. If it recurs, run `pnpm dev > <logfile> 2>&1` yourself
  (Playwright reuses it) so the server's side is recorded.

Other one-offs, also unexplained:

- Once, every e2e test failed in the first run right after a dev-server
  restart. It wasn't reproduced in later kill-then-run cycles.
- On 2026-10-02, a dev server left running from the previous session (about
  an hour old, idle) stopped answering requests at all: no response headers
  within 30 s. Killing it and starting a fresh `pnpm dev` fixed it. Not
  investigated.
- A dev server may still be running in the background on port 3000. If it
  doesn't respond, kill it and start a fresh one.

**Measured 2026-10-03: two e2e failures during the reset/preview-speed
work.** The full suite failed once in each of two runs on the new code
(20/21, 20/21; ~2.0–2.3 GB free): `editor.spec.ts:438` (reorder playback:
the jump back below 1 s didn't come within 5 s) and `editor.spec.ts:265`
(cut editor: `route.fetch: read ECONNRESET`). The side-by-side comparison
afterwards, each run from a cold dev server:

| Run                           | Committed `180b387` | Free memory | New code | Free memory |
| ----------------------------- | ------------------- | ----------- | -------- | ----------- |
| Full suite, run 1             | 19/19               | 1,184 MB    | 21/21    | 1,874 MB    |
| Full suite, run 2             | 19/19               | 1,672 MB    | 21/21    | 2,132 MB    |
| `editor.spec.ts:438`, 5× solo | 5/5                 | 2,035 MB    | 5/5      | 1,902 MB    |
| `editor.spec.ts:265`, 5× solo | 5/5                 | 1,902 MB    | 5/5      | 1,934 MB    |

The preview-speed effect was checked separately: it never writes
`playbackRate` at 1× (0 writes counted in 5 runs; one write of 2 once 2×
is chosen), and removing it left the reorder test's jump time unchanged
(1,437–1,501 ms with it, 1,443–1,469 ms without; final playhead 1.500 in
all ten).

Two full runs and five solo runs per failing test passed on the new code.
The failures seen earlier occurred with ~2 GB free memory and match the
dev-server pause in section 4c. Cause not proven: the committed code did
not fail in the comparison, so the new code may increase load without
being the cause. Watch these two tests (editor.spec.ts:438 and :265) in
future runs.

**Measured 2026-10-03, captions work:** full suite 24/24 (2,016 MB free),
then 23/24 (2,519 MB free): `editor.spec.ts:13`, "home links to the
editor, which starts empty", whose link click didn't reach `/editor` within
5 s. That test alone from a cold server, 3×: 3/3 (19.7 s, 9.3 s, 8.6 s).
Two more full runs: 24/24 (2,001 MB free) and 24/24 (2,296 MB free). It
touches no captions code; a slow first compile of the editor route with
four workers loading it fits, but isn't proven.

**Measured 2026-10-04, transitions work:** full suite 47/48 (2.6 GB free):
`re-record-by-ear.spec.ts:26`, whose fake-mic take didn't show "New take:
0.8 s" within 10 s of Stop (the recording step, before any playback; the
transitions work changed no recording code). That test alone 5×: 5/5. Two
more full runs: 48/48 (2.4 GB free) and 48/48 (2.5 GB free). Watch it.

**CI runs that didn't pass, checked 2026-10-04:**

- **Run #32 (`57d41e0`, failed):** a logs-only commit, so the same code as
  #31 and #33, both green. Its e2e job failed `editor.spec.ts` "clips
  reorder… play back in their new order" on all three attempts (the
  playhead never went back below 1 s: stuck at 1.5 twice, then at 2.926,
  the file's end) and was flaky on "home links to the editor" (the click
  didn't reach `/editor`): the two tests already watched above. Not
  reproduced locally, even with animation frames slowed to 120 ms and
  300 ms (7/7 pass; the video never reaches its natural end before the jump
  back), so the cause is unknown; it has passed in every CI run since
  (#33–#48). Still watched.
- **Run #36 (`f8bf27a`, gray):** cancelled, not failed. CI's
  `concurrency: cancel-in-progress` stopped its e2e job when `2e67d52` was
  pushed three minutes later; run #37 for `2e67d52` (which includes
  `f8bf27a`) passed. Not a problem.
- **Run #49 (`69b7679`, failed; main red):** `transitions.spec.ts` "a fade
  goes through black" failed all three attempts: the picture looked ~0.1 s
  late (red 146–178 at 1.75 s for ~128, 30–50 at the join for black, blue
  63–72 at 2.25 s for ~128) while the sound's fade was on time. Reproduced
  locally by slowing animation frames to 150 ms (red 146–155, 64–72, blue
  70): the CI runner paints the export's canvas less often, so the file has
  fewer frames, and seeking it to 1.75 s shows the last frame painted
  before then. Not stale frames: Chrome's canvas stream only sends a frame
  when the canvas changed (checked: switching to `captureStream(0)` +
  `requestFrame()` gave the same frames, and was reverted). **Fix (test
  only):** the probe reads the time of the frame it lands on
  (`requestVideoFrameCallback`'s `mediaTime`) and judges the fade and the
  dissolve at that time; passes 3/3 with 150 ms frames. Also fixed from the
  same log: the Graphics panel's caption and title style fields had the same
  React key (both keyed by the default style), ~300 "same key" warnings a
  full run; now 0. The run's other miss, `editor.spec.ts` export (the
  square 134 px off, 1.7 s of motion, passed on retry), is unexplained.
- **Local full runs that day (2026-10-04, ~2.8 GB free):** 52/53
  (`re-record-by-ear.spec.ts`: the panel said "No speech was heard in that
  recording" although the meter had seen the tone: the recorder started
  first, so the tone was on the stream; the take's audio lacks it, cause
  unproven), 52/53 (`editor.spec.ts` reorder playback: stuck at 1.5 s, as
  in run #32), 50/53 (clip-speed export 5.28 s for 5 s, 0.03 s past the
  tolerance, as in 4f; transform preview vs export 0.042 for < 0.04; 2×
  preview speed). The four alone, 3× each: 12/12. Load-dependent; watch.
- **Run #50 (`5580231`): green, 3 flaky** (passed on retry):
  `transitions.spec.ts` fade (an extra "dark at the join" check, redundant
  with the per-frame one; removed) and dissolve (fewer than 5 preview frames
  in the overlap on the slow runner; the 880 Hz level half way 0.54 for
  0.71), `clip-speed.spec.ts` captions (the frame shown at 2.8 s was older
  than the caption's end), and `transform.spec.ts:160` (watched above).
  Measured with frames slowed to 150 ms: a frame's timestamp trails the
  moment it was painted by 0.001–0.033 s with the canvas stream as is, and
  0.008–0.08 s with `captureStream(0)` + `requestFrame()` (no better, not
  used). **Fixed in the tests:** the fade and the dissolve judged at each
  frame's own time within 45 levels (~0.09 s of the fade); the dissolve's
  sound checked as two tones whose powers add up to the full tone (both
  over 0.3), not one level on a fast ramp; two preview frames in the
  overlap; the captions judged at each frame's own time with 0.1 s either
  side of the caption's start and end, and seen both shown and gone. 9/9
  with 150 ms frames; full suite 53/53 twice.
- **Run #51 (`4acecca`): green, 1 flaky:** the dissolve's sound half way
  read 440 Hz 0.72 (on time) and 880 Hz 0.44: **on the slow runner the
  incoming clip's sound reached the recording ~0.2 s late** (its frames
  were sparse too: the frame at 0.5 s was from 0 s, at 1.5 s from 1.235 s).
  The same lead-in as section 4b, now inside a dissolve. Not fixed in the
  product (it would mean starting the incoming player's sound early); the
  test now asks for both tones over 0.3 and their powers adding up to
  0.6–1.3 of the full tone's. Locally 0.73/0.64–0.68.
- **Run #52 (`8b8e9db`): green, 2 flaky:** `transform.spec.ts:160`
  (watched) and the sped-up captions: the runner's frame for 2.35 s was
  from 2.17 s, inside the 0.1 s margin, so no frame showed the caption for
  certain. Now probed at 2.25, 2.35 and 2.45 s too; the pitch is still
  checked at 0.7 and 2.35 s, clear of the tones' edges. With frames slowed
  to 200 ms the captions held 3/3 (the 2.35 s pitch read 413 Hz once: the
  window caught a little silence at the clip's start; it has passed in
  every CI run). Local full runs: 52/53 (`annotations.spec.ts:156`, the
  "Export finished" toast not seen within 5 s; untouched code) and 53/53.
- **Run #53 (`802cdc4`): green, 4 flaky** (each passed on retry; not
  adjusted further, per the rule in section 6): `clip-speed.spec.ts:227`
  (sped-up captions), `editor.spec.ts:596` (export: frames, sound and
  length), `re-record.spec.ts:21` (a re-recorded take in playback and
  export) and `transform.spec.ts:160` (preview against export). All are
  real-time export or playback timing on the slower CI runner. **The
  watched list on CI now:** these four, plus the transitions fade and
  dissolve, `re-record-by-ear.spec.ts:26`, and `editor.spec.ts` reorder
  playback and home link.
- **Local full runs for the Audio lane (2026-10-04):** `re-record-by-ear.spec.ts:26`
  and `annotations.spec.ts:156` each missed once (both already watched,
  untouched code); recorded and carried on.
- **Run #54 (`3b54ed9`, the Audio lane): green, 2 flaky** (passed on
  retry, both watched): `clip-speed.spec.ts:227` and `re-record.spec.ts:21`.
  The new `audio-lane.spec.ts` passed first time.
- **Run #55 (`6cbec6a`, several videos): green, 1 flaky:**
  `transform.spec.ts:160` (watched), passed on retry. The new
  `multi-video.spec.ts` passed first time.
- **Local full runs for saved projects (2026-10-04):** 65/65, then 64/65
  (`transform.spec.ts:160`, watched); recorded and carried on.
- **Run #56 (`02386cd`, saved projects): red on its first attempt, green on
  a re-run.** First attempt: `audio.spec.ts:110` (fades) failed all three
  tries in its preview half: the preview set its level 17–20 times in 1.3 s
  (the test wants over 20) and its first levels started at 0.22 (wants
  under 0.15): the runner drew fewer frames; the export half measured right
  every time. Not this commit: the same preview measured locally, 4× each,
  68–70 frames on it and 66–69 on the commit before. The failed job re-run
  (attempt 2): green, the fades test passed; 2 flaky (passed on retry):
  `transform.spec.ts:160` (watched) and `audio-lane.spec.ts:271` (the lane
  preview: now watched too). **Watch the fades test's preview half on CI:**
  if it misses again, it's a slow-runner frame count.

**Measured 2026-10-04, picture transforms work: two more watched misses.**
In four full runs after the feature was finished (2.3–2.7 GB free), two
passed 36/36 and two each had one export-length miss:
`commands.spec.ts` ("clean-up, undo, redo, … export") exported 3.90 s where
it requires more than 3.9; `re-record.spec.ts` ("undo steps back …")
exported step 1 at 4.44 s for 3.96 (0.48 s long, the largest miss yet).
Each alone, 5× on the new code and 5× on the committed code (`17c9417`):
20/20. For an untransformed video the export's canvas is the same size and
each frame only adds a black fill and a transform reset. What changed was
the suite's load: `transform.spec.ts` added five real-time recordings and
exports running beside everything else. Made that spec run one test at a
time (as `re-record.spec.ts` does); then two full runs: 36/36 and 36/36.
Cause not proven; both tests join the watched list.

**Pattern across three tasks:** different simple tests have each failed
once under load and then passed every repeat: `editor.spec.ts:438`
(reorder playback) and `:265` (cut editor, `ECONNRESET`) during reset and
preview speed; the export test ("export records a real video…") during
the title card and watermark; `:13` (home → editor) during captions. Watch
all four; if one fails twice in a row, profile the dev server (section 4c)
rather than rerunning.

**Measured 2026-10-03, typed-command work:** a fifth one. Full suite run 1
(2,592 MB free): the undo/redo test (`re-record.spec.ts`, "undo steps back
…") exported step 1 at 3.66 s against 3.96 s expected (0.30 s short; 0.25
allowed). The same run's other failure was the honest-reply test still
expecting the old ability wording, a real test bug, since fixed. After the
fix: 26/26 (2,388 MB free) and 26/26 (2,831 MB free). The undo test alone,
5× on the new code and 5× on the committed code (`57d41e0`): 10/10. The new
code doesn't touch `recordEdit`; it only moved the export's start into a
hook. Not reproduced; cause not proven. Two of the five watched tests are
now export-length checks.

**Found 2026-10-03: the 2× preview-speed test's failures were the test,
not the editor.** It failed twice during the by-ear work (the jump back to
clip A "didn't happen"). Cause, reproduced on demand: when a clip ends at
the very end of the source, the browser pauses the video itself until the
editor's next frame jumps on; a slow frame makes that pause last tens of
ms, and the test's sampler (`playAndSample`) treated the first paused
sample as the end of playback and stopped watching before the jump. A
throwaway spec holding animation frames back 200 ms near the end showed
the editor still jumps every time (3/3, paused ~40 ms at the end), and the
same hold-back made the real 2× test fail at that line 3/3. Fixed in the
test: playback counts as stopped only after 0.5 s paused. With the
hold-back the jump check then passes (a later check, the Original view's
speed, failed only under that artificial hold-back, never in a real run);
without it 3/3. The reorder test's one failure under load
(`editor.spec.ts:438`) has the same clip layout and may be the same
mechanism; not checked. The by-ear e2e test also moved to its own spec,
`re-record-by-ear.spec.ts`: inside `re-record.spec.ts`, whose tests run one
after another, its extra real-time recording and export were followed by
failures in the file's other timing checks.

**Motion graphics runs (2026-10-04, local, full suite ×6):** the reorder
test (now `editor.spec.ts:444`) failed once more under load, the same way
(the jump back wasn't below 1 s: 1.5), and passed 3/3 alone. Known flake,
left as is. The motion spec's first versions read slide and pop positions
at one fixed time, and failed when an export frame landed a few
hundredths early; they now compare against the eased value at the frame's
actual time, or sample several frames through the pop.

**Logo runs (2026-10-04, local, full suite ×2, ~1.4 GB free):** 5 and 3
failures, all different, none touching the logo: export lengths 0.25 s off
(section 4f), an export's tone missing at one probe, elements not shown
in time (transform ×3, re-record ×2, projects). All 8 passed when rerun
together (2 workers). Memory pressure, as in section 4d; not changed.

**CI run 59 (2026-10-04/05): the fades preview test, fixed with measured
bounds.** `audio.spec.ts`'s fades test failed on CI in all 3 tries, twice
over (attempt 2 too): it counted the preview's level changes (more than 20)
and wanted the first under 0.15, but CI set only 16–20, the first at 0.18.
The editor was right; the test assumed a fast machine. It now logs each
level with the playing video's time and checks each is the fade's value at
that time (error under 0.02), plus coverage: first under 0.5 s, last over
0.6 s, no gap over 0.4 s. Measured locally: error 0 at any speed; at 4× CPU
throttling (CI's pace, ~22 levels) gaps up to 0.09 s; at 8× (14 levels)
gaps up to 0.19 s, first as late as 0.16 s, last as early as 0.84 s; 5/5 at
8×. The same run's `audio-lane.spec.ts` test "the preview plays a lane item from where playback is"
failed once (two starts logged, not one) and passed on retry: flaky,
recorded, not changed.

**The sped-clip zoom test sat on a step.** It read a frame at 4.3 s, just
after a zoom ending at 4.2 s, where the zoom drops from 1.5 to 1. On CI
that frame was 4.246 s, 0.046 s past the drop, and the export's picture
lags its timestamps by up to ~70 ms (the same run: 1.13 at 3.604 s, which
is the zoom at ~3.53 s), so it could have read 1.5. The zoom is now 3.1–3.9
s and the frames 1, 3.5 and 4.3 s (0.4 s past the drop): 3/3 locally, worst
error 0.05 of the 0.12 allowed.

**Redesign stage 2 runs (2026-10-05, ~1.3–1.8 GB free):** full suite
84 tests: `re-record.spec.ts:21` failed once (a take's "New take" line not
shown in time) and `clip-speed.spec.ts:142` once (exported 3.31 s for 3 s,
section 4f); both passed alone (1/1, 2/2). Recorded, not changed.

**Clearer editor runs (2026-10-05, ~0.6–1.5 GB free):** the last full run
83/90; the 7 failures (typed-command replies slow under load, export
lengths and tones off, an export toast late) all passed alone or with one
worker. Recorded, not changed.

**CI run 61 (2026-10-05, a logs-only commit, same code as green run 60):
the export drops frames under load, and two tests read frames as if it
didn't.** `transform.spec.ts`'s flip/turn/crop test failed in all 3 tries
(the cropped square 0.057–0.087 of the frame off the preview's, 0.04
allowed), and the sped-clip zoom test failed once (a frame read at 4.3 s
was the one at 4.005 s, and still showed the 1.5 zoom that ends at 3.9 s).
Reproduced locally with Chrome's CPU throttled 4× (3/3 failures). **Not a
crop or export bug:** seeking the exported file to 1.5 s landed on a frame
from 1.377–1.441 s, the square (moving 80 px/s) correspondingly lower;
moved back by the frame's own time, export and preview agree within ~0.02
at 1× and 4×. The real-time export just drops frames when the CPU is
starved, and a dropped frame's picture can also be older than its
timestamp (up to 0.16 s at 8×; at least 0.105 s on CI).

- Transform test: reads each export frame's time (`requestVideoFrameCallback`)
  and compares the square's position moved back to 1.5 s; pixel probes at
  the square's centre (holds 0.375 s either way); "not where it would be
  unflipped" is now the corrected centre within 10 px of 150 (measured
  145–151; unflipped would be 170).
- Zoom test: a frame may show the zoom of any time up to 0.25 s before its
  timestamp, within 0.05.
- Both: 4/4 at 8× and 4/4 at 4× throttling, and the full spec files pass
  unthrottled. The other three tests that failed once in run 61 (multi-video
  export length, re-record, dissolve) passed on retry: flaky under the same
  load, recorded, not changed.

**CI run 75 (main, after PR #5), 2026-10-05: two export tests failed every
try, 9 more flaky. Fixed once for all export readers.** The motion title
test and the clip-speed captions test read frames at fixed times and failed
when the export had dropped frames (the same cause as above). Instead of
fixing them one at a time, every spec that reads an exported file now goes
through one helper, `e2e/export-frames.ts`:

- `exportVideo(page)` exports and returns the file. `readExportFrames(page,
bytes, times, read, { size, args })` seeks each time, records the time of
  the frame actually shown (`shown`, via `requestVideoFrameCallback`) and
  runs `read` (sent to the page as source; constants go in `args`) on it.
  `readToneLevels` reads tone levels at the asked times, because sound
  doesn't drop like frames do.
- A frame's picture can be from `FRAME_LAG_SECONDS` (0.25) before its time
  to `FRAME_LEAD_SECONDS` (0.15) after. These were measured at 4× CPU
  throttling: a picture up to ~0.12 s newer, and up to ~0.18 s older (about
  0.18 s on CI run 75). `rangeOverLag`, `surelyAfter` and `surelyBefore`
  judge a check only where every moment the frame could hold is on one side
  of an edge.
- 12 readers moved: annotations, audio-lane, clip-speed, color-and-text,
  editor, graphics, logo, motion, multi-video, projects, transform (×2),
  transitions. Tests on something that moves or switches at a time ask for
  frames every 50–100 ms. Under load several asks land on one frame, and
  they need some to fall clearly on each side.
- The title and captions tests pass 3 out of 3 at 4× throttling. At 8×
  the export keeps only one frame every ~0.45 s, which is longer than the
  0.4 s caption, so no frame check can resolve it; 4× is the target (CI
  lands between the two). At 4× the export length still varied by ±0.27 s
  once; see 4f.

**Editor redesign run, 2026-10-06 (full suite, local, 4 workers):** the
re-record and re-record-by-ear specs failed under load when the fake mic
delivered silence ("No speech was heard in that recording"); both pass
alone and with one worker. The contact form's send timed out once on a
cold compile, then passed. Not changed.

**CI on PR #7 (stage 2):** `transform.spec.ts`'s flip test failed all three
tries: the square read 11–14 px off 150 by its frame's time. Locally one
run had a frame stamped ~1.16 s whose picture showed the square at its 1.5 s
place, 0.34 s apart: the test video is recorded in real time too, so its
frame times can drift from where the square was drawn, on top of the
export's own lag and lead. The test now allows 0.35 s either way for the
square's position (`SQUARE_SLACK_SECONDS`); the flip and turn are proven by
the pixel probes (orange at the square's centre, the pinned red box), which
don't depend on time. The clip-reorder and export-length tests also failed
once each in that run and passed on retry.

**CI red on `main` after PRs #8 and #9 (2026-10-06), fixed by running e2e
one test at a time.** Every run on `main` and on PR #10 had several export
and playback tests fail and pass on retry, and one fail all three tries,
a different one each time: the audio fades (`48df773`), the saved
project's export (`36c980d`), the lane preview starting 0.12–0.16 s late,
and the multi-video dissolve (an export with no frame between 0.6 and 1 s).
Each passed locally. The cause was load: the `e2e` job ran four tests at
once on one 4-core runner beside the dev server compiling pages, and every
editor test records and exports video in real time, so the timings drifted.

The fix keeps every test and every tolerance as it was. CI's `e2e` job is
now a matrix of four shards (`--shard=n/4`), each on its own runner with
`--workers=1`, so no two tests share a CPU and the wall time stays about
the same. Retries stay at two. Locally the config still runs four workers.

The first run with the shards had no flaky failures at all, and one real
one the noise had been hiding: a logo attached in the chat switched the
shared tool panel to Text & logo, hiding the chat's "Using logo.jpg as the
logo." (`logo.spec.ts`). A logo from the chat now leaves the chat open; it
is still on the video, picked.

**Local, 2026-10-07:** `commands.spec.ts`'s clean-up/export test failed 1
run in 3 on this machine, both on `main` and on the highlights branch
(export 3.6 s or 3.9 s against > 3.9 s; once clean-up found no silence in
the recorded take). It passes on retry. Not changed.

**Local, 2026-10-07 (Make it branch, ~1.4–2 GB free):** in one full run,
`clip-speed.spec.ts:130` (exported 4.69 s for 5 s) and
`multi-video.spec.ts:175` (6.20 s for 4.75 s) missed on export length, the
memory-pressure miss of 4f; `editor.spec.ts:331` waited past 5 s for a
command's reply (the request was still in flight when the test ended). All
three passed when run again. Not changed. A second full run was stopped by
Claude Code for low memory (many tests failing as the machine starved); the
user chose to let CI's e2e shards be the second check.

**Local, 2026-10-08:** `make-it.spec.ts:144` (the face-following export)
measured the square at 0.73 of the frame at 1 s, against < 0.7: the frame
shown was a little late, so the square had moved on. Passed twice on rerun.
Not changed.

- 2026-10-08, PR 2 (site screenshots), local full run on a production build:
  `commands.spec.ts:62` (export as a command) and `clip-speed.spec.ts:130`
  ("exported 5.28 s for 5 s") failed with four tests at once; both passed
  run alone. Export timing under load (see 4f); that change touches no
  editor code.

- 2026-10-08, the mockup-fixes PR, local full run on a production build:
  `re-record-by-ear.spec.ts:27` failed (an element not found in time) with
  four tests at once and passed run alone; that change touches no
  re-record code.

- 2026-10-10, the brief-and-overlaps branch, local full run on a production
  build (~2.3 GB free): `projects.spec.ts:465` (save and open as commands)
  failed once with `route.fetch: read ECONNRESET` (the server dropped a
  request under four workers) and passed on a rerun; that change touches
  no projects code. In the second full run the machine's network dropped
  (`net::ERR_NETWORK_IO_SUSPENDED`): `projects.spec.ts:371` and the new
  `make-it.spec.ts:1403` failed on a page load, and `multi-video.spec.ts:239`
  got a 2.0 s recording for 3 s; all three passed on a rerun.

- 2026-10-11, the paid-actions sign-in branch, a full local run with
  accounts off (as CI), on `pnpm dev` with four workers: `motion.spec.ts:196`
  (an export 5.49 s for 4.5 s), `re-record.spec.ts:22` and
  `re-record-by-ear.spec.ts:27` (a fake-mic take not the expected length)
  failed, and all three passed on a rerun. Real-time recording under load;
  none of them calls a server action.

- 2026-10-11, the boot-exit follow-up, a full local run with accounts off:
  `commands.spec.ts:62` failed once with `route.fetch: read ECONNRESET` (the
  dev server dropped a request under four workers) and passed on a rerun.

- 2026-10-11, the contact-limit branch, a full local run with accounts off:
  `clip-speed.spec.ts:130` (exported 3.59 s for 3 s) and `motion.spec.ts:236`
  (a pop-in frame missed) failed and passed on a rerun; real-time export
  under load, neither touches the contact form or sign-in.

- 2026-10-14, CI on PR #59 (`useReRecord`), shard 1:
  `annotations.spec.ts:131` (boxes and blurs in the preview and the export)
  failed once on a frame's brightness in the blurred area (`a frame inBlur:
[0.109, 0.806, 1.786, ...]`) and passed on CI's retry; real-time export on
  the CI runner, and the PR moved only re-recording's state and handlers.

- 2026-10-14, local branch `local/architecture` (`useEditorTools`), a full
  run on a production build on :3200 (2.4 to 3.0 GB free): `make-it.spec.ts:808`
  (a reel of a meeting) timed out at 150 s waiting for the export's download,
  then passed twice when rerun alone against the same server (2.1 GB free).
  Real-time export under load. Make it builds no tool panels, and the move
  changed no line of them.

### 4d. Low memory on this machine (observed 2026-10-02)

- The machine has 7.5 GB of RAM. With many apps open (Edge WebView2 apps,
  Chrome, Docker's WSL VM, Loom, VS Code, Discord, MySQL, Notion, ChatGPT)
  it reached 24 GB committed, with 200–400 MB free and 5,000–60,000 pages
  read from disk per second.
- **Effect on export:** the browser stalled for up to 1.9 s at a time, so
  exports dropped to 159–225 frames for a 13.5 s take (vs 336–384 once
  memory was freed) and had picture freezes of up to ~2 s. One export came
  out empty (110 bytes), one lost sound partway, and one took 22 s for a
  13.5 s video.
- **Effect on the dev server:** the editor page didn't load within 30 s.
- After the user closed several apps (committed memory down to 15 GB),
  exports were clean again. **Check free memory before any real-time
  measurement.**
- Whether this also explains the dev-server pauses in 4c is **not
  established**. It fits, but nothing was measured during those pauses.
- Separately, a dev server started as a Claude Code background task breaks
  when the task hits its time limit: it keeps listening, but its workers
  crash with `EPIPE` and every page returns 500. Start it with the longest
  timeout, or restart it when that happens.

### 4e. How the session-log script behaves (by design)

`~/.claude/extract-log.py` is the trial's standard script; don't modify
it. Each run it:

- overwrites the whole log file, so header stats are rewritten every time
- keeps every prompt but only the **final** reply to each prompt, so an
  earlier reply to the same prompt is replaced
- logs whichever transcript was modified most recently, so the first
  message of a new session can rewrite the previous session's log

Rewritten stats and a replaced earlier reply are expected. After a session
switch, run it by hand so the current session's log exists. Never hand-edit
a log; if a log from a **different** session shows deletions, show the user
and wait for their decision.

### 4f. Export length under memory pressure: measured 2026-10-03, not fixed, user warned

**Yes, real exports can come out the wrong length,** and only under memory
pressure. Measured with an instrumented export (scratchpad
`diag-export.spec.ts`: wraps `MediaRecorder` start/pause/resume/stop, the
offscreen `<video>`'s play/pause, the export's `AudioContext` clock and
`requestAnimationFrame` gaps, then reads the file's video and audio track
lengths and the tone edges in its audio). The edit: a ~2.9 s take split at
~1.5 s with the second part moved first. Each miss is the larger of the
file's two track errors; the raw per-export lines are `diag-pressure*.txt`
in session `e275341f-…`'s scratchpad (re-checked against this table
2026-10-03).

| Condition                                      | Exports | Within ~40 ms | Long                      | Short              |
| ---------------------------------------------- | ------- | ------------- | ------------------------- | ------------------ |
| Alone, ~2.1 GB free                            | 4       | 4             | 0                         | 0                  |
| Inside a full e2e run (4 workers), 2.3 GB free | 8       | 8             | 0                         | 0                  |
| A 2.2–2.5 GB memory hog, 0.3–0.7 GB free       | 37      | 32            | 3 (+0.11, +0.13, +0.23 s) | 2 (−0.42, −0.52 s) |

**Long: the export loop pauses the recorder late.** The loop checks each
animation frame whether the segment has ended; a main-thread stall of
150–270 ms right at a segment's end leaves the recorder running for it (a
recording window 1.65 s instead of 1.51 s; the offscreen video found 151 ms
past the segment end when paused). What fills the extra time depends on the
segment: one ending at the end of the source adds silence over a held frame
(audio edges show 0.16–0.18 s of inserted silence); **one ending mid-source
records up to the stall's length of whatever follows it in the source**:
in a real edit, often cut material (measured: 151 ms; in this test edit it
was the start of the other clip). The audio clock kept pace with wall time in
every window (within ~10 ms) and the video never reported `waiting`, so
decoding and the audio clock aren't the cause.

**Short: the file loses its last ~0.5 s.** The recorder ran its full time
(3.0 s), but both tracks stop together ~0.5 s early (video 2.416 s, audio
2.400 s for a 2.920 s edit) and the audio's last edge (the tone ending at
~2.46 s) is missing: the tail never reached the file. Both short exports
had long frame stalls (167 ms, 583 ms) while recording. **Likely cause, not
proven:** under load the VP9 encoder falls behind, and what's still queued
when `stop()` is called is dropped.

**Not fixed, because none of these is cheap, safe and verified yet:**

- Short: pause the recorder and give the encoder a moment to drain before
  `stop()` (cheap, adds ~1 s at the end, no length change). Unverified: the
  cause is a hypothesis, and at ~2 in 37 exports under pressure, showing it
  works needs dozens of exports each way.
- Long: mute the source at the exact segment end on the audio clock, and
  stop drawing frames past it. Stops cut material leaking in, but not the
  extra length, and the mute could clip the last ~40–65 ms of kept audio
  (the lead-in offset in section 4b) unless measured.
- Either: warn the user. Honest, cheap; not a fix. **Built 2026-10-03,**
  next paragraph.

**The warning, as built** (`lengthMismatch` and `fileSeconds` in
`export-video.ts`, used by `useVideoExport`): after the download starts and
the button is back, the file's real length is read from a `<video>` (a
recorder WebM has no duration header, so it seeks past the end to force a
scan, as the editor does) and compared with `totalSeconds(segments)`. More
than **0.25 s** off (the e2e tests' tolerance; healthy exports measure within
~40 ms) and a destructive toast, "<name> came out the wrong length" / "This
export came out X s too long/short, probably because the computer ran low on
memory. Close other apps and export again.", replaces "Export finished". If
the length can't be read, that's reported with `captureClientError`
(`feature: 'export_length'`) and the normal toast shows. Like every toast it
closes after 5 s. It compares the whole file, so a long miss in one segment
and a short one in another could cancel out; never seen, as no measured export had both.

This explains the e2e export-length failures in section 4c (0.39 s long,
0.30 s short): the suite's own load, plus low memory, causes both. With
2+ GB free the export was accurate in every measured run.

---

## 5. Remaining queue (as originally given) and status

1. ~~Confirmation step before an AI command executes~~: done (`72c8d35`)
2. ~~Honest "I can't do that yet" handling~~: done (`a0d6159`)
3. ~~Split a clip at the playhead into two independent clips~~: done (`6eb5bb3`)
4. ~~Reorder clips manually by dragging~~: done (`ae17d92`)
5. ~~Merge multiple adjacent clips~~: done (`9404c4e`)
6. ~~Before/after comparison toggle, preserving the playhead~~: done (`0b4b485`)
7. ~~Export a real, playable video reflecting all edits~~: done
   (`2c2f0a5`).
8. ~~Re-record and splice (audio-only v1)~~: done (`3df2f89`, `15cd03e`,
   `e42ad94`; section 3b). Next, when the user approves: set-by-ear splice
   handles for sentences without a clean pause.
9. ~~Full undo/redo~~: done (`f3c0de5`, section 3c).
10. ~~Reset to original, preview speed~~: done (sections 3c, 3d).
11. Clip speed: not started; explain its effects and wait for the user's
    decision first.
12. ~~Motion graphics v1 (title card, watermark)~~: done (section 3e).
13. ~~Automatic captions~~: done (section 3f).
14. ~~Every editor action as a typed command~~: done (section 3g).
15. ~~Annotation layer, 80/20 slice~~: done (section 3h). Not built: the
    freehand pencil, text color, a text command.
16. ~~Audio problem flags~~: done (section 3i).
17. ~~Set-by-ear splice joins~~: done (section 3j), with a 10 ms fade at a
    by-ear take's edges. A re-record with the fade in the user's own voice
    is the last ear check.
18. ~~Picture transforms (crop, rotate, flip) and pixelate~~: done (section 3k).
19. ~~Clip volume, mute and fades~~: done (section 3l).
20. ~~Clip speed~~: done (section 3m).
21. ~~Transitions between clips; delete and duplicate~~: done (section 3n).
22. ~~Color adjustments, text styling and the pencil~~: done (section 3o).
23. ~~Separate audio clips (the Audio lane)~~: done (section 3p).
24. ~~Several videos in one project~~: done (section 3q).
25. ~~Save and reopen projects~~: done (section 3r).
26. ~~Motion graphics: entrances and exits, a lower third, a zoom~~: done
    (section 3s).
27. ~~The logo by hand (drag, resize, PNG or JPG); captions checked~~: done
    (section 3t).

Make it (section 3ze): part 1 done. Later parts, as the user listed them:
create-from-scratch mode, follow-up requests, the second plan check.

Not yet queued by the user:

- more than one title, lower third or zoom; a zoom that pans
- any new abilities must be added to `COMMAND_ABILITIES`/`EDITOR_ABILITIES`
  in `command-reply.tsx`, so the honest reply stays accurate

---

## 6. Standing rules (carry these forward)

- **Commit and push on your own once a task is finished and every check
  passes; stop and ask if anything fails or is destructive** (user's rule,
  2026-10-03, also in `CLAUDE.md`). One commit per finished piece of work
  (e.g. all of undo/redo), not per step.
- **Code once per finished feature; the session logs with every feature**
  (user's rule, 2026-10-04, replacing "logs only when the user says they're
  stopping"; also in `CLAUDE.md`): after each finished feature, refresh the
  logs, run the secret scan, and commit them as a separate commit after the
  code commit, pushed in the same push. Commit the logs exactly as the
  script wrote them (section 4e).
  - One `feat(...)` commit per feature (Conventional Commits), then the
    `chore(logs): …` commit, then one push (one CI run).
  - Refresh `.claude-logs/` with `python3 ~/.claude/extract-log.py` (it
    writes the session modified last: the current one).
  - Leak-check it with: `grep -rhoE 'sb_secret_[A-Za-z0-9_-]{10,}|sb_publishable_[A-Za-z0-9_-]{10,}|eyJhbGciOi[A-Za-z0-9_.-]{20,}|AIza[0-9A-Za-z_-]{35}' .claude-logs/`.
    A bare pattern grep matches the log's own text describing the grep;
    that's a false positive.
  - Also run `node scripts/check-secrets.mjs --all`.
  - Commit with `chore(logs): update session log for …`, in the same push
    as the feature.
  - End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Git author is "Alishba Saboor".
- **After each push, check that commit's GitHub Actions run and wait for
  it** (user's rule, 2026-10-04, also in `CLAUDE.md`). If it fails, read the
  failure, fix it and push the fix before the next task; never start a new
  feature on a red `main`. `gh` isn't installed on this machine: the REST
  API works with git's stored token, read inside the command and never
  printed (the session logs are committed):
  `T=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')`,
  then `curl -H "Authorization: Bearer $T" https://api.github.com/repos/8xplays/t1-alishbasaboor/actions/runs?head_sha=<sha>`
  (jobs: `/actions/runs/<id>/jobs`; a job's log: `/actions/jobs/<id>/logs`).
- **A test flaky on CI that passes locally and on retry: record it in 4c
  and carry on; stop only for a failure that persists** (user's rule,
  2026-10-04, also in `CLAUDE.md`). Don't keep adjusting tests for it.
- **Test thoroughly before committing:**
  - unit tests, e2e (run the full suite twice, ideally from a cold server),
    lint, typecheck, Prettier, and a production `pnpm build`
  - `pnpm build` is what catches React Compiler errors (e.g. `try/finally`
    in a component isn't supported, nor a `? :`, `&&` or `?.` inside a
    component's `try/catch`: use `if` statements there); ESLint and `tsc`
    don't, and in `next dev` the page just never loads
  - **real audio/video verification** where relevant, measured against the
    actual output, not just "the code runs"
- **Find the actual root cause before changing anything; don't guess.**
  Read the error, the snapshot or the screenshot, and log real values. If
  something can't be reproduced, say so instead of inventing a cause.
  Nothing gets committed until failing tests pass and you know why they
  broke.
- **Hand tests never reach a provider** (from 3zx, where one did: about
  $0.0006 of Gemini). Next's env loader deletes an EMPTY variable and loads
  the real one from `.env.local`, so `GEMINI_API_KEY=''` is not a block.
  For any hand test against a running server, remove the key from its
  environment entirely (run from a copy without `.env.local`, or set an
  invalid non-empty value such as `invalid-key-for-tests`), and prove the
  key is absent before the first call. Prefer checks that stop before the
  provider (a refused or invalid request).
- **Never guess on anything destructive.** Pick the simpler, safer option
  when unsure, and document why. Never delete or overwrite the user's
  recordings.
- **Don't break, delete or majorly restructure existing features.**
- **Clean, minimal code matching the repo's patterns:**
  - no speculative handling, no duplicated logic
  - comments only for the non-obvious "why"
  - icons only via `src/components/ui/icons.tsx` (alphabetical)
  - user-facing strings in `messages/en.json`
  - errors through `captureClientError`/`AppError`
  - AI calls only through `src/server/ai/*`
- **After editing `messages/*.json`, restart the dev server** (kill the
  process on :3000) before e2e.
- **A duplicate key in `messages/*.json` fails silently:** the later one
  wins (an ability named `title` once replaced the "I can't do that yet."
  heading). Check new keys against their siblings.
- **Writing code edits from shell heredocs** loses `\d` and other escapes
  inside JS template strings. Use the Edit tool for regexes.
- **Work autonomously and efficiently** through the queue, without stopping
  to ask unless genuinely blocked. Write a short plain-language summary
  after each feature, and flag anything fundamentally broken.
- **Privacy and security:**
  - never print or commit API keys (`.env.local` is gitignored)
  - keep the user's voice recordings and exports out of the repo
  - no hosted accounts (everything runs locally)
