# Secrets

A credential belongs in an environment variable, read once through
`src/lib/env.ts` — never hardcoded in source, and never committed. `.gitignore`
blocks every `.env*` file except `.env.example`, so the files themselves can't
land in git. The hole this rule closes is a real `DATABASE_URL`, Supabase
secret key or `Authorization` header pasted into a tracked file (source, a
doc, a test fixture) and carried into history.

## The scanner is a backstop, not a licence

`scripts/check-secrets.mjs` greps text for credential shapes and refuses the
commit. Two enforcement points, one implementation — the same shape as
`scripts/check-commit-message.mjs`:

- **`.githooks/pre-commit`** runs it over the staged blobs of every commit, so
  a secret is caught before it is even written to history.
- **CI's `check:secrets` job** re-runs it over every tracked file, so a secret
  committed with `git commit --no-verify`, or one that landed before the hook
  existed, still fails the branch.

It flags connection strings with an inline password, provider-format keys
(AWS, GitHub, Slack, Stripe, Google, OpenAI/Anthropic, SendGrid), Supabase
`sb_secret_…` keys, JWTs (a legacy Supabase anon or service-role key is one),
`Authorization` header values, PEM
private keys, and a high-entropy value assigned to a credential-named key
(`API_KEY=…`). It deliberately allows the placeholder shapes the repo carries
on purpose — `postgresql://user:password@host`, `Bearer $CRON_SECRET`,
`sk-…` written as prose.

This is a backstop, exactly like `redact()` in the logger
(`docs/rules/logging.md`) — that one scrubs the same shapes out of structured
log fields at runtime; this one scans file text at commit time. Neither is
permission to handle a secret carelessly. Don't paste a live credential into a
comment, a test fixture or a commit and lean on the scanner to catch it.

## When it fires on something that isn't a secret

Precision is tuned high (a false positive blocks a commit), but no scanner is
perfect. Two escape hatches, in order of preference:

1. Put `allowlist secret` in a comment on the line. Best for source and test
   fixtures, where the fake value is deliberate and the annotation documents
   that.
2. Add a glob to `.secretsallow` (one per line, `#` comments allowed) to skip a
   whole file. Use this only for a file that is all fixtures.

Reach for these only when the value genuinely is not a credential. The right
fix for a real one is to remove it, not to allowlist it.
