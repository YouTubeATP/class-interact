-- AlterTable
ALTER TABLE "Session" ADD COLUMN "liveProjectorCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_liveProjectorCode_key" ON "Session"("liveProjectorCode");
