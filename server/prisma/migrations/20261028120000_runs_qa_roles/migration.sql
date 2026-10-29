-- Classroom features: activity runs (repeat an activity, results kept per run), audience Q&A with votes, the
-- understanding pulse, revocable co-presenter / moderator links, teams, opt-in learner identities and per-session
-- feature settings.
--
-- Existing data is preserved: every existing session activity gets run #1 (carrying over its completed and
-- answer-revealed flags), and every existing submission is attached to that run. Unique constraints that stopped
-- double submissions per activity now apply per run, which is identical for activities that ran once.

-- CreateTable
CREATE TABLE "ActivityRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sessionActivityId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "scoring" TEXT NOT NULL DEFAULT 'counted',
    "answerRevealed" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merges" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ActivityRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityRun_sessionActivityId_fkey" FOREIGN KEY ("sessionActivityId") REFERENCES "SessionActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "Team_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" DATETIME,
    CONSTRAINT "AudienceQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AudienceQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionVote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PulseSignal" (
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("sessionId", "participantId"),
    CONSTRAINT "PulseSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PulseEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "previous" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PulseEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "AccessGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Learner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "shareProgress" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
-- Backfill: run #1 for every existing session activity, with its existing state
INSERT INTO "ActivityRun" ("id", "sessionId", "sessionActivityId", "number", "scoring", "answerRevealed", "completed", "startedAt", "merges")
SELECT 'run1_' || sa."id", sa."sessionId", sa."id", 1, 'counted', sa."answerRevealed", sa."completed", s."createdAt", '{}'
FROM "SessionActivity" sa JOIN "Session" s ON s."id" = sa."sessionId";
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presentationId" TEXT,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'standalone',
    "collectNames" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'live',
    "pin" TEXT NOT NULL,
    "livePin" TEXT,
    "liveProjectorCode" TEXT,
    "state" TEXT NOT NULL,
    "features" TEXT NOT NULL DEFAULT '{}',
    "rehearsal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("collectNames", "createdAt", "endedAt", "id", "lastActivityAt", "livePin", "liveProjectorCode", "mode", "pin", "presentationId", "state", "status", "theme", "title") SELECT "collectNames", "createdAt", "endedAt", "id", "lastActivityAt", "livePin", "liveProjectorCode", "mode", "pin", "presentationId", "state", "status", "theme", "title" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_livePin_key" ON "Session"("livePin");
CREATE UNIQUE INDEX "Session_liveProjectorCode_key" ON "Session"("liveProjectorCode");
CREATE INDEX "Session_status_idx" ON "Session"("status");
CREATE TABLE "new_Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT,
    "learnerId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Participant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Participant_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Participant" ("id", "joinedAt", "name", "nameKey", "removed", "sessionId", "tokenHash") SELECT "id", "joinedAt", "name", "nameKey", "removed", "sessionId", "tokenHash" FROM "Participant";
DROP TABLE "Participant";
ALTER TABLE "new_Participant" RENAME TO "Participant";
CREATE UNIQUE INDEX "Participant_tokenHash_key" ON "Participant"("tokenHash");
CREATE INDEX "Participant_learnerId_idx" ON "Participant"("learnerId");
CREATE UNIQUE INDEX "Participant_sessionId_nameKey_key" ON "Participant"("sessionId", "nameKey");
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sessionActivityId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "correct" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "responseMs" INTEGER,
    "review" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_sessionActivityId_fkey" FOREIGN KEY ("sessionActivityId") REFERENCES "SessionActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ActivityRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("correct", "createdAt", "id", "key", "participantId", "payload", "responseMs", "score", "sessionActivityId", "sessionId", "slot", "status", "runId") SELECT "correct", "createdAt", "id", "key", "participantId", "payload", "responseMs", "score", "sessionActivityId", "sessionId", "slot", "status", 'run1_' || "sessionActivityId" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE INDEX "Submission_sessionId_idx" ON "Submission"("sessionId");
CREATE INDEX "Submission_sessionActivityId_status_idx" ON "Submission"("sessionActivityId", "status");
CREATE INDEX "Submission_runId_status_idx" ON "Submission"("runId", "status");
CREATE UNIQUE INDEX "Submission_runId_participantId_slot_key" ON "Submission"("runId", "participantId", "slot");
CREATE UNIQUE INDEX "Submission_runId_participantId_key_key" ON "Submission"("runId", "participantId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ActivityRun_sessionId_idx" ON "ActivityRun"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRun_sessionActivityId_number_key" ON "ActivityRun"("sessionActivityId", "number");

-- CreateIndex
CREATE INDEX "Team_sessionId_idx" ON "Team"("sessionId");

-- CreateIndex
CREATE INDEX "AudienceQuestion_sessionId_idx" ON "AudienceQuestion"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVote_questionId_participantId_key" ON "QuestionVote"("questionId", "participantId");

-- CreateIndex
CREATE INDEX "PulseEvent_sessionId_at_idx" ON "PulseEvent"("sessionId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_tokenHash_key" ON "AccessGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessGrant_sessionId_idx" ON "AccessGrant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Learner_keyHash_key" ON "Learner"("keyHash");

