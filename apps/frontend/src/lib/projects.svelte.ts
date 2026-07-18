import type { Project } from "$lib/api";
import { api } from "$lib/api/client";
import { newId } from "$lib/db/id";
import { del, getAll, put, putMany } from "$lib/db/idb";
import { enqueue } from "$lib/db/outbox";
import { ls } from "$lib/storage";
import { onPulled, sync } from "$lib/sync.svelte";

const MUTED_KEY = "mutedProjects";

// Offline-first projects store. Hydrates from IndexedDB on construction so
// the UI renders instantly with cached rows, then `boot()` kicks off a sync
// pull to reconcile with the server. Every mutation is applied optimistically
// to the in-memory list + IDB, then enqueued in the outbox for the sync
// runner to push.

class ProjectsStore {
  list = $state<Project[]>([]);
  filterId = $state<string | null>(null);
  showHidden = $state(false);
  scrollRequestTick = $state(0);
  // Projects whose tasks are hidden from the list (toggled by tapping a chip).
  // Persisted locally; a Set wrapped in $state for reactivity.
  mutedIds = $state<Set<string>>(new Set());
  private previousFilterId: string | null = null;
  private booted = false;

  // Projects bound to an external source, mapped to their provider. Source-linked
  // projects aren't nestable and show the provider's icon. Populated from the
  // integrations overview.
  linked = $state<Map<string, "google" | "notion">>(new Map());

  isMuted(id: string): boolean {
    return this.mutedIds.has(id);
  }

  isLinked(id: string): boolean {
    return this.linked.has(id);
  }

  providerOf(id: string): "google" | "notion" | undefined {
    return this.linked.get(id);
  }

  setLinked(entries: Iterable<[string, "google" | "notion"]>) {
    this.linked = new Map(entries);
  }

  async refreshLinks() {
    try {
      const ov = await api.integrations.$get();
      const entries: [string, "google" | "notion"][] = [];
      for (const a of ov.google.accounts) for (const s of a.calendarSources) entries.push([s.projectId, "google"]);
      for (const a of ov.notion.accounts) for (const s of a.notionSources) entries.push([s.projectId, "notion"]);
      this.linked = new Map(entries);
    } catch {
      // offline / auth not ready — keep whatever we had
    }
  }

