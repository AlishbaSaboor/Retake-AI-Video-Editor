# Retake — progress notes (handoff)

Written 2026-10-02 at the end of a long Claude Code session, so that a fresh
session with no memory of it can carry on. Read this whole file, then
`AGENTS.md` and `CLAUDE.md`, before touching anything.

> **Read this first: where things stand right now**
>
> - Branch `main`. Updated 2026-10-05.
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

**Current totals:** 333 unit tests (`src/**/*.test.mts`) and 70 e2e tests.
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
- **Home → editor:** `editor/editor-start.ts` holds the picked file and the
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
