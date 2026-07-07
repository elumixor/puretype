<script lang="ts">
  import { Calendar, FileText, FolderPlus, Loader2 } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import { api } from "$lib/api/client";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { sync } from "$lib/sync.svelte";

  // Where the "add project" flow lives now: blank, or a project bound to a
  // Google calendar / Notion database. Replaces the old Settings → Integrations
  // panel — connecting an account happens inline here on demand.
  let { onClose, start = "choose" }: { onClose: () => void; start?: Step } = $props();

  type Step = "choose" | "blank" | "google" | "notion";
  // `start` seeds the initial step once; the modal is remounted per open, so
  // capturing the initial value (not tracking it) is intended.
  // svelte-ignore state_referenced_locally
  let step = $state<Step>(start);
  let busy = $state(false);
  let error = $state<string | null>(null);

  type Overview = Awaited<ReturnType<typeof api.integrations.$get>>;
  let overview = $state<Overview | null>(null);

  // Blank
  let name = $state("");
  let nameEl: HTMLInputElement | undefined = $state();

  // Google
  let gAccountId = $state("");
  let calendars = $state<{ id: string; name: string; primary: boolean }[]>([]);
  let gCalId = $state("");

  // Notion
  let nAccountId = $state("");
  let databases = $state<{ id: string; title: string }[]>([]);
  let nDbId = $state("");
  let properties = $state<{ id: string; name: string; type: string; options?: string[] }[]>([]);
  let nDate = $state("");
  let nStatus = $state("");
  let nDone = $state("");

  const dateProps = $derived(properties.filter((p) => p.type === "date"));
  const statusProps = $derived(properties.filter((p) => ["checkbox", "status", "select"].includes(p.type)));
  const selectedStatus = $derived(properties.find((p) => p.id === nStatus));
  const doneOptions = $derived(selectedStatus?.options ?? []);

  onMount(async () => {
    try {
      overview = await api.integrations.$get();
    } catch {
      overview = { google: { configured: false, accounts: [] }, notion: { configured: false, accounts: [] } } as Overview;
    }
    // Deep-linked into a source step (e.g. returning from OAuth) — preselect.
    if (step === "google") await enterGoogle();
    else if (step === "notion") await enterNotion();
  });

  // Create the project server-side-first, then bind the source. The project is
  // offline-first, so flush the outbox before binding or the bind 404s.
  async function createBoundProject(projectName: string, bind: (projectId: string) => Promise<void>) {
    busy = true;
    error = null;
    try {
      const project = await projects.create(projectName);
      await sync.runNow(); // ensure the server has the project row
      try {
        await bind(project.id);
      } catch {
        await sync.runNow(); // one retry in case of a create/bind race
        await bind(project.id);
      }
      projects.toggleFilter(project.id);
      sync.schedule(0); // pull the freshly imported tasks
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create project";
      busy = false;
    }
  }

  // --- blank ---
  async function chooseBlank() {
    step = "blank";
    await tick();
    nameEl?.focus();
  }
  async function createBlank() {
    const n = name.trim();
    if (!n) return;
    busy = true;
    try {
      const p = await projects.create(n);
      projects.toggleFilter(p.id);
      onClose();
    } finally {
      busy = false;
    }
  }

  // --- google ---
  async function chooseGoogle() {
    if (!overview?.google.accounts.length) return connect("google");
    step = "google";
    await enterGoogle();
  }
  async function enterGoogle() {
    gAccountId = overview?.google.accounts[0]?.id ?? "";
    if (gAccountId) await loadCalendars();
  }
  async function loadCalendars() {
    calendars = [];
    gCalId = "";
    error = null;
    try {
      const r = await api.integrations.google.calendars.$post({ accountId: gAccountId });
      calendars = r.calendars;
      gCalId = r.calendars.find((c) => c.primary)?.id ?? r.calendars[0]?.id ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load calendars";
    }
  }
  async function createGoogle() {
    const cal = calendars.find((c) => c.id === gCalId);
    if (!cal) return;
    await createBoundProject(cal.name, (projectId) =>
      api.integrations.google.sources
        .$post({ accountId: gAccountId, calendarId: cal.id, calendarName: cal.name, projectId })
        .then(() => {}),
    );
  }

  // --- notion ---
  async function chooseNotion() {
    if (!overview?.notion.accounts.length) return connect("notion");
    step = "notion";
    await enterNotion();
  }
  async function enterNotion() {
    nAccountId = overview?.notion.accounts[0]?.id ?? "";
    if (nAccountId) await loadDatabases();
  }
  async function loadDatabases() {
    databases = [];
    nDbId = "";
    properties = [];
    error = null;
    try {
      const r = await api.integrations.notion.databases.$post({ accountId: nAccountId });
      databases = r.databases;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load databases";
    }
  }
  async function onPickDb(databaseId: string) {
    nDbId = databaseId;
    properties = [];
    nDate = nStatus = nDone = "";
    if (!databaseId) return;
    try {
      const r = await api.integrations.notion.properties.$post({ accountId: nAccountId, databaseId });
      properties = r.properties;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load properties";
    }
  }
  async function createNotion() {
    const db = databases.find((d) => d.id === nDbId);
    if (!db) return;
    const t = selectedStatus?.type;
    const statusPropType = t === "checkbox" || t === "status" || t === "select" ? t : null;
    await createBoundProject(db.title, (projectId) =>
      api.integrations.notion.sources
        .$post({
          accountId: nAccountId,
          databaseId: db.id,
          databaseName: db.title,
          projectId,
          datePropertyId: nDate || null,
          statusPropertyId: nStatus || null,
          statusPropType,
          doneValue: statusPropType === "checkbox" ? null : nDone || null,
        })
        .then(() => {}),
    );
  }

  // Kick off OAuth. Remember which source we were adding so the app can reopen
  // this modal on the redirect back (see routes/+page.svelte).
  async function connect(provider: "google" | "notion") {
    busy = true;
    error = null;
    try {
      localStorage.setItem("pendingProjectSource", provider);
      const { url } =
        provider === "google"
          ? await api.integrations.google.authorize.$get()
          : await api.integrations.notion.authorize.$get();
      window.location.href = url;
    } catch (e) {
      localStorage.removeItem("pendingProjectSource");
      error = e instanceof Error ? e.message : "Couldn't start connect";
      busy = false;
    }
  }

  const selectCls =
    "w-full h-10 px-2.5 rounded-xl bg-[var(--color-surface)] text-[13px] text-[var(--color-ink)] border border-[var(--color-border)]";
