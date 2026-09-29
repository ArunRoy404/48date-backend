-- AlterTable
ALTER TABLE "images" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "hash" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE INDEX "images_hash_idx" ON "images"("hash");

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "matches_expiresAt_idx" ON "matches"("expiresAt");
