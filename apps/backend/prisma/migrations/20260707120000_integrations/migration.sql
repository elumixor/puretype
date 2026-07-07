-- External integrations: Google Calendar + Notion.
-- Connected accounts, per-source project bindings, and task provenance columns.

-- CreateTable
CREATE TABLE "GoogleAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "googleUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "scope" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoogleAccount_userId_googleUserId_key" ON "GoogleAccount"("userId", "googleUserId");
CREATE INDEX "GoogleAccount_userId_idx" ON "GoogleAccount"("userId");

-- CreateTable
CREATE TABLE "CalendarSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "googleAccountId" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "calendarName" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "syncToken" TEXT,
  "lastSyncedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalendarSource_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalendarSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CalendarSource_googleAccountId_calendarId_key" ON "CalendarSource"("googleAccountId", "calendarId");
CREATE INDEX "CalendarSource_userId_idx" ON "CalendarSource"("userId");
CREATE INDEX "CalendarSource_projectId_idx" ON "CalendarSource"("projectId");

-- CreateTable
CREATE TABLE "NotionAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "workspaceIcon" TEXT,
  "botId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotionAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotionAccount_userId_workspaceId_key" ON "NotionAccount"("userId", "workspaceId");
CREATE INDEX "NotionAccount_userId_idx" ON "NotionAccount"("userId");

-- CreateTable
CREATE TABLE "NotionSource" (
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
  "lastSyncedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotionSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotionSource_notionAccountId_fkey" FOREIGN KEY ("notionAccountId") REFERENCES "NotionAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotionSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotionSource_notionAccountId_databaseId_key" ON "NotionSource"("notionAccountId", "databaseId");
CREATE INDEX "NotionSource_userId_idx" ON "NotionSource"("userId");
CREATE INDEX "NotionSource_projectId_idx" ON "NotionSource"("projectId");

-- AlterTable: task provenance
ALTER TABLE "Task" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Task" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalSourceId" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalUpdatedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Task_externalSourceId_externalId_key" ON "Task"("externalSourceId", "externalId");
CREATE INDEX "Task_externalSourceId_idx" ON "Task"("externalSourceId");
