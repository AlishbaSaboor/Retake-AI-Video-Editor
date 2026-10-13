# Retake

A video editor in the browser for fixing an existing recording instead of
shooting it again. Load a video and Retake transcribes it, finds filler
words and long pauses, and lets you cut them, re-record one bad sentence and
splice it back in, or rearrange the video on a timeline. Every edit can be
made by hand or by a typed or spoken command, which is shown as a plan you
confirm first. **Make it** turns a video into a reel, an ad or a cleaner cut
from one request; **highlights** finds the best moments. The edit is
exported as a video file, and projects can be saved, all in the browser.

How it's built, why, and its known limits: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Stack

| Layer           | Choice                                                        | Note                                                                                                                                            |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack, React Compiler) + React 19 | Server actions for every server call; see `AGENTS.md` for the v13/14 → 16 changes that matter                                                   |
| AI              | Gemini 3.5 Flash-Lite (`@google/genai`), Deepgram `nova-3`    | Gemini parses commands, finds highlights and plans Make it; Deepgram writes the transcript, fillers included. Called only from `src/server/ai/` |
| Database        | Postgres through Prisma 6                                     | AI cost (`ai_usage`), daily AI allowances (`ai_allowances`), contact messages. CI writes the migrations                                         |
| Auth            | Supabase Auth, run locally in Docker                          | Sign-in only; Prisma owns all application data                                                                                                  |
| In the browser  | Web Audio, canvas, `MediaRecorder`, IndexedDB                 | Audio analysis, the preview, the export, and saved projects                                                                                     |
| Styling         | Tailwind CSS v4                                               | Tokens in `src/app/globals.css`; see `DESIGN.md`                                                                                                |
| i18n            | next-intl                                                     | UI strings in `messages/en.json`                                                                                                                |
| Observability   | Sentry, PostHog, a Pino logger                                | Sentry and PostHog do nothing until their keys are set; the logger always runs                                                                  |
| Testing         | `node --test` (unit) and Playwright (end to end)              | Both with the AI faked: no test calls a provider                                                                                                |
| Package manager | pnpm                                                          | Node 22.18 or later                                                                                                                             |

## Architecture in short

- **The video stays in the browser.** It's played from a local file, edited
  as a list of clips over the original, exported by replaying the edit and
  recording it, and saved to IndexedDB. Only the decoded audio (to
  Deepgram), text (to Gemini) and, for Make it, one small picture every
  2 seconds (to Gemini) leave the browser.
- **Every AI call is a server action behind three checks**, in order: the
  user is signed in (it fails closed), the input is valid, and the user has
  daily allowance left for that kind of call. Then a wrapper calls the
  provider with a time limit and records the call's cost.
- **Filler words are cut only where the audio has a real gap** on both
  sides, never at the transcriber's timestamps.

The full picture, with a diagram and the reasons: [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it locally

You need Node 22.18 or later, pnpm, and Docker Desktop (for Supabase).

```bash
pnpm install                      # also generates the Prisma client
pnpm dlx supabase start           # Postgres and Auth in Docker (the first run downloads ~2 GB)
pnpm dlx supabase status          # prints the local URLs and keys
cp .env.example .env.local        # then fill it in (below)
pnpm exec prisma migrate deploy   # create the tables
pnpm dev                          # http://localhost:3000
```

In `.env.local`, from `supabase status`: `DATABASE_URL` and `DIRECT_URL`
(the local Postgres), `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Add `GEMINI_API_KEY` and
`DEEPGRAM_API_KEY` for the AI features; without them the app runs, and those
features fail with "The AI isn't available right now. Try again later." (the
server log names the missing setting). `CONTACT_IP_SECRET` is optional locally. Every
variable is explained in `.env.example`. Create an account on the sign-in
page to use the app.

## Production settings

| Setting                                                            | Needed for                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | The database (validated at boot)                                             |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sign-in. Without them the server logs which is missing and exits             |
| `CONTACT_IP_SECRET`                                                | The contact form's per-sender limit. Without it the server logs it and exits |
| `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`                               | The AI features (the server starts without them)                             |

`CONTACT_IP_SECRET` is the key a sender's IP is hashed with, so no IP is
stored. Make it random and at least 32 characters:

```bash
openssl rand -hex 32
```

Set it in the host's environment, never in the repo, and keep it the same
across deploys (changing it resets every sender's count). What a hosted launch
would still need, including request-size limits, is in
[ARCHITECTURE.md](ARCHITECTURE.md#scope-local-first-not-deployed); the GitHub and Vercel
setup is in `docs/CI_CD_SETUP.md`.

## Tests

```bash
pnpm test        # unit tests: node --test over scripts/*.test.mjs and src/**/*.test.mts
pnpm test:e2e    # Playwright: starts the app itself unless E2E_BASE_URL is set
```

Unit tests run the real code with only what can't run under Node swapped
out (module mocks for the session, the AI SDKs and the database). The
end-to-end tests drive the real app in Chromium and answer every AI request
with canned results, so no test spends money.

## What CI checks

Every pull request runs (`.github/workflows/ci.yml`):

- **check**: lint, typecheck, Prettier, `check:env`, `check:secrets`,
  `check:standards` and the unit tests;
- **build**: a production build (React Compiler errors fail it);
- **e2e**: the Playwright suite, split across four runners;
- **migrations**: replays every migration on a clean Postgres, writes and
  commits any missing one from the schema, checks for drift, and
  `check:rls` (row level security on every table, no policies);
- **ai-models**: every model the code calls is still priced by OpenRouter;
- **commits**: Conventional Commits headers.

A Claude review runs on each pull request too, and
`.github/workflows/deploy-migrations.yml` applies migrations to production
on every push to `main`.

## Working in this repo

- `AGENTS.md` indexes the engineering rules in `docs/rules/` (database,
  migrations, auth, AI usage, errors, logging, secrets and more); read the
  rule before touching its area. `CLAUDE.md` adds the Claude Code skills and
  session-log conventions.
- Change the Prisma schema in `prisma/schema/`; CI writes the migration
  (`docs/rules/migrations.md`).
- Every push is a paid CI run: check locally first (`docs/rules/commits.md`).
- Progress, decisions and open issues are kept in `PROGRESS_NOTES.md`.

## Scripts

| Command                                    | What it does                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`             | Next.js                                                                            |
| `pnpm lint` / `typecheck` / `format:check` | The CI gates                                                                       |
| `pnpm test`                                | Unit tests, `scripts/*.test.mjs` and `src/**/*.test.mts`                           |
| `pnpm test:e2e`                            | Playwright; starts the app itself unless `E2E_BASE_URL` is set                     |
| `pnpm check:env`                           | Every `process.env.X` in `src/` is declared in `.env.example` and `src/lib/env.ts` |
| `pnpm check:secrets`                       | No credential in the source or the committed session logs                          |
| `pnpm check:standards`                     | Every standard in `docs/STANDARDS.md` is wired up                                  |
| `pnpm check:rls`                           | Every table has row level security on, no policies, never forced                   |
| `pnpm check:ai-models`                     | Every model the code calls is still priced by OpenRouter                           |
| `pnpm prisma:generate`                     | Regenerate the Prisma client after a schema change                                 |
| `pnpm prisma:migrate:generate:check`       | Dry-run the migration CI would write                                               |
| `pnpm db:run-once`                         | Apply `prisma/run-once.sql` once, as a deploy does                                 |
