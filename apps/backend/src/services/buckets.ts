// Server-side port of the frontend `tokens/bucket.ts` logic so the sync engine
// files external items into the same buckets the client would. Keep in sync
// with apps/frontend/src/lib/tokens/bucket.ts.

export type Bucket = "today" | "week" | "later";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Monday-start week. 00:00 on Monday of the week containing d.
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const offset = (c.getDay() + 6) % 7; // days since Monday
  c.setDate(c.getDate() - offset);
  return c;
}

// Storage bucket for a task scheduled on `date`: past/today → "today" (so it
// surfaces as Overdue), the rest of the current week → "week", further → "later".
export function bucketForDate(date: Date, now = new Date()): Bucket {
  const day = startOfDay(date);
  const todayStart = startOfDay(now);
  if (day <= todayStart) return "today";
  const nextWeek = startOfWeek(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return day < nextWeek ? "week" : "later";
}
