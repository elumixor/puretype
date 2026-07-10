import { browser } from "$app/environment";
import { api, type Project, type Task } from "$lib/api";
import { authReady } from "$lib/auth-ready";
import { getMeta, putMany, setMeta } from "$lib/db/idb";
import { listPending, markFailed, markInflight, type Op, pendingOpIds, remove } from "$lib/db/outbox";

// Background sync: drains the outbox (writes) then pulls deltas (reads).
// Runs on boot, on every outbox enqueue, on online/visibility events, and
// every 30s as a heartbeat. The drain is serialized via `running` so we
// never push the same op twice.
//
// Consumers subscribe via `onPulled` to apply pulled rows into their stores.

type Pulled = {
  tasks: Task[];
  projects: Project[];
  serverTime: string;
};
type Listener = (p: Pulled) => void;

const listeners = new Set<Listener>();
let running = false;
let inflight: Promise<void> | null = null;
let scheduleHandle: ReturnType<typeof setTimeout> | null = null;
let status = $state<"idle" | "syncing" | "offline" | "error">("idle");

export function onPulled(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const sync = {
  get status() {
    return status;
  },
  schedule(delayMs = 0) {
    if (!browser) return;
    if (scheduleHandle) clearTimeout(scheduleHandle);
    scheduleHandle = setTimeout(() => {
      scheduleHandle = null;
      void runOnce();
    }, delayMs);
  },
  // Guarantees a full drain has completed by the time it resolves. If a sync is
  // already in flight, wait for it to finish, then run a fresh one — the running
  // sync may have started before our newest op was enqueued, so its drain
  // wouldn't include it. Callers that create-then-bind depend on this.
  async runNow() {
    if (inflight) await inflight.catch(() => {});
    await runOnce();
  },
};

function runOnce(): Promise<void> {
  if (!browser) return Promise.resolve();
  if (running) return inflight ?? Promise.resolve();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    status = "offline";
    return Promise.resolve();
  }
  running = true;
  status = "syncing";
  inflight = (async () => {
    try {
      await authReady;
      await drainOutbox();
      await pullDeltas();
      status = "idle";
    } catch (err) {
      console.warn("[sync] failed", err);
      status = "error";
    } finally {
      running = false;
      inflight = null;
    }
  })();
  return inflight;
}

// Push: send all pending ops to the server, one batch. The server returns
// per-op results; we drop acked ops and tombstone conflicts (server-row
// wins; client picks up the truth via the pull half).
async function drainOutbox() {
  const entries = await listPending();
  const batch = entries.filter((e) => e.status !== "failed");
  if (!batch.length) return;
  const seqs = batch.map((e) => e.seq).filter((s): s is number => s !== undefined);
  await markInflight(seqs);

  const ops: Op[] = batch.map((e) => e.op);
  const res = await api.sync.push.$post({ ops });

  const ok: number[] = [];
  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    const seq = batch[i].seq;
    if (seq === undefined) continue;
    if (r.ok) {
      ok.push(seq);
    } else if (r.reason === "conflict" || r.reason === "not_found") {
      // Server wins. Drop the op so we don't replay it. Pull will reconcile.
      ok.push(seq);
    } else {
      await markFailed(seq, r.detail);
    }
  }
  await remove(ok);
}

// Pull: fetch rows updated since the last cursor and hand them to listeners.
// `serverTime` from the response is the new cursor — never the client clock.
async function pullDeltas() {
  const since = (await getMeta<string>("lastSyncAt")) ?? undefined;
  const res = await api.sync.pull.$post(since ? { since } : {});
  // Don't let the pull overwrite rows that still have un-pushed local edits.
  // Once those ops drain, the server bumps their updatedAt past this cursor,
  // so a later pull re-delivers them and they reconcile normally.
  const pending = await pendingOpIds();
  const tasks = res.tasks.filter((t) => !pending.tasks.has(t.id));
  const projects = res.projects.filter((p) => !pending.projects.has(p.id));
  // Persist tasks + projects locally so a cold open is instant.
  if (tasks.length) await putMany("tasks", tasks);
  if (projects.length) await putMany("projects", projects);
  await setMeta("lastSyncAt", res.serverTime);
  for (const cb of listeners) cb({ tasks, projects, serverTime: res.serverTime });
}

// Wire boot triggers. Module side effects are OK here — this file is
// imported once from the root layout.
if (browser) {
  window.addEventListener("online", () => sync.schedule(0));
  window.addEventListener("offline", () => {
    status = "offline";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync.schedule(0);
  });
  setInterval(() => sync.schedule(0), 30_000);
}
