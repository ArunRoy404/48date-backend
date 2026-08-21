-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'GAME';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "datePlanId" TEXT,
ADD COLUMN     "gameSessionId" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_datePlanId_fkey" FOREIGN KEY ("datePlanId") REFERENCES "date_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
