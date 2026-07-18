-- Archive a project without deleting it: hides the project and its tasks from
-- every view until restored. Distinct from `deletedAt`, which is a sync tombstone.
ALTER TABLE "Project" ADD COLUMN "archivedAt" DATETIME;
