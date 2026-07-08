-- Add row-sync filter conditions (JSON) to a Notion source.
ALTER TABLE "NotionSource" ADD COLUMN "filters" TEXT;
