import type { Bucket, Task } from "$lib/api";
import { startOfDay, startOfWeek } from "$lib/tokens";

// A completed task stays visible in its section for the rest of its period,
// then drops into the archive once that period is fully past:
//   bucket=today  → visible until its day is over, then archive next day
//   bucket=week   → visible until its week is over, then archive next week
//   bucket=later  → no period; archive as soon as it's done
// The period is anchored on scheduledAt (where the row is displayed), falling
// back to completedAt for rows that never got a scheduledAt stamp — without
// the fallback such tasks would never archive.
export function isArchived(t: Task, now = new Date()): boolean {
  if (!t.completed) return false;
  const b = t.bucket as Bucket;
  if (b === "later") return true;
  const anchor = t.scheduledAt ?? t.completedAt;
  if (!anchor) return true;
  const d = new Date(anchor);
  return b === "today" ? d < startOfDay(now) : d < startOfWeek(now);
}

// Pop signal: increments each time a task transitions into the archive,
// so the header button can scale-pop without prop-drilling.
class ArchivePop {
  tick = $state(0);
  bump() {
    this.tick++;
  }
}
export const archivePop = new ArchivePop();
