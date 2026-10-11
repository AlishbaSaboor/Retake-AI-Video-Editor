-- Enable Row Level Security on ai_allowances, created by the CI-generated
-- migration just before this one (20261011001538_feat_daily_ai_allowance).
-- The app reads and writes it only through Prisma as the table owner, which
-- RLS never gates, so this only locks out every other role. No policies,
-- never FORCE. Hand-written on purpose: RLS is not expressible in the Prisma
-- schema (docs/rules/auth.md).
ALTER TABLE "ai_allowances" ENABLE ROW LEVEL SECURITY;
