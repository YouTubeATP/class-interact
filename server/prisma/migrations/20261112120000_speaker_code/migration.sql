-- Presenter phones: six digits typed on the join page instead of scanning the Presenter QR.
-- AlterTable
ALTER TABLE "Session" ADD COLUMN "liveSpeakerCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_liveSpeakerCode_key" ON "Session"("liveSpeakerCode");
