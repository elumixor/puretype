import { api } from "$lib/api";
import { projects } from "$lib/projects.svelte";
import { tasks as tasksStore } from "$lib/tasks.svelte";
import type { Bucket } from "$lib/tokens";
import { bucketForDate, localISO } from "$lib/tokens";

// Background AI enrichment for a just-created task. The task is already on
// screen with its raw text; this asks the backend to pull out a project, date,
// and duration, then rewrites the task with canonical tokens so the pills +
// bucket update in place. Project ids are resolved here (match an existing
// project by name, or create one) — the model never handles ids. (#47)
//
// Best-effort: any failure (offline, model error) leaves the raw task as-is.
export async function enrichWithAI(taskId: string, rawText: string): Promise<void> {
  try {
    const res = await api.parse.$post({
      text: rawText,
      projects: projects.active.map((p) => ({ id: p.id, name: p.name })),
      clientDate: localISO(new Date(), false),
    });

    const parts: string[] = [res.cleanText.trim()];
    const patch: Partial<{ text: string; bucket: Bucket; projectId: string | null; startTime: string | null }> = {};

    if (res.projectName) {
      const existing = projects.byName(res.projectName);
      const p = existing ?? (await projects.create(res.projectName));
      patch.projectId = p.id;
      parts.push(`@project:${p.id}`);
    }

    if (res.date && /^\d{4}-\d{2}-\d{2}$/.test(res.date)) {
      parts.push(`@time:${res.date}`);
      patch.bucket = bucketForDate(new Date(`${res.date}T00:00`));
      patch.startTime = new Date(`${res.date}T00:00`).toISOString();
    }

    if (res.durationMin) parts.push(`@dur:${res.durationMin}`);

    const newText = parts.filter(Boolean).join(" ").trim();
    // Nothing useful extracted — don't churn the task.
    if (newText === rawText.trim() && patch.bucket === undefined) return;
    patch.text = newText;

    // The task may have been deleted/edited in the ~1s the parse took.
    if (!tasksStore.byId(taskId)) return;
    await tasksStore.update(taskId, patch);
  } catch {
    // best-effort enrichment
  }
}
