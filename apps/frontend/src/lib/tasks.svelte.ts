import { api, type Bucket, type ExternalTask, type Task } from "$lib/api";
import { newId } from "$lib/db/id";
import { del, getAll, put, putMany } from "$lib/db/idb";
import { enqueue } from "$lib/db/outbox";
import { onPulled, sync } from "$lib/sync.svelte";
import { toasts } from "$lib/toast.svelte";
import { bucketForDate, parseISO, stripTokens } from "$lib/tokens";

type MaybeDeleted = Task & { deletedAt?: string | null };

// External tasks (Notion/Google) carry synthetic ids so the store can tell them
// apart from local rows and route edits to the source instead of the outbox.
export const isExternalId = (id: string): boolean => id.startsWith("notion:") || id.startsWith("google:");

// The raw @time token value ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM") if present.
const readTimeToken = (text: string): string | null => text.match(/@time:([^\s@]+)/)?.[1] ?? null;

// Offline-first tasks store. Same pattern as projects: IDB hydrate on boot,
// optimistic local writes, enqueued ops for sync. Bucket-based scheduling
// (today | week | later), with scheduledAt stamped server-side when a task
// moves into today/week.

class TasksStore {
  // Local, offline-first tasks (persisted in IDB, synced via the outbox).
  list = $state<Task[]>([]);
  // Live external tasks (Notion/Google). In-memory only — never persisted; the
  // source is the truth. Online-only.
  external = $state<ExternalTask[]>([]);
  // Id of the most recently created task — TaskItem scrolls it into view and
  // flashes it once, then clears this (#42).
  focusId = $state<string | null>(null);
  private booted = false;

  focus(id: string) {
    this.focusId = id;
  }

  clearFocus(id: string) {
    if (this.focusId === id) this.focusId = null;
  }

  // Local + external, as one list for display/filtering. ExternalTask is a
  // superset of Task, so the extra provenance fields are simply ignored by
  // display code.
  get all(): Task[] {
    return [...this.list, ...(this.external as unknown as Task[])];
  }

  get byBucket(): Record<Bucket, Task[]> {
    const out: Record<Bucket, Task[]> = { today: [], week: [], later: [] };
    for (const t of this.all) out[t.bucket as Bucket].push(t);
    for (const b of ["today", "week", "later"] as Bucket[]) {
      out[b].sort((a, b) => a.order - b.order);
    }
    return out;
  }

  async boot() {
    if (this.booted) return;
    this.booted = true;
    const cached = await getAll<Task>("tasks");
    // One-time cleanup: external items used to be persisted as local rows and
    // are now fetched live. Drop any legacy cached copies (identified by their
    // old provenance fields) so they don't duplicate the live-fetched ones.
    const legacy = new Set(
      cached
        .filter((t) => {
          const x = t as { source?: string; externalId?: string | null };
          return (x.source != null && x.source !== "manual") || x.externalId != null;
        })
        .map((t) => t.id),
    );
    if (legacy.size) await Promise.all([...legacy].map((id) => del("tasks", id)));
    this.list = cached.filter(
      (t) => !(t as Task & { deletedAt?: string | null }).deletedAt && !legacy.has(t.id),
    );
    onPulled(({ tasks }) => {
      if (!tasks.length) return;
      const map = new Map(this.list.map((t) => [t.id, t]));
      for (const t of tasks) {
        if ((t as Task & { deletedAt?: string | null }).deletedAt) {
          map.delete(t.id);
          continue;
        }
        // Skip if our local copy is strictly newer — a pull that landed
        // mid-flight (e.g. right after a local reorder) must not clobber
        // pending changes that haven't been pushed yet.
        const cur = map.get(t.id);
        if (cur && cur.updatedAt > t.updatedAt) continue;
        map.set(t.id, t);
      }
      this.list = Array.from(map.values());
    });
    sync.schedule(0);
    void this.refreshExternal();
  }

