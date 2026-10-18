# Retake

An AI video editor for fixing and polishing recordings you already have.
Load a video, and Retake helps you clean it up, edit it by hand, or turn it
into something new, without shooting it again.

## What it does

**Make it with AI.** Turns a recording into a reel, an ad or a TikTok.

- Type what you want, answer a few quick questions, and approve the plan before anything changes.
- Pick one of four looks: Clean, Bold, Cinematic or Playful.

**Manual editing.** A timeline editor.

- Trim, split, merge and reorder clips.
- Add captions, titles, a logo, zoom, colour, speed changes and transitions.
- An audio lane, a before/after comparison, and export to a video file.

**Automatic cleanup and re-recording.**

- A transcript, with silences and filler words found for you.
- One-click cleanup, or cut fillers one at a time.
- Re-record a single sentence and splice it back in.

## How it works

Your video and your projects stay in the browser: editing, preview and export
run there, and saved projects are kept in the browser's storage (IndexedDB).
For the AI features only, a video's audio goes to Deepgram (transcripts and
spoken commands), and Gemini receives text (typed commands and the
transcript) and, for Make it, small still frames taken every 2 seconds. The
video file itself is never uploaded. Sign-in runs on a local Supabase in
Docker. The server also downloads AI model prices from OpenRouter, which
receives none of your data. Sentry and PostHog send nothing unless their keys
are set. Details are on the Privacy page, at `/privacy`
([source](<src/app/[locale]/(site)/privacy/page.tsx>)).

## Stack

- Next.js 16 and React 19, TypeScript, Tailwind CSS 4, next-intl
- Postgres through Prisma
- Supabase Auth, run locally in Docker
- Gemini and Deepgram for the AI features
- Browser-side export, with projects saved in IndexedDB
- pnpm, Playwright, GitHub Actions

## Folder structure

```
.github/        CI workflows
docs/           engineering rules and CI/CD setup
e2e/            Playwright end-to-end tests
messages/       UI text (en.json)
prisma/         database schema and migrations
public/         static files and footage
scripts/        repo checks and database helpers
supabase/       local Supabase config
src/
  app/          pages: landing, privacy, sign-in, home, projects, Make it, the editor
  components/   shared UI components
  i18n/         locale routing
  lib/          shared code: env, errors, analytics, flags, Supabase helpers
  server/       server actions, AI provider wrappers, database client
```

## Run it locally

You need:

- Node 22.18 or later, and pnpm
- Docker Desktop (for local Supabase)
- Optional: a Gemini API key and a Deepgram API key

Then, from the repo root:

```bash
pnpm install                      # also generates the Prisma client
pnpm dlx supabase start           # Postgres and Auth in Docker
pnpm dlx supabase status          # prints the local URLs and keys
cp .env.example .env.local        # then fill it in (below)
pnpm exec prisma migrate deploy   # create the tables
pnpm dev                          # http://localhost:3000
```

In `.env.local`, set these from `pnpm dlx supabase status`: `DATABASE_URL`
and `DIRECT_URL` (the local Postgres), `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Create an account on the sign-in page
to use the app.

The AI keys go in `.env.local` too:

- `DEEPGRAM_API_KEY`: transcripts and spoken commands. Cleanup,
  re-recording, highlights and Make it all start from the transcript.
- `GEMINI_API_KEY`: typed commands, highlights and Make it's plan.

Without them the app still runs, and the editor and manual editing work;
only the AI features fail, with an error message.

## Tests

```bash
pnpm test        # unit tests (node --test)
pnpm test:e2e    # Playwright end-to-end tests; starts the app unless E2E_BASE_URL is set
pnpm test:db     # database tests; DATABASE_URL must point at a local Postgres
```

No test calls a real AI provider.

## Architecture

Decisions, trade-offs, scope and known limits are in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Scope

Retake runs on Vercel with a hosted Supabase project (Postgres and auth);
video decoding, editing and export happen in the browser. See
[docs/rules/deployment.md](docs/rules/deployment.md).

Next: music for Make it is planned.
