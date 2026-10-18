# Deployment

Production: the Next.js app on **Vercel**, Postgres and auth on a **hosted
Supabase project**. Video decoding, editing and export stay in the browser.

- **Vercel deploys from Git**: `main` to production, each pull request to a
  preview. Never run a manual deploy command (`vercel --prod`, `supabase
functions deploy`, etc.).
- **Build**: `pnpm build`, which is `prisma generate && next build`, so the
  Prisma client is generated on Vercel's own build machine every time; a
  restored dependency cache can't leave a stale or wrong-platform client.
- **Environment variables**: `.env.example` lists every one, where its value
  comes from (Supabase, Deepgram, Gemini, ...) and whether it goes in Vercel.
  `DIRECT_URL` never does.
- **Migrations**: nothing applies them to the hosted database automatically.
  Before deploying a change that adds one, apply it from a trusted machine
  with the session-pooler URL: `DIRECT_URL=... DATABASE_URL=... pnpm exec
prisma migrate deploy`, then `pnpm db:run-once` and `pnpm check:rls`.
  Previews use the same database unless the Preview environment in Vercel is
  given a separate Supabase project.
- **Request size**: a request to a Vercel Function carries at most 4.5 MB
  (`MAX_ACTION_REQUEST_BYTES`, `src/lib/request-limits.ts`). Every Server
  Action fits under it (`src/lib/request-limits.test.mts`): a take longer
  than 70 s has its audio uploaded straight to a private Supabase Storage
  bucket instead (`src/server/storage/take-audio.ts`), and Make it's pictures
  are capped.
- **Function duration**: the longest action waits up to 60 s for the AI
  (`PLAN_TIMEOUT_MS`, the transcript's 60 s). Vercel's default with Fluid
  compute (on for new projects) is 300 s; on a project without it, check the
  plan's limit covers a minute.

**Supabase project settings** (dashboard, once):

- Authentication -> Sign In / Providers -> Email: turn **Confirm email off**.
  Sign-up signs the new account straight in (`login/actions.ts`); there's no
  confirmation page to land on.
- Authentication -> URL Configuration: set the Site URL to the production URL.
- Project Settings -> Data API: keep it **off** (`docs/rules/auth.md`); RLS
  with no policies is on every table already (`pnpm check:rls`).
- Storage: nothing to set up. The private `take-audio` bucket is created the
  first time a long take is uploaded.

`docs/CI_CD_SETUP.md` covers what the GitHub workflows need (secrets,
branch protection).
