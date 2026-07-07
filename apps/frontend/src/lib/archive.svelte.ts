import type { Task } from "$lib/api";
import { displayBucket } from "$lib/tokens";

// A completed task lives in the archive unless, ignoring its completion, it
// would still show up under Today. So only fresh today tasks stay visible when
// done (the day's accomplishments); everything else archives on completion:
//   bucket=today + scheduledAt is fresh  → stays in Today
//   bucket=week (this week)              → archive on done
//   bucket=later                         → archive on done
//   bucket=today/week + stale (overdue)  → archive on done
export function isArchived(t: Task, now = new Date()): boolean {
  if (!t.completed) return false;
  const eb = displayBucket({ ...t, completed: false }, now);
  return eb !== "today";
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
