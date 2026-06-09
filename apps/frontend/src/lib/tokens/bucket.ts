export type Bucket = "today" | "week" | "later";

// What the user sees: the stored bucket may roll into "overdue" if its
// scheduled stamp is older than the current period (calendar day for
// "today", current week for "week"). "later" never rolls over.
export type DisplayBucket = Bucket | "overdue";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Monday-start week. Returns 00:00 on Monday of the week containing d.
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const offset = (c.getDay() + 6) % 7; // days since Monday
  c.setDate(c.getDate() - offset);
  return c;
}

// Choose the storage bucket for a task scheduled on `date`. A past date lands
// in "today" (so it surfaces as Overdue), the rest of the current calendar week
// goes to "week", and anything further out is "later". Used when the user types
// a date token (e.g. "@tomorrow") so the task isn't dumped under Today.
export function bucketForDate(date: Date, now = new Date()): Bucket {
  const day = startOfDay(date);
  const todayStart = startOfDay(now);
  if (day <= todayStart) return "today"; // today or past (past → shows overdue)
  const nextWeek = startOfWeek(now);
  nextWeek.setDate(nextWeek.getDate() + 7); // exclusive: start of next week
  return day < nextWeek ? "week" : "later";
}

export function displayBucket(
  task: { bucket: string; scheduledAt: string | Date | null; completed: boolean },
  now = new Date(),
): DisplayBucket {
  const b = task.bucket as Bucket;
  if (b === "later" || task.completed || !task.scheduledAt) {
    return b === "today" || b === "week" ? b : "later";
  }
  const sched = typeof task.scheduledAt === "string" ? new Date(task.scheduledAt) : task.scheduledAt;
  if (b === "today") return sched < startOfDay(now) ? "overdue" : "today";
  return sched < startOfWeek(now) ? "overdue" : "week";
}
