<script lang="ts">
  import { Calendar, ChevronRight, FileText, FolderPlus, Loader2 } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import { api } from "$lib/api/client";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { sync } from "$lib/sync.svelte";
  import NotionFilters, { type Condition } from "./project-editor/NotionFilters.svelte";
  import Select from "./ui/Select.svelte";

  // Where the "add project" flow lives: blank, or a project bound to a Google
  // calendar / Notion database. Connecting an account happens inline (as a
  // dropdown option), and the project name is editable before creating.
  let { onClose, start = "choose" }: { onClose: () => void; start?: Step } = $props();

  type Step = "choose" | "blank" | "google" | "notion";
  // svelte-ignore state_referenced_locally
  let step = $state<Step>(start);
  let busy = $state(false);
  let error = $state<string | null>(null);

  type Overview = Awaited<ReturnType<typeof api.integrations.$get>>;
  let overview = $state<Overview | null>(null);

  let name = $state(""); // project name (blank step, or alias for a source)
  let nameEl: HTMLInputElement | undefined = $state();

  // Google
  let gAccountId = $state("");
  let calendars = $state<{ id: string; name: string; primary: boolean }[]>([]);
  let gCalId = $state("");
  let loadingList = $state(false);

  // Notion
  let nAccountId = $state("");
  let databases = $state<{ id: string; title: string }[]>([]);
  let nDbId = $state("");
  let properties = $state<{ id: string; name: string; type: string; options?: string[] }[]>([]);
  let nDate = $state("");
  let nStatus = $state("");
  let nDone = $state("");
  let nFilters = $state<Condition[]>([]);

  const dateProps = $derived(properties.filter((p) => p.type === "date"));
  const statusProps = $derived(properties.filter((p) => ["checkbox", "status", "select"].includes(p.type)));
  const doneOptions = $derived(properties.find((p) => p.id === nStatus)?.options ?? []);

  const gAccountOptions = $derived([
    ...(overview?.google.accounts ?? []).map((a) => ({ value: a.id, label: a.email })),
    { value: "__connect", label: "Connect another account…", action: true },
  ]);
  const calOptions = $derived(calendars.map((c) => ({ value: c.id, label: c.name + (c.primary ? " · primary" : "") })));
  const nAccountOptions = $derived([
    ...(overview?.notion.accounts ?? []).map((a) => ({ value: a.id, label: a.workspaceName })),
    { value: "__connect", label: "Connect another workspace…", action: true },
  ]);
  const dbOptions = $derived(databases.map((d) => ({ value: d.id, label: d.title })));
  const dateOptions = $derived([{ value: "", label: "None" }, ...dateProps.map((p) => ({ value: p.id, label: p.name }))]);
  const statusOptions = $derived([
    { value: "", label: "None" },
    ...statusProps.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` })),
  ]);
  const doneValueOptions = $derived([
    { value: "", label: "Choose…" },
    ...doneOptions.map((o) => ({ value: o, label: o })),
  ]);

  onMount(async () => {
    try {
      overview = await api.integrations.$get();
    } catch {
      overview = { google: { configured: false, accounts: [] }, notion: { configured: false, accounts: [] } } as Overview;
    }
    if (step === "google") await enterGoogle();
    else if (step === "notion") await enterNotion();
  });

  async function createBoundProject(bind: (projectId: string) => Promise<void>) {
    const projectName = name.trim();
    if (!projectName) return;
    busy = true;
    error = null;
    try {
      const project = await projects.create(projectName);
      await sync.runNow();
      try {
        await bind(project.id);
      } catch {
        await sync.runNow();
        await bind(project.id);
      }
      projects.toggleFilter(project.id);
      sync.schedule(0);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create project";
      busy = false;
    }
  }

  // --- blank ---
  async function chooseBlank() {
    step = "blank";
    name = "";
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
    loadingList = true;
    try {
      const r = await api.integrations.google.calendars.$post({ accountId: gAccountId });
      calendars = r.calendars;
      const primary = r.calendars.find((c) => c.primary) ?? r.calendars[0];
      if (primary) {
        gCalId = primary.id;
        name = primary.name;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load calendars";
    } finally {
      loadingList = false;
    }
  }
  function onPickCal(id: string) {
    gCalId = id;
    name = calendars.find((c) => c.id === id)?.name ?? name;
  }
  async function createGoogle() {
    const cal = calendars.find((c) => c.id === gCalId);
    if (!cal) return;
    await createBoundProject((projectId) =>
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
    loadingList = true;
    try {
      const r = await api.integrations.notion.databases.$post({ accountId: nAccountId });
      databases = r.databases;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load databases";
    } finally {
      loadingList = false;
    }
  }
  async function onPickDb(databaseId: string) {
    nDbId = databaseId;
    properties = [];
    nDate = nStatus = nDone = "";
    nFilters = [];
    name = databases.find((d) => d.id === databaseId)?.title ?? name;
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
    const t = properties.find((p) => p.id === nStatus)?.type;
    const statusPropType = t === "checkbox" || t === "status" || t === "select" ? t : null;
    await createBoundProject((projectId) =>
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
          filters: nFilters,
        })
        .then(() => {}),
    );
  }

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

  const inputCls =
    "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent transition-colors";
  const labelCls = "block text-[11px] font-medium uppercase tracking-wider text-ink-3 mb-1.5";
</script>

<div use:portal>
  <button aria-label="Close" class="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm animate-fade-in" onclick={onClose}
  ></button>
  <div
    role="dialog"
    aria-label="New project"
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[91] w-[min(92vw,400px)]
      rounded-xl border border-border bg-surface-2 p-5 shadow-2xl shadow-black/50 animate-scale-in
      max-h-[85vh] overflow-y-auto"
  >
    <div class="mb-4">
      <h2 class="text-[15px] font-semibold tracking-tight text-ink">New project</h2>
      <p class="text-xs text-ink-3 mt-0.5">
        {#if step === "choose"}Start blank or pull items from a connected source.
        {:else if step === "blank"}Give it a name.
        {:else if step === "google"}Pick a calendar to import its events.
        {:else}Pick a database and map its date and done fields.{/if}
      </p>
    </div>

    {#if step === "choose"}
      <div class="space-y-1.5">
        {#snippet chooser(Icon: typeof FolderPlus, label: string, sub: string | null, onclick: () => void, disabled = false)}
          <button
            type="button"
            {onclick}
            {disabled}
            class="group w-full flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5
              text-left hover:bg-surface-3 hover:border-border-hover transition-colors disabled:opacity-50"
          >
            <Icon size={17} class="text-ink-2 shrink-0" />
            <span class="text-sm font-medium text-ink flex-1 min-w-0">{label}</span>
            {#if sub}<span class="text-[11px] text-ink-3">{sub}</span>{/if}
            <ChevronRight size={15} class="text-ink-3 group-hover:text-ink-2 transition-colors" />
          </button>
        {/snippet}
        {@render chooser(FolderPlus, "Blank project", null, chooseBlank)}
        {#if overview?.google.configured}
          {@render chooser(Calendar, "Google Calendar", overview.google.accounts.length ? null : "Connect", chooseGoogle, busy)}
        {/if}
        {#if overview?.notion.configured}
          {@render chooser(FileText, "Notion", overview.notion.accounts.length ? null : "Connect", chooseNotion, busy)}
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
        class={inputCls}
      />

    {:else if step === "google"}
      <div class="space-y-3">
        <div>
          <span class={labelCls}>Account</span>
          <Select bind:value={gAccountId} options={gAccountOptions} onChange={loadCalendars} onAction={() => connect("google")} />
        </div>
        <div>
          <span class={labelCls}>Calendar</span>
          <Select value={gCalId} options={calOptions} placeholder={loadingList ? "Loading…" : "Choose…"} onChange={onPickCal} />
        </div>
        <div>
          <span class={labelCls}>Project name</span>
          <input bind:value={name} placeholder="Project name" class={inputCls} />
        </div>
      </div>

    {:else if step === "notion"}
      <div class="space-y-3">
        <div>
          <span class={labelCls}>Workspace</span>
          <Select bind:value={nAccountId} options={nAccountOptions} onChange={loadDatabases} onAction={() => connect("notion")} />
        </div>
        <div>
          <span class={labelCls}>Database</span>
          <Select value={nDbId} options={dbOptions} placeholder={loadingList ? "Loading…" : "Choose a database…"} onChange={onPickDb} />
        </div>
        {#if nDbId}
          <div>
            <span class={labelCls}>Project name</span>
            <input bind:value={name} placeholder="Project name" class={inputCls} />
          </div>
          <div>
            <span class={labelCls}>Date property</span>
            <Select bind:value={nDate} options={dateOptions} />
          </div>
          <div>
            <span class={labelCls}>Done property</span>
            <Select bind:value={nStatus} options={statusOptions} onChange={() => (nDone = "")} />
          </div>
          {#if doneOptions.length}
            <div>
              <span class={labelCls}>"Done" means</span>
              <Select bind:value={nDone} options={doneValueOptions} />
            </div>
          {/if}
          <NotionFilters {properties} bind:conditions={nFilters} />
        {/if}
      </div>
    {/if}

    {#if error}<p class="text-xs text-danger mt-3">{error}</p>{/if}

    <div class="flex justify-end gap-2 mt-5">
      {#if step !== "choose"}
        <button type="button" onclick={() => (step = "choose")}
          class="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium text-ink-2 hover:bg-surface-3 transition-colors">
          Back
        </button>
      {/if}
      {#if step === "blank"}
        <button type="button" onclick={createBlank} disabled={busy || !name.trim()}
          class="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-50">Create</button>
      {:else if step === "google"}
        <button type="button" onclick={createGoogle} disabled={busy || !gCalId || !name.trim()}
          class="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-50">
          {#if busy}<Loader2 size={14} class="animate-spin" />{/if} Create
        </button>
      {:else if step === "notion"}
        <button type="button" onclick={createNotion} disabled={busy || !nDbId || !name.trim()}
          class="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-50">
          {#if busy}<Loader2 size={14} class="animate-spin" />{/if} Create
        </button>
      {/if}
    </div>
  </div>
</div>
