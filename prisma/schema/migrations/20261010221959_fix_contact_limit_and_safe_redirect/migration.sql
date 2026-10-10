-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN     "ip_hash" TEXT;

-- CreateIndex
CREATE INDEX "contact_messages_ip_hash_createdAt_idx" ON "contact_messages"("ip_hash", "createdAt");
