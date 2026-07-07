<script lang="ts">
  import { Plus, X } from "lucide-svelte";
  import { api } from "$lib/api/client";
  import { projects } from "$lib/projects.svelte";

  interface NotionSource {
    id: string;
    databaseId: string;
    databaseName: string;
    projectId: string;
    datePropertyId: string | null;
    statusPropertyId: string | null;
    doneValue: string | null;
    lastSyncedAt: string | null;
  }
  interface Account {
    id: string;
    workspaceName: string;
    workspaceIcon: string | null;
    notionSources: NotionSource[];
  }
  interface NotionData {
    configured: boolean;
    accounts: Account[];
  }
  interface Property {
    id: string;
    name: string;
    type: string;
    options?: string[];
  }

  let { notion, onReload }: { notion: NotionData; onReload: () => Promise<void> } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);
  let addingFor = $state<string | null>(null);
  let databases = $state<{ id: string; title: string }[]>([]);
  let properties = $state<Property[]>([]);
  let pickDb = $state("");
  let pickProject = $state("");
  let pickDate = $state("");
  let pickStatus = $state("");
  let pickDone = $state("");

  // Only date-typed props are valid for scheduling; only checkbox/status/select
  // represent a done-state.
  const dateProps = $derived(properties.filter((p) => p.type === "date"));
  const statusProps = $derived(properties.filter((p) => ["checkbox", "status", "select"].includes(p.type)));
  const selectedStatus = $derived(properties.find((p) => p.id === pickStatus));
  const doneOptions = $derived(selectedStatus?.options ?? []);

  const projectName = (id: string) => projects.byId(id)?.name ?? "Unknown project";

  async function connect() {
    busy = true;
    error = null;
    try {
      const { url } = await api.integrations.notion.authorize.$get();
      window.location.href = url;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start Notion connect";
      busy = false;
    }
  }

  async function openAdd(accountId: string) {
    addingFor = accountId;
    databases = [];
    properties = [];
    pickDb = "";
    pickProject = projects.list[0]?.id ?? "";
    pickDate = pickStatus = pickDone = "";
    error = null;
    try {
      const res = await api.integrations.notion.databases.$post({ accountId });
      databases = res.databases;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load databases";
    }
  }

  async function onPickDb(accountId: string, databaseId: string) {
    pickDb = databaseId;
    properties = [];
    pickDate = pickStatus = pickDone = "";
    if (!databaseId) return;
    try {
      const res = await api.integrations.notion.properties.$post({ accountId, databaseId });
      properties = res.properties;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load properties";
    }
  }

  async function addSource(accountId: string) {
    const db = databases.find((d) => d.id === pickDb);
    if (!db || !pickProject) return;
    const statusType = selectedStatus?.type;
    const statusPropType =
      statusType === "checkbox" || statusType === "status" || statusType === "select" ? statusType : null;
    busy = true;
    error = null;
    try {
      await api.integrations.notion.sources.$post({
        accountId,
        databaseId: db.id,
        databaseName: db.title,
        projectId: pickProject,
        datePropertyId: pickDate || null,
        statusPropertyId: pickStatus || null,
        statusPropType,
        // checkbox needs no option; status/select carry the "done" option name
        doneValue: statusPropType === "checkbox" ? null : pickDone || null,
      });
      addingFor = null;
      await onReload();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't add database";
    } finally {
      busy = false;
    }
  }

  async function removeSource(id: string) {
    busy = true;
    try {
      await api.integrations.notion.sources(id).$delete();
      await onReload();
    } finally {
      busy = false;
    }
  }

  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this Notion workspace? Its imported tasks will be removed.")) return;
    busy = true;
    try {
      await api.integrations.notion.accounts(id).$delete();
      await onReload();
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
  <div class="flex items-center gap-2.5 mb-3">
    <span class="text-sm font-semibold">Notion</span>
    {#if notion.configured}
      <button
        type="button"
        onclick={connect}
        disabled={busy}
        class="ml-auto text-xs font-medium text-[var(--color-accent)] hover:underline disabled:opacity-50"
      >
        {notion.accounts.length ? "Add workspace" : "Connect"}
      </button>
    {:else}
      <span class="ml-auto text-[11px] text-[var(--color-ink-3)]">Unavailable</span>
    {/if}
  </div>

  {#each notion.accounts as account (account.id)}
    <div class="mb-2 last:mb-0 rounded-xl bg-[var(--color-surface)] p-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-medium text-[var(--color-ink-2)] truncate">{account.workspaceName}</span>
        <button
          type="button"
          onclick={() => disconnect(account.id)}
          class="ml-auto text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
        >
          Disconnect
        </button>
      </div>

      {#each account.notionSources as src (src.id)}
        <div class="flex items-center gap-2 py-1.5 text-xs">
          <span class="truncate text-[var(--color-ink-2)]">{src.databaseName}</span>
          <span class="text-[var(--color-ink-3)]">→</span>
          <span class="truncate text-[var(--color-accent)]">{projectName(src.projectId)}</span>
          <button
            type="button"
            onclick={() => removeSource(src.id)}
            aria-label="Remove database"
            class="ml-auto shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
          >
            <X size={14} />
          </button>
        </div>
      {/each}

      {#if addingFor === account.id}
        <div class="mt-2 space-y-2 rounded-lg bg-[var(--color-surface-2)] p-2.5">
          <select
            value={pickDb}
            onchange={(e) => onPickDb(account.id, e.currentTarget.value)}
            class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
          >
            <option value="">Choose a database…</option>
            {#each databases as d (d.id)}
              <option value={d.id}>{d.title}</option>
            {/each}
          </select>

          {#if pickDb}
            <select
              bind:value={pickProject}
              class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
            >
              {#each projects.list as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>

            <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Date property</span>
            <select
              bind:value={pickDate}
              class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
            >
              <option value="">None</option>
              {#each dateProps as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>

            <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Done property</span>
            <select
              bind:value={pickStatus}
              onchange={() => (pickDone = "")}
              class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
            >
              <option value="">None</option>
              {#each statusProps as p (p.id)}
                <option value={p.id}>{p.name} ({p.type})</option>
              {/each}
            </select>

            {#if doneOptions.length}
              <span class="block text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">"Done" means</span>
              <select
                bind:value={pickDone}
                class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
              >
                <option value="">Choose…</option>
                {#each doneOptions as o (o)}
                  <option value={o}>{o}</option>
                {/each}
              </select>
            {/if}
          {/if}

          <div class="flex gap-2 pt-1">
            <button
              type="button"
              onclick={() => addSource(account.id)}
              disabled={busy || !pickDb || !pickProject}
              class="flex-1 h-9 rounded-lg bg-[var(--color-accent)] text-[var(--color-bg)] text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onclick={() => (addingFor = null)}
              class="px-3 h-9 rounded-lg bg-[var(--color-surface-3)] text-xs text-[var(--color-ink-2)]"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          type="button"
          onclick={() => openAdd(account.id)}
          disabled={projects.list.length === 0}
          class="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[var(--color-ink-3)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          <Plus size={12} /> Add database
        </button>
        {#if projects.list.length === 0}
          <span class="ml-2 text-[10px] text-[var(--color-ink-3)]">Create a project first</span>
        {/if}
      {/if}
    </div>
  {/each}

  {#if error}<p class="text-xs text-red-500 mt-2">{error}</p>{/if}
</div>
