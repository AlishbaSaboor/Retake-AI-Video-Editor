# Credits

## Footage on the website

The landing page's screenshots and before/after videos (`public/site/`) show
one stock clip, the sun rising over a mountain range (filmed upright, 9:16),
edited in Retake:

- **"Stunning Sunrise Over Serene Mountain Range"** by **Yogendra Singh**, on
  Pexels: <https://www.pexels.com/video/stunning-sunrise-over-serene-mountain-range-35571635/>
- Licence: the [Pexels License](https://www.pexels.com/license/) — free to
  use, attribution not required (given here anyway), may be modified.

No people appear in the clip or in any screenshot.

The clip has no sound. To take the screenshots, `e2e/site-shots.ts` records a
working copy with a stand-in sound track (quiet noise shaped like syllables
where the words would be), so the editor's transcript steps run. The words
(a voice-over) shown in the transcript, captions, plan and highlights are
written for the clip and answered by the tests' fake AI; no AI service was called. The sound
track is never played on the site, and the downloaded original is not in this
repository.

The stills, the posters and the before/after videos are cut from the
full-resolution download with ffmpeg (for example the one in the
`imageio-ffmpeg` Python package); the screenshots are taken in the app at 2x.

To take the pictures again: download the clip, start a production build of
the app (restart it after, so it serves the new files), then

```sh
SHOTS_CLIP=/path/to/clip.mp4 FFMPEG=/path/to/ffmpeg E2E_BASE_URL=http://localhost:3100 pnpm shots
```
