# Retake

**Live: [retake-five.vercel.app](https://retake-five.vercel.app)**

Retake is an AI video editor for fixing and polishing recordings you already
have: talks, screen recordings, to-camera takes. Load a video, and Retake
helps you clean it up, edit it by hand, or turn it into something new,
without shooting it again.

I designed and built it end to end: the product, the editor, the AI
features and the deployment.

## What it does

**Make it with AI.** Turns a recording into a reel, an ad or a TikTok.

- Type what you want, answer a few quick questions, and approve the plan
  before anything changes.
- Pick one of four looks: Clean, Bold, Cinematic or Playful.

**Manual editing.** A full timeline editor.

- Trim, split, merge and reorder clips.
- Captions, titles, a logo, zoom, colour, speed changes and transitions.
- An audio lane, a before/after comparison, and export to a video file.

**Automatic cleanup and re-recording.**

- A transcript, with silences and filler words found for you.
- One-click cleanup, or cut fillers one at a time.
- Re-record a single sentence and splice it back in.

## How it works

Video stays in the browser: decoding, editing, preview and export all run
client-side, and projects are saved in the browser's IndexedDB. The server
handles sign-in, AI calls and per-user daily AI allowances.

For the AI features only, a video's audio goes to Deepgram (transcripts and
spoken commands), and Gemini receives text (typed commands and the
transcript) and, for Make it, small still frames. The video file itself is
never uploaded. Long takes' audio passes through a private Supabase Storage
bucket on its way to Deepgram and is deleted straight after. Every AI call is
time-limited, capped, and recorded with its cost.

Details are on the Privacy page, at `/privacy`
([source](<src/app/[locale]/(site)/privacy/page.tsx>)). Design decisions,
trade-offs and known limits are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack

- **App:** Next.js 16 (App Router, React Compiler), React 19, TypeScript,
  Tailwind CSS 4, next-intl, TanStack Query
- **Data and auth:** Postgres through Prisma, Supabase Auth and Storage
- **AI:** Gemini (planning and commands), Deepgram (speech to text)
- **Video:** browser-side decoding, editing and export; projects in IndexedDB
- **Hosting:** Vercel, with a hosted Supabase project
- **Quality:** ESLint, Prettier, `node --test` unit tests, Playwright
  end-to-end tests, GitHub Actions
- **Optional:** Sentry and PostHog (off unless their keys are set)

## Run it locally

You need Node 22.18 or later, pnpm, and Docker Desktop (for a local
Supabase). Gemini and Deepgram keys are optional.

```bash
pnpm install                      # also generates the Prisma client
pnpm dlx supabase start           # Postgres, Auth and Storage in Docker
pnpm dlx supabase status          # prints the local URLs and keys
cp .env.example .env.local        # then fill it in (below)
pnpm exec prisma migrate deploy   # create the tables
pnpm dev                          # http://localhost:3000
```

In `.env.local`, set these from `pnpm dlx supabase status`: `DATABASE_URL`
and `DIRECT_URL` (the local Postgres), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. Then
create an account on the sign-in page.

The AI keys go in `.env.local` too:

- `DEEPGRAM_API_KEY`: transcripts and spoken commands. Cleanup,
  re-recording, highlights and Make it all start from the transcript.
- `GEMINI_API_KEY`: typed commands, highlights and Make it's plan.

Without them the app still runs and manual editing works; only the AI
features show an error. `.env.example` lists every variable and where its
value comes from.

## Tests

```bash
pnpm lint && pnpm typecheck   # ESLint and TypeScript
pnpm test                     # unit tests
pnpm test:e2e                 # Playwright end-to-end tests (starts the app)
pnpm test:db                  # database tests against a local Postgres
```

No test calls a real AI provider; the providers are faked at the network
edge. CI runs lint, typecheck, unit tests and the production build on every
push; the end-to-end and database suites run on demand.

## Deployment

Vercel deploys `main` to production and each pull request to a preview,
against a hosted Supabase project. Setup, environment variables and
migrations are in [docs/rules/deployment.md](docs/rules/deployment.md).

## Project layout

```
docs/           engineering rules, CI and deployment notes
e2e/            Playwright end-to-end tests
messages/       UI text (en.json)
prisma/         database schema and migrations
public/         static files and sample footage
scripts/        repo checks and database helpers
supabase/       local Supabase config
src/
  app/          pages: landing, privacy, sign-in, home, projects, Make it, the editor
  components/   shared UI components
  lib/          shared code: env, errors, analytics, Supabase helpers
  server/       server actions, AI provider wrappers, storage, database client
```
