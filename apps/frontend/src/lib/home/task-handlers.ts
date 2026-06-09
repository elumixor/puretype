import type { Bucket, Task } from "$lib/api";
import { enrichWithAI } from "$lib/ai-parse";
import { archivePop, isArchived } from "$lib/archive.svelte";
import { features } from "$lib/capabilities.svelte";
import { selection as multi } from "$lib/selection.svelte";
import { settings } from "$lib/settings.svelte";
import { tasks as tasksStore } from "$lib/tasks.svelte";
import { toasts } from "$lib/toast.svelte";
import { bucketForDate, extractFields, TOKEN_RE } from "$lib/tokens";

// Per-task monotonic sequence so rapid double-taps coalesce safely.
const toggleSeq = new Map<string, number>();
const confirmedToggle = new Map<string, boolean>();

export async function addTask(text: string) {
  const fields = extractFields(text);
  // A typed date token wins; otherwise fall back to the user's default-bucket
  // preference. Keeps "@tomorrow" out of Today (#46) and honours the setting (#43).
  const bucket = fields.startTime ? bucketForDate(new Date(fields.startTime)) : settings.defaultBucket;
  const task = await tasksStore.create({ text, bucket, ...fields });
  tasksStore.focus(task.id); // scroll the new row into view + flash (#42)
  // iOS + paid: enrich plain text (no manually-typed tokens) with AI-parsed
  // project/date/duration in the background (#47).
  TOKEN_RE.lastIndex = 0;
  if (features.ai && !TOKEN_RE.test(text)) void enrichWithAI(task.id, text);
  return task;
}

export async function toggleTask(task: Task) {
  const id = task.id;
  const target = !task.completed;
  if (!confirmedToggle.has(id)) confirmedToggle.set(id, task.completed);
  // Completing a "later" task pulls it into Today so the user sees the win.
  const promote = target && task.bucket === "later";
  const patch: Partial<Task> = promote ? { completed: target, bucket: "today" } : { completed: target };
  if (target && !promote && isArchived({ ...task, completed: true })) archivePop.bump();
  const seq = (toggleSeq.get(id) ?? 0) + 1;
  toggleSeq.set(id, seq);
  try {
    const updated = await tasksStore.update(id, patch);
    if (toggleSeq.get(id) !== seq) return;
    if (updated) confirmedToggle.set(id, updated.completed);
    toggleSeq.delete(id);
  } catch {
    if (toggleSeq.get(id) !== seq) return;
    const safe = confirmedToggle.get(id) ?? !target;
    await tasksStore.update(id, { completed: safe });
    toggleSeq.delete(id);
    toasts.error("Couldn't update task — please try again");
  }
}

export const deleteTask = (task: Task) => tasksStore.remove(task.id);

export const editTask = (task: Task, text: string) => tasksStore.update(task.id, { text, ...extractFields(text) });

export const duplicateTask = (task: Task) =>
  tasksStore.create({ text: task.text, bucket: task.bucket as Bucket, ...extractFields(task.text) });

export async function bulkDelete(ids: string[]) {
  multi.clear();
  for (const id of ids) await tasksStore.remove(id);
}

export async function bulkComplete(ids: string[], completed: boolean) {
  for (const id of ids) await tasksStore.update(id, { completed });
}
