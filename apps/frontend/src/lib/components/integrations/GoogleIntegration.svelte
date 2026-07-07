<script lang="ts">
  import { Calendar, Plus, X } from "lucide-svelte";
  import { api } from "$lib/api/client";
  import { projects } from "$lib/projects.svelte";

  interface CalendarSource {
    id: string;
    calendarId: string;
    calendarName: string;
    projectId: string;
    lastSyncedAt: string | null;
  }
  interface Account {
    id: string;
    email: string;
    calendarSources: CalendarSource[];
  }
  interface GoogleData {
    configured: boolean;
    accounts: Account[];
  }

  let { google, onReload }: { google: GoogleData; onReload: () => Promise<void> } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);
  let addingFor = $state<string | null>(null);
  let calendars = $state<{ id: string; name: string; primary: boolean }[]>([]);
  let pickCal = $state("");
  let pickProject = $state("");

  const projectName = (id: string) => projects.byId(id)?.name ?? "Unknown project";

  async function connect() {
    busy = true;
    error = null;
    try {
      const { url } = await api.integrations.google.authorize.$get();
      window.location.href = url; // full-page redirect into Google consent
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start Google connect";
      busy = false;
    }
  }

  async function openAdd(accountId: string) {
    addingFor = accountId;
    calendars = [];
    pickCal = "";
    pickProject = projects.list[0]?.id ?? "";
    error = null;
    try {
      const res = await api.integrations.google.calendars.$post({ accountId });
      calendars = res.calendars;
      pickCal = res.calendars.find((c) => c.primary)?.id ?? res.calendars[0]?.id ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load calendars";
    }
  }

  async function addSource(accountId: string) {
    const cal = calendars.find((c) => c.id === pickCal);
    if (!cal || !pickProject) return;
    busy = true;
    error = null;
    try {
      await api.integrations.google.sources.$post({
        accountId,
        calendarId: cal.id,
        calendarName: cal.name,
        projectId: pickProject,
      });
      addingFor = null;
      await onReload();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't add calendar";
    } finally {
      busy = false;
    }
  }

  async function removeSource(id: string) {
    busy = true;
    try {
      await api.integrations.google.sources(id).$delete();
      await onReload();
    } finally {
      busy = false;
    }
  }

  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this Google account? Its imported tasks will be removed.")) return;
    busy = true;
    try {
      await api.integrations.google.accounts(id).$delete();
      await onReload();
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
  <div class="flex items-center gap-2.5 mb-3">
    <Calendar size={17} class="text-[var(--color-ink-2)]" />
    <span class="text-sm font-semibold">Google Calendar</span>
    {#if google.configured}
      <button
        type="button"
        onclick={connect}
        disabled={busy}
        class="ml-auto text-xs font-medium text-[var(--color-accent)] hover:underline disabled:opacity-50"
      >
        {google.accounts.length ? "Add account" : "Connect"}
      </button>
    {:else}
      <span class="ml-auto text-[11px] text-[var(--color-ink-3)]">Unavailable</span>
    {/if}
  </div>

  {#each google.accounts as account (account.id)}
    <div class="mb-2 last:mb-0 rounded-xl bg-[var(--color-surface)] p-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-medium text-[var(--color-ink-2)] truncate">{account.email}</span>
        <button
          type="button"
          onclick={() => disconnect(account.id)}
          class="ml-auto text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
        >
          Disconnect
        </button>
      </div>

      {#each account.calendarSources as src (src.id)}
        <div class="flex items-center gap-2 py-1.5 text-xs">
          <span class="truncate text-[var(--color-ink-2)]">{src.calendarName}</span>
          <span class="text-[var(--color-ink-3)]">→</span>
          <span class="truncate text-[var(--color-accent)]">{projectName(src.projectId)}</span>
          <button
            type="button"
            onclick={() => removeSource(src.id)}
            aria-label="Remove calendar"
            class="ml-auto shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
          >
            <X size={14} />
          </button>
        </div>
      {/each}

      {#if addingFor === account.id}
        <div class="mt-2 space-y-2 rounded-lg bg-[var(--color-surface-2)] p-2.5">
          <select
            bind:value={pickCal}
            class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
          >
            {#each calendars as c (c.id)}
              <option value={c.id}>{c.name}{c.primary ? " (primary)" : ""}</option>
            {/each}
          </select>
          <select
            bind:value={pickProject}
            class="w-full h-9 px-2 rounded-lg bg-[var(--color-surface)] text-xs text-[var(--color-ink)] border border-[var(--color-border)]"
          >
            {#each projects.list as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => addSource(account.id)}
              disabled={busy || !pickCal || !pickProject}
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
          <Plus size={12} /> Add calendar
        </button>
        {#if projects.list.length === 0}
          <span class="ml-2 text-[10px] text-[var(--color-ink-3)]">Create a project first</span>
        {/if}
      {/if}
    </div>
  {/each}

  {#if error}<p class="text-xs text-red-500 mt-2">{error}</p>{/if}
</div>