  toggleMuted(id: string) {
    const next = new Set(this.mutedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.mutedIds = next;
    void ls.set(MUTED_KEY, JSON.stringify([...next]));
  }

  // Archived projects (and their tasks) are hidden from every view until
  // restored. `active` is the base set the whole UI works from — hidden/visible
  // are further slices of it, and archived rows never appear in either.
  get active(): Project[] {
    return this.list.filter((p) => !this.isArchivedRow(p));
  }
  get visible(): Project[] {
    return this.active.filter((p) => !p.hidden);
  }
  get hiddenList(): Project[] {
    return this.active.filter((p) => p.hidden);
  }
  get archivedList(): Project[] {
    return this.list.filter((p) => this.isArchivedRow(p));
  }
  get filter(): Project | undefined {
    return this.list.find((p) => p.id === this.filterId);
  }

  private isArchivedRow(p: Project): boolean {
    return !!(p as Project & { archivedAt?: string | null }).archivedAt;
  }
  isArchived(id: string): boolean {
    const p = this.byId(id);
    return !!p && this.isArchivedRow(p);
  }

  async boot() {
    if (this.booted) return;
    this.booted = true;
    // Hydrate from IDB synchronously (well, one async tick). UI can render
    // these rows immediately — no network gate.
    const cached = await getAll<Project>("projects");
    this.list = cached.filter((p) => !(p as Project & { deletedAt?: string | null }).deletedAt).sort(byOrder);
    try {
      const raw = await ls.get(MUTED_KEY);
      if (raw) this.mutedIds = new Set(JSON.parse(raw) as string[]);
    } catch {
      // stale preference — ignore
    }
    // Subscribe to sync deltas — apply server changes into the live list.
    onPulled(({ projects }) => {
      if (!projects.length) return;
      const map = new Map(this.list.map((p) => [p.id, p]));
      for (const p of projects) {
        if ((p as Project & { deletedAt?: string | null }).deletedAt) {
          map.delete(p.id);
          continue;
        }
        // Don't clobber a locally-newer row — a pull that landed mid-flight
        // right after a local edit must not overwrite pending changes.
        const cur = map.get(p.id);
        if (cur && cur.updatedAt > p.updatedAt) continue;
        map.set(p.id, p);
      }
      this.list = Array.from(map.values()).sort(byOrder);
      this.reconcileFilters();
    });
    sync.schedule(0);
    void this.refreshLinks();
  }

  byId(id: string | null | undefined): Project | undefined {
    return id ? this.list.find((p) => p.id === id) : undefined;
  }
  byName(name: string): Project | undefined {
    const n = name.trim().toLowerCase();
    return this.list.find((p) => p.name.toLowerCase() === n);
  }

  async create(name: string): Promise<Project> {
    const existing = this.byName(name);
    if (existing) return existing;
    const id = newId();
    const now = new Date().toISOString();
    const created = {
      id,
      userId: "", // server fills; not used client-side
      name: name.trim(),
      avatarType: "auto",
      emoji: null,
      image: null,
      hue: null,
      hidden: false,
      capitalization: "sentence",
      order: (this.list.at(-1)?.order ?? -1) + 1,
      parentIds: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as Project;
    this.list = [...this.list, created];
    await put("projects", created);
    await enqueue({
      kind: "project.create",
      id,
      name: created.name,
      order: created.order,
    });
    sync.schedule(0);
    return created;
  }

  // Guarantee the project exists on the server before we depend on it (e.g.
  // binding an external source to it). `create()` short-circuits on an existing
  // local project via byName, so that project may never have been pushed — or a
  // prior push may have failed. The server op is an idempotent upsert, so we can
  // safely (re-)enqueue a create and flush. Resolves once the sync has drained.
  async ensureCreated(project: Project): Promise<void> {
    await enqueue({ kind: "project.create", id: project.id, name: project.name, order: project.order });
    await sync.runNow();
  }

  async update(id: string, patch: Partial<Project>): Promise<Project | undefined> {
    const cur = this.byId(id);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    const updated = { ...cur, ...patch, updatedAt: now } as Project;
    this.list = this.list.map((p) => (p.id === id ? updated : p));
    // `updated` spreads `cur`, a $state proxy, so nested fields (parentIds) are
    // proxy arrays that IndexedDB can't structured-clone. Snapshot before put.
    await put("projects", $state.snapshot(updated));
    await enqueue({
      kind: "project.update",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
      patch: $state.snapshot(patch) as never,
    });
    sync.schedule(0);
    return updated;
  }

  // mode "clear" (default) keeps the project's tasks but orphans them; "purge"
  // deletes the tasks too. The server applies the task changes and detaches any
  // external source; they arrive back on the next pull.
  async remove(id: string, mode: "clear" | "purge" = "clear") {
    const cur = this.byId(id);
    if (!cur) return;
    this.list = this.list.filter((p) => p.id !== id);
    if (this.filterId === id) this.filterId = null;
    if (this.previousFilterId === id) this.previousFilterId = null;
    await del("projects", id);
    await enqueue({
      kind: "project.delete",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
      mode,
    });
    sync.schedule(0);
  }

  // Reversible soft-hide: the project and its tasks drop out of every view but
  // nothing is destroyed. Applied optimistically by flipping archivedAt locally.
  async archive(id: string) {
    await this.setArchived(id, new Date().toISOString());
    if (this.filterId === id) this.filterId = null;
    if (this.previousFilterId === id) this.previousFilterId = null;
  }

  async restore(id: string) {
    await this.setArchived(id, null);
  }

  private async setArchived(id: string, archivedAt: string | null) {
    const cur = this.byId(id);
    if (!cur) return;
    const now = new Date().toISOString();
    const updated = { ...cur, archivedAt, updatedAt: now } as Project;
    this.list = this.list.map((p) => (p.id === id ? updated : p));
    await put("projects", $state.snapshot(updated));
    await enqueue({ kind: archivedAt ? "project.archive" : "project.restore", id });
    sync.schedule(0);
  }

  toggleFilter(id: string) {
    this.previousFilterId = null;
    this.filterId = this.filterId === id ? null : id;
  }

  setFilterFromTask(id: string) {
    if (this.filterId === id) {
      if (this.previousFilterId !== null) {
        const restored = this.previousFilterId;
        this.previousFilterId = null;
        this.filterId = restored;
      }
    } else {
      this.previousFilterId = this.filterId;
      this.filterId = id;
      const target = this.byId(id);
      if (target?.hidden) this.showHidden = true;
    }
    this.scrollRequestTick++;
  }

  clearFilter() {
    this.previousFilterId = null;
    this.filterId = null;
  }

  async reorder(ids: string[]) {
    const byId = new Map(this.list.map((p) => [p.id, p]));
    const reordered: Project[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i++) {
      const p = byId.get(ids[i]);
      if (p) reordered.push({ ...p, order: i, updatedAt: now } as Project);
    }
    for (const p of this.list) if (!ids.includes(p.id)) reordered.push(p);
    this.list = reordered;
    await putMany("projects", $state.snapshot(reordered) as Project[]);
    for (const p of reordered) {
      await enqueue({
        kind: "project.update",
        id: p.id,
        clientUpdatedAt: now,
        patch: { order: p.order },
      });
    }
    sync.schedule(0);
  }

  parentsOf(id: string | null | undefined): Project[] {
    const p = this.byId(id);
    if (!p) return [];
    return p.parentIds.map((pid) => this.byId(pid)).filter((x): x is Project => !!x);
  }

  childrenOf(id: string | null | undefined): Project[] {
    if (!id) return [];
    return this.list.filter((p) => p.parentIds.includes(id));
  }

  descendantIds(id: string): Set<string> {
    const out = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const p of this.list) {
        if (out.has(p.id)) continue;
        if (p.parentIds.some((pid) => out.has(pid))) {
          out.add(p.id);
          added = true;
        }
      }
    }
    return out;
  }

  private reconcileFilters() {
    const ids = new Set(this.list.map((p) => p.id));
    if (this.filterId && !ids.has(this.filterId)) this.filterId = null;
    if (this.previousFilterId && !ids.has(this.previousFilterId)) this.previousFilterId = null;
  }
}

function byOrder(a: { order: number }, b: { order: number }) {
  return a.order - b.order;
}

export const projects = new ProjectsStore();
