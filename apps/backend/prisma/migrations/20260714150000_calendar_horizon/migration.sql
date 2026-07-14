-- AlterTable
-- Nullable with no default: NULL means "this week only" (today + week buckets),
-- which is the default behaviour. A number is a rolling N-day window.
ALTER TABLE "CalendarSource" ADD COLUMN "horizonDays" INTEGER;
