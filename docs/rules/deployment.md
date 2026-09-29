# Deployment

Never run a manual production deploy command (`vercel --prod`,
`supabase functions deploy`, etc.) unless explicitly instructed. Let CI/CD
handle it — see `.github/workflows/`.

This template assumes Vercel's default git integration (auto-deploy on
push to `main`) rather than the org's tag-gated release process seen in
some other repos (e.g. 8x-brands disables Vercel's auto-deploy and only
ships production on a `v*` tag push). If this project should follow that
pattern instead, see `docs/CI_CD_SETUP.md`'s note on it — don't silently
assume one or the other without checking what's actually configured in the
Vercel project.

See `docs/CI_CD_SETUP.md` for what this repo needs configured in GitHub
(secrets, environments, branch protection) and Vercel (env vars, git
integration) before any of the deploy-related CI jobs actually work.
