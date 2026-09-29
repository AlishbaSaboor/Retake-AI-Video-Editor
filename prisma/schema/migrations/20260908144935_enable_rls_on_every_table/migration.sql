-- Enable Row Level Security on the two tables the RBAC migration left out, so
-- the rule is "every table" with no judgement call per table. No policies, and
-- never FORCE: Prisma connects as the owner, and FORCE would subject it to the
-- policies that deliberately do not exist. Hand-written on purpose — RLS is not
-- expressible in the Prisma schema (docs/rules/auth.md) — and enforced from
-- here on by `pnpm check:rls` at the end of CI's migrations job.
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
