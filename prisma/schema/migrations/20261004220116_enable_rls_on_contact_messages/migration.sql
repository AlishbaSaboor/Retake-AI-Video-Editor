-- Enable Row Level Security on contact_messages, created by the CI-generated
-- migration just before this one. Anyone can send a message from the Contact
-- us page; the app writes it through Prisma as the table owner, which RLS
-- never gates, so this only locks out every other role. No policies, never
-- FORCE. Hand-written on purpose: RLS is not expressible in the Prisma schema
-- (docs/rules/auth.md).
ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;