  // Pull the live external tasks (Notion/Google). In-memory only; online-only.
  async refreshExternal() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    try {
      this.external = await api.integrations.tasks.$get();
    } catch (err) {
      console.warn("[tasks] external fetch failed", err);
    }
  }

  byId(id: string): Task | undefined {
    return this.all.find((t) => t.id === id);
  }

  // Apply a task record that the server already persisted (e.g. via the voice
  // agent route). Bypasses the outbox — we'd just send the server its own
  // write back. Treats deletedAt as a tombstone, same as `onPulled`.
  async applyRemote(task: Task) {
    const tombstoned = (task as MaybeDeleted).deletedAt;
    if (tombstoned) {
      this.list = this.list.filter((t) => t.id !== task.id);
      await del("tasks", task.id);
      return;
    }
    const cur = this.byId(task.id);
    if (cur && cur.updatedAt > task.updatedAt) return;
    this.list = cur ? this.list.map((t) => (t.id === task.id ? task : t)) : [...this.list, task];
    await put("tasks", task);
  }

  async create(input: {
    text: string;
    bucket?: Bucket;
    projectId?: string | null;
    startTime?: string | null;
    duration?: number | null;
  }): Promise<Task> {
    const id = newId();
    const now = new Date().toISOString();
    const bucket: Bucket = input.bucket ?? "today";
    const peers = this.list.filter((t) => t.bucket === bucket);
    const order = (peers.at(-1)?.order ?? -1) + 1;
    const task = {
      id,
      userId: "",
      text: input.text,
      completed: false,
      order,
      bucket,
      scheduledAt: bucket === "later" ? null : now,
      projectId: input.projectId ?? null,
      startTime: input.startTime ?? null,
      duration: input.duration ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as Task;
    this.list = [...this.list, task];
    await put("tasks", task);
    await enqueue({
      kind: "task.create",
      id,
      text: input.text,
      bucket,
      scheduledAt: task.scheduledAt as unknown as string | null,
      projectId: input.projectId ?? null,
      startTime: input.startTime ?? null,
      duration: input.duration ?? null,
      order,
    });
    sync.schedule(0);
    return task;
  }

  async update(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    if (isExternalId(id)) return this.updateExternal(id, patch);
    const cur = this.byId(id);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    // Mirror server semantics: changing bucket re-stamps scheduledAt;
    // toggling completed stamps/clears completedAt.
    const bucketChange =
      patch.bucket !== undefined && patch.bucket !== cur.bucket
        ? { scheduledAt: patch.bucket === "later" ? null : now }
        : {};
    const completionChange =
      patch.completed !== undefined && patch.completed !== cur.completed
        ? { completedAt: patch.completed ? now : null }
        : {};
    const updated = { ...cur, ...patch, ...bucketChange, ...completionChange, updatedAt: now } as Task;
    this.list = this.list.map((t) => (t.id === id ? updated : t));
    // `updated` spreads `cur`, a $state proxy; snapshot so IndexedDB can clone it.
    await put("tasks", $state.snapshot(updated));
    await enqueue({
      kind: "task.update",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
      patch: { ...patch, ...bucketChange } as never,
    });
    sync.schedule(0);
    return updated;
  }

  // Edit a live external task: apply optimistically in memory, then write the
  // change straight back to the source. No IDB, no outbox. Reverts on failure.
  //
  // Notion takes any edit. Google takes completion only — the calendar.readonly
  // scope means we can't push text or dates back, so Google keeps owning those.
  private async updateExternal(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    const cur = this.external.find((t) => t.id === id);
    if (!cur) return undefined;
    if (cur.source === "google") return this.updateGoogle(cur, patch);

    // Derive the optimistic next state. Text edits carry the date as a @time
    // token, so re-derive scheduledAt/bucket from it; a completion toggle just
    // flips done. Buckets aren't independently editable (they follow the date).
    const now = new Date().toISOString();
    const nextText = patch.text ?? cur.text;
    const token = patch.text !== undefined ? readTimeToken(nextText) : null;
    const parsed = token ? parseISO(token) : null;
    const dateFields =
      patch.text !== undefined
        ? {
            scheduledAt: parsed ? parsed.date.toISOString() : null,
            startTime: parsed?.hasTime ? parsed.date.toISOString() : null,
            bucket: parsed ? bucketForDate(parsed.date) : ("later" as Bucket),
          }
        : {};
    const completionFields =
      patch.completed !== undefined ? { completed: patch.completed, completedAt: patch.completed ? now : null } : {};
    const updated = { ...cur, ...patch, ...dateFields, ...completionFields, updatedAt: now } as ExternalTask;
    this.external = this.external.map((t) => (t.id === id ? updated : t));

    try {
      await api.integrations.notion.task.$post({
        externalSourceId: cur.externalSourceId,
        externalId: cur.externalId,
        ...(patch.text !== undefined ? { title: stripTokens(nextText), date: token } : {}),
        ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      });
    } catch (err) {
      // Revert the optimistic change; surface the failure to the caller.
      this.external = this.external.map((t) => (t.id === id ? cur : t));
      toasts.error("Couldn't update Notion — please try again");
      throw err;
    }
    return updated as unknown as Task;
  }

  // Google-sourced tasks: completion only. The event's text, time and
  // recurrence are Google's to own — we hold nothing but the done bit, keyed to
  // the occurrence (scheduledAt), so ticking off today's standup doesn't tick
  // off next week's.
  private async updateGoogle(cur: ExternalTask, patch: Partial<Task>): Promise<Task | undefined> {
    if (patch.completed === undefined) {
      toasts.error("Calendar events can only be completed — edit them in Google Calendar");
      return cur as unknown as Task;
    }

    const completed = patch.completed;
    const updated = {
      ...cur,
      completed,
      completedAt: completed ? cur.scheduledAt : null,
      updatedAt: new Date().toISOString(),
    } as ExternalTask;
    this.external = this.external.map((t) => (t.id === cur.id ? updated : t));

    try {
      await api.integrations.google.task.$post({
        externalId: cur.externalId,
        scheduledAt: cur.scheduledAt ?? "",
        completed,
      });
    } catch (err) {
      this.external = this.external.map((t) => (t.id === cur.id ? cur : t));
      toasts.error("Couldn't update — please try again");
      throw err;
    }
    return updated as unknown as Task;
  }

  // Restore a previously soft-deleted task. Used by the voice undo flow when
  // the last turn included a `delete` action. The original row id is reused.
  async restore(task: Task) {
    this.list = this.list.some((t) => t.id === task.id)
      ? this.list.map((t) => (t.id === task.id ? task : t))
      : [...this.list, task];
    await put("tasks", task);
    await enqueue({ kind: "task.restore", id: task.id });
    sync.schedule(0);
  }

  async remove(id: string) {
    if (isExternalId(id)) {
      toasts.error(id.startsWith("google:") ? "Delete this event in Google Calendar" : "Delete this task in Notion");
      return;
    }
    const cur = this.byId(id);
    if (!cur) return;
    this.list = this.list.filter((t) => t.id !== id);
    await del("tasks", id);
    await enqueue({
      kind: "task.delete",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
    });
    sync.schedule(0);
  }

  // Reorder within / across buckets. Pass the full reordered slice for the
  // bucket(s) affected — each item's new order index is implicit.
  async reorder(items: { id: string; order: number; bucket: Bucket }[]) {
    // External tasks aren't ordered locally (they follow the source); drop them.
    items = items.filter((it) => !isExternalId(it.id));
    if (!items.length) return;
    const byId = new Map(this.list.map((t) => [t.id, t]));
    const now = new Date().toISOString();
    const updated: Task[] = [];
    for (const it of items) {
      const cur = byId.get(it.id);
      if (!cur) continue;
      const next = { ...cur, order: it.order, bucket: it.bucket, updatedAt: now } as Task;
      byId.set(it.id, next);
      updated.push(next);
    }
    this.list = Array.from(byId.values());
    await putMany("tasks", $state.snapshot(updated) as Task[]);
    await enqueue({ kind: "task.reorder", items });
    sync.schedule(0);
  }
}

export const tasks = new TasksStore();
