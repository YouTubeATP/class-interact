-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "theme" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presentationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    CONSTRAINT "Activity_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presentationId" TEXT,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'standalone',
    "collectNames" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'live',
    "pin" TEXT NOT NULL,
    "livePin" TEXT,
    "state" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "answerRevealed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SessionActivity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sessionActivityId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "correct" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "responseMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_sessionActivityId_fkey" FOREIGN KEY ("sessionActivityId") REFERENCES "SessionActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Activity_presentationId_position_idx" ON "Activity"("presentationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_presentationId_key_key" ON "Activity"("presentationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Session_livePin_key" ON "Session"("livePin");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "SessionActivity_sessionId_position_idx" ON "SessionActivity"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SessionActivity_sessionId_key_key" ON "SessionActivity"("sessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tokenHash_key" ON "Participant"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_nameKey_key" ON "Participant"("sessionId", "nameKey");

-- CreateIndex
CREATE INDEX "Submission_sessionId_idx" ON "Submission"("sessionId");

-- CreateIndex
CREATE INDEX "Submission_sessionActivityId_status_idx" ON "Submission"("sessionActivityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_sessionActivityId_participantId_slot_key" ON "Submission"("sessionActivityId", "participantId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_sessionActivityId_participantId_key_key" ON "Submission"("sessionActivityId", "participantId", "key");
