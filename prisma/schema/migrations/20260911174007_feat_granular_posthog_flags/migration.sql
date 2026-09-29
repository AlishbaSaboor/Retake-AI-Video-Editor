-- AlterTable
ALTER TABLE "feature_flag_overrides" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "variant" TEXT;

-- AlterTable
ALTER TABLE "feature_flags" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "variant" TEXT,
ADD COLUMN     "variantWeights" JSONB;