</script>

<button aria-label="Close" class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in" onclick={onClose}
></button>
<div
  role="dialog"
  aria-label="New project"
  class="fixed left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/4 z-[61] w-[min(92vw,380px)]
    p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
    shadow-2xl shadow-black/50 animate-scale-in max-h-[80vh] overflow-y-auto"
>
  <h2 class="text-sm font-semibold mb-4">New project</h2>

  {#if step === "choose"}
    <div class="space-y-2">
      <button
        type="button"
        onclick={chooseBlank}
        class="w-full flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-3)] transition-colors text-left"
      >
        <FolderPlus size={18} class="text-[var(--color-ink-2)]" />
        <span class="text-sm font-medium">Blank project</span>
      </button>
      {#if overview?.google.configured}
        <button
          type="button"
          onclick={chooseGoogle}
          disabled={busy}
          class="w-full flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-3)] transition-colors text-left disabled:opacity-50"
        >
          <Calendar size={18} class="text-[var(--color-ink-2)]" />
          <span class="text-sm font-medium">From Google Calendar</span>
          {#if !overview.google.accounts.length}<span class="ml-auto text-[11px] text-[var(--color-ink-3)]">Connect</span>{/if}
        </button>
      {/if}
      {#if overview?.notion.configured}
        <button
          type="button"
          onclick={chooseNotion}
          disabled={busy}
          class="w-full flex items-center gap-3 h-12 px-3.5 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-3)] transition-colors text-left disabled:opacity-50"
        >
          <FileText size={18} class="text-[var(--color-ink-2)]" />
          <span class="text-sm font-medium">From Notion</span>
          {#if !overview.notion.accounts.length}<span class="ml-auto text-[11px] text-[var(--color-ink-3)]">Connect</span>{/if}
        </button>
      {/if}
    </div>

  {:else if step === "blank"}
    <input
      bind:this={nameEl}
      bind:value={name}
      placeholder="Project name"
      onkeydown={(e) => {
        if (e.key === "Enter") createBlank();
        else if (e.key === "Escape") (step = "choose");
      }}
      class="w-full h-11 px-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
    />

  {:else if step === "google"}
    <div class="space-y-2.5">
      {#if overview && overview.google.accounts.length > 1}
        <select bind:value={gAccountId} onchange={loadCalendars} class={selectCls}>
          {#each overview.google.accounts as a (a.id)}<option value={a.id}>{a.email}</option>{/each}
        </select>
      {/if}
      <select bind:value={gCalId} class={selectCls}>
        {#each calendars as c (c.id)}<option value={c.id}>{c.name}{c.primary ? " (primary)" : ""}</option>{/each}
      </select>
      <p class="text-[11px] text-[var(--color-ink-3)]">A project named after the calendar will be created and its events imported.</p>
    </div>

  {:else if step === "notion"}
    <div class="space-y-2.5">
      {#if overview && overview.notion.accounts.length > 1}
        <select bind:value={nAccountId} onchange={loadDatabases} class={selectCls}>
          {#each overview.notion.accounts as a (a.id)}<option value={a.id}>{a.workspaceName}</option>{/each}
        </select>
      {/if}
      <select value={nDbId} onchange={(e) => onPickDb(e.currentTarget.value)} class={selectCls}>
        <option value="">Choose a database…</option>
        {#each databases as d (d.id)}<option value={d.id}>{d.title}</option>{/each}
      </select>
      {#if nDbId}
        <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Date property</span>
        <select bind:value={nDate} class={selectCls}>
          <option value="">None</option>
          {#each dateProps as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
        <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Done property</span>
        <select bind:value={nStatus} onchange={() => (nDone = "")} class={selectCls}>
          <option value="">None</option>
          {#each statusProps as p (p.id)}<option value={p.id}>{p.name} ({p.type})</option>{/each}
        </select>
        {#if doneOptions.length}
          <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">"Done" means</span>
          <select bind:value={nDone} class={selectCls}>
            <option value="">Choose…</option>
            {#each doneOptions as o (o)}<option value={o}>{o}</option>{/each}
          </select>
        {/if}
      {/if}
    </div>
  {/if}

  {#if error}<p class="text-xs text-red-500 mt-3">{error}</p>{/if}

  <div class="flex justify-end gap-2 mt-5">
    {#if step !== "choose"}
      <button type="button" onclick={() => (step = "choose")} class="px-4 h-10 rounded-xl text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)] transition-colors">
        Back
      </button>
    {/if}
    {#if step === "blank"}
      <button type="button" onclick={createBlank} disabled={busy || !name.trim()} class="px-4 h-10 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50">Create</button>
    {:else if step === "google"}
      <button type="button" onclick={createGoogle} disabled={busy || !gCalId} class="px-4 h-10 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50 inline-flex items-center gap-1.5">
        {#if busy}<Loader2 size={14} class="animate-spin" />{/if} Create
      </button>
    {:else if step === "notion"}
      <button type="button" onclick={createNotion} disabled={busy || !nDbId} class="px-4 h-10 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-50 inline-flex items-center gap-1.5">
        {#if busy}<Loader2 size={14} class="animate-spin" />{/if} Create
      </button>
    {/if}
  </div>
</div>
