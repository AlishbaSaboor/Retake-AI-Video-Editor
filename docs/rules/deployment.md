# Deployment

Retake isn't deployed. There's no Vercel project, no `vercel.json` and no
deploy workflow, so nothing deploys on a push to `main` or on a tag; it runs
on one machine (`pnpm dev`, or a production build started locally). See
`ARCHITECTURE.md`, "Scope: local-first, not deployed".

Never run a manual deploy command (`vercel --prod`, `supabase functions
deploy`, etc.). If the project is ever deployed, its hosting and deploy
pipeline get set up first, deliberately: `ARCHITECTURE.md`'s Scope table
lists what a hosted launch would need.

`docs/CI_CD_SETUP.md` covers what the GitHub workflows need (secrets,
branch protection).
