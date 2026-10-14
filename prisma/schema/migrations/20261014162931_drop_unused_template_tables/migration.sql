-- DropForeignKey
ALTER TABLE "admin_members" DROP CONSTRAINT "admin_members_userId_fkey";

-- DropTable
DROP TABLE "admin_members";

-- DropTable
DROP TABLE "feature_flags";

-- DropTable
DROP TABLE "feature_flag_overrides";

-- DropEnum
DROP TYPE "AdminRole";

