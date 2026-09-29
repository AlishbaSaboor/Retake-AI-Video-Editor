-- Enable Row Level Security on the run-once SQL ledger, created by the
-- CI-generated migration just before this one. It is infrastructure, written
-- only by scripts/run-once-sql.mjs as the table owner, which RLS never gates —
-- so this costs nothing and keeps the rule at "every table" with no exemption
-- (scripts/check-rls.mjs). No policies, never FORCE. Hand-written on purpose:
-- RLS is not expressible in the Prisma schema (docs/rules/auth.md).
ALTER TABLE "_run_once_sql" ENABLE ROW LEVEL SECURITY;
