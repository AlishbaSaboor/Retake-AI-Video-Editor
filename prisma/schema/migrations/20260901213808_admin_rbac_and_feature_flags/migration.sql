-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'support', 'read_only');

-- DropTable
-- ExampleUser was the template placeholder (no product data); replaced by the
-- real User model (id = Supabase auth uuid). Hand-written because a drop is a
-- destructive pattern the CI generator refuses to auto-emit (docs/rules/migrations.md).
DROP TABLE "example_users";

-- CreateTable
CREATE TABLE "admin_members" (
    "userId" UUID NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'read_only',
    "permissionGrants" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_members_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flagKey" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_flagKey_userId_key" ON "feature_flag_overrides"("flagKey", "userId");

-- AddForeignKey
ALTER TABLE "admin_members" ADD CONSTRAINT "admin_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security on every user-scoped table: a deny-by-default backstop.
-- Data API off + RLS ON with NO policies and NO FORCE, so the anon / authenticated
-- PostgREST roles can read nothing even if the Data API is switched on later, while
-- Prisma (the table owner) stays exempt and keeps working. Authorization itself is
-- enforced in the app layer. feature_flags is global config (not user-scoped) and
-- deliberately gets none. See docs/rules/auth.md and docs/rules/authorization.md.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
