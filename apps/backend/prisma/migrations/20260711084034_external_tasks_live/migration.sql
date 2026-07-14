/*
  Warnings:

  - You are about to drop the column `lastSyncedAt` on the `CalendarSource` table. All the data in the column will be lost.
  - You are about to drop the column `syncToken` on the `CalendarSource` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncedAt` on the `NotionSource` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `externalSourceId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `externalUpdatedAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `externalUrl` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Task` table. All the data in the column will be lost.

*/
-- Purge persisted external items (Notion pages, Calendar events). They are now
-- fetched live from the source. Must run BEFORE the Task rebuild below, while
-- the `source` column still exists — the rebuild copies every remaining row
-- into the new table without the provenance columns.
DELETE FROM "Task" WHERE "source" != 'manual';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarSource_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CalendarSource" ("calendarId", "calendarName", "createdAt", "googleAccountId", "id", "projectId", "userId") SELECT "calendarId", "calendarName", "createdAt", "googleAccountId", "id", "projectId", "userId" FROM "CalendarSource";
DROP TABLE "CalendarSource";
ALTER TABLE "new_CalendarSource" RENAME TO "CalendarSource";
CREATE INDEX "CalendarSource_userId_idx" ON "CalendarSource"("userId");
CREATE INDEX "CalendarSource_projectId_idx" ON "CalendarSource"("projectId");
CREATE UNIQUE INDEX "CalendarSource_googleAccountId_calendarId_key" ON "CalendarSource"("googleAccountId", "calendarId");
CREATE TABLE "new_NotionSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notionAccountId" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "viewId" TEXT,
    "projectId" TEXT NOT NULL,
    "datePropertyId" TEXT,
    "statusPropertyId" TEXT,
    "statusPropType" TEXT,
    "doneValue" TEXT,
    "filters" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotionSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotionSource_notionAccountId_fkey" FOREIGN KEY ("notionAccountId") REFERENCES "NotionAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotionSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotionSource" ("createdAt", "databaseId", "databaseName", "datePropertyId", "doneValue", "filters", "id", "notionAccountId", "projectId", "statusPropType", "statusPropertyId", "userId", "viewId") SELECT "createdAt", "databaseId", "databaseName", "datePropertyId", "doneValue", "filters", "id", "notionAccountId", "projectId", "statusPropType", "statusPropertyId", "userId", "viewId" FROM "NotionSource";
DROP TABLE "NotionSource";
ALTER TABLE "new_NotionSource" RENAME TO "NotionSource";
CREATE INDEX "NotionSource_userId_idx" ON "NotionSource"("userId");
CREATE INDEX "NotionSource_projectId_idx" ON "NotionSource"("projectId");
CREATE UNIQUE INDEX "NotionSource_notionAccountId_databaseId_key" ON "NotionSource"("notionAccountId", "databaseId");
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarType" TEXT NOT NULL DEFAULT 'auto',
    "emoji" TEXT,
    "image" TEXT,
    "hue" INTEGER,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "capitalization" TEXT NOT NULL DEFAULT 'sentence',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("avatarType", "capitalization", "createdAt", "deletedAt", "emoji", "hidden", "hue", "id", "image", "name", "order", "updatedAt", "userId") SELECT "avatarType", "capitalization", "createdAt", "deletedAt", "emoji", "hidden", "hue", "id", "image", "name", "order", "updatedAt", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
CREATE UNIQUE INDEX "Project_userId_name_key" ON "Project"("userId", "name");
CREATE TABLE "new_ProjectParent" (
    "childId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,

    PRIMARY KEY ("childId", "parentId"),
    CONSTRAINT "ProjectParent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectParent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectParent" ("childId", "parentId") SELECT "childId", "parentId" FROM "ProjectParent";
DROP TABLE "ProjectParent";
ALTER TABLE "new_ProjectParent" RENAME TO "ProjectParent";
CREATE INDEX "ProjectParent_parentId_idx" ON "ProjectParent"("parentId");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "bucket" TEXT NOT NULL DEFAULT 'later',
    "scheduledAt" DATETIME,
    "projectId" TEXT,
    "startTime" DATETIME,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("bucket", "completed", "completedAt", "createdAt", "deletedAt", "duration", "id", "order", "projectId", "scheduledAt", "startTime", "text", "updatedAt", "userId") SELECT "bucket", "completed", "completedAt", "createdAt", "deletedAt", "duration", "id", "order", "projectId", "scheduledAt", "startTime", "text", "updatedAt", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
CREATE INDEX "Task_userId_updatedAt_idx" ON "Task"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
