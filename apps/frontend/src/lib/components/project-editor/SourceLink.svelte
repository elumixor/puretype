<script lang="ts">
  import { Loader2, Settings2, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { projects } from "$lib/projects.svelte";
  import { sync } from "$lib/sync.svelte";
  import { tasks } from "$lib/tasks.svelte";
  import BrandIcon from "../icons/BrandIcon.svelte";
  import Select from "../ui/Select.svelte";

  // Shows the external source(s) a project is bound to (Google calendar / Notion
  // database) with detach + (Notion) reconfigure of the date/done mapping.
  let { projectId }: { projectId: string } = $props();

  type Overview = Awaited<ReturnType<typeof api.integrations.$get>>;
  let overview = $state<Overview | null>(null);
  let busy = $state(false);

  // Notion reconfigure state (one source at a time).
  let editing = $state<string | null>(null);
  let metaLoading = $state(false); // properties + views loading for the editing source
  let dbProps = $state<{ id: string; name: string; type: string; options?: string[] }[]>([]);
  let dViews = $state<{ id: string; name: string }[]>([]);
  let dView = $state("");
  let dDate = $state("");
  let dStatus = $state("");
  let dDone = $state("");

  const viewOptions = $derived([
    { value: "", label: "All rows" },
    ...dViews.map((v) => ({ value: v.id, label: v.name })),
  ]);
  const dateProps = $derived(dbProps.filter((p) => p.type === "date"));
  const statusProps = $derived(dbProps.filter((p) => ["checkbox", "status", "select"].includes(p.type)));
  const doneOptions = $derived(dbProps.find((p) => p.id === dStatus)?.options ?? []);
  const dateOptions = $derived([{ value: "", label: "None" }, ...dateProps.map((p) => ({ value: p.id, label: p.name }))]);
  const statusOptions = $derived([
    { value: "", label: "None" },
    ...statusProps.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` })),
  ]);
  const doneValueOptions = $derived([
    { value: "", label: "Choose…" },
    ...doneOptions.map((o) => ({ value: o, label: o })),
  ]);

  const calSources = $derived(
    (overview?.google.accounts ?? []).flatMap((a) =>
      a.calendarSources.filter((s) => s.projectId === projectId).map((s) => ({ ...s, accountEmail: a.email })),
    ),
  );
  const notionSources = $derived(
    (overview?.notion.accounts ?? []).flatMap((a) =>
      a.notionSources.filter((s) => s.projectId === projectId).map((s) => ({ ...s, accountId: a.id })),
    ),
  );
  const hasAny = $derived(calSources.length > 0 || notionSources.length > 0);

  async function load() {
    overview = await api.integrations.$get();
    const entries: [string, "google" | "notion"][] = [];
    for (const a of overview.google.accounts) for (const s of a.calendarSources) entries.push([s.projectId, "google"]);
    for (const a of overview.notion.accounts) for (const s of a.notionSources) entries.push([s.projectId, "notion"]);
    projects.setLinked(entries);
  }
  onMount(load);

  async function detachCalendar(id: string) {
    busy = true;
    try {
      await api.integrations.google.sources(id).$delete();
      await load();
      sync.schedule(0);
    } finally {
      busy = false;
    }
  }
  // Empty box = no horizon = today + the rest of this calendar week (so on a
  // Saturday, just Saturday and Sunday). A number is an explicit days-ahead
  // window. Events aren't persisted, so this only changes what the next live
  // fetch returns — hence the immediate refetch.
  async function setHorizon(id: string, raw: string) {
    const trimmed = raw.trim();
    let horizonDays: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 365) return;
      horizonDays = n;
    }
    busy = true;
    try {
      await api.integrations.google.sources(id).$patch({ horizonDays });
      await load();
      await tasks.refreshExternal();
    } finally {
      busy = false;
    }
  }

  async function detachNotion(id: string) {
    busy = true;
    try {
      await api.integrations.notion.sources(id).$delete();
      await load();
      sync.schedule(0);
    } finally {
      busy = false;
    }
  }

  async function openReconfigure(s: (typeof notionSources)[number]) {
    editing = s.id;
    dbProps = [];
    dViews = [];
    dView = s.viewId ?? "";
    dDate = s.datePropertyId ?? "";
    dStatus = s.statusPropertyId ?? "";
    dDone = s.doneValue ?? "";
    metaLoading = true;
    try {
      const [props, views] = await Promise.all([
        api.integrations.notion.properties.$post({ accountId: s.accountId, databaseId: s.databaseId }),
        api.integrations.notion.views.$post({ accountId: s.accountId, databaseId: s.databaseId }),
      ]);
      dbProps = props.properties;
      dViews = views.views;
    } finally {
      metaLoading = false;
    }
  }

  async function saveReconfigure(s: (typeof notionSources)[number]) {
    const t = dbProps.find((p) => p.id === dStatus)?.type;
    const statusPropType = t === "checkbox" || t === "status" || t === "select" ? t : null;
    busy = true;
    try {
      await api.integrations.notion.sources.$post({
        accountId: s.accountId,
        databaseId: s.databaseId,
        databaseName: s.databaseName,
        viewId: dView || null,
        projectId,
        datePropertyId: dDate || null,
        statusPropertyId: dStatus || null,
        statusPropType,
        doneValue: statusPropType === "checkbox" ? null : dDone || null,
      });
      editing = null;
      await load();
      sync.schedule(0);
    } finally {
      busy = false;
    }
  }

  const labelCls = "block text-[10px] font-medium uppercase tracking-wider text-ink-3";
</script>

{#snippet skeleton()}
  <div class="h-9 w-full rounded-md border border-border bg-surface animate-pulse"></div>
{/snippet}

{#if hasAny}
  <div class="space-y-1.5">
    <span class="text-[11px] font-medium uppercase tracking-wider text-ink-3">Connected source</span>

    {#each calSources as s (s.id)}
      <div class="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 h-11">
        <BrandIcon brand="google" size={16} />
        <span class="text-sm text-ink truncate flex-1 min-w-0">{s.calendarName}</span>
        <label class="flex items-center gap-1.5 text-xs text-ink-3 shrink-0">
          <input
            type="number"
            min="1"
            max="365"
            value={s.horizonDays ?? ""}
            placeholder="wk"
            disabled={busy}
            onchange={(e) => setHorizon(s.id, e.currentTarget.value)}
            aria-label="Days ahead to show — empty for this week only"
            title="Days ahead to show. Empty = today and the rest of this week only."
            class="w-12 rounded border border-border bg-bg px-1.5 py-0.5 text-center text-ink
                   placeholder:text-ink-3 disabled:opacity-50 focus:outline-none focus:border-accent"
          />
          <span>{s.horizonDays == null ? "this week" : "days"}</span>
        </label>
        <button
          type="button"
          onclick={() => detachCalendar(s.id)}
          disabled={busy}
          aria-label="Detach calendar"
          class="text-ink-3 hover:text-danger disabled:opacity-50 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    {/each}

    {#each notionSources as s (s.id)}
      <div class="rounded-lg border border-border bg-surface">
        <div class="flex items-center gap-2.5 px-3 h-11">
          <BrandIcon brand="notion" size={16} />
          <span class="text-sm text-ink truncate flex-1 min-w-0">{s.databaseName}</span>
          <button
            type="button"
            onclick={() => (editing === s.id ? (editing = null) : openReconfigure(s))}
            aria-label="Reconfigure"
            class="text-ink-3 hover:text-ink transition-colors"
          >
            <Settings2 size={15} />
          </button>
          <button
            type="button"
            onclick={() => detachNotion(s.id)}
            disabled={busy}
            aria-label="Detach database"
            class="text-ink-3 hover:text-danger disabled:opacity-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
        {#if editing === s.id}
          <div class="px-3 pb-3 pt-1 space-y-2 border-t border-border">
            <div class="space-y-1">
              <span class={labelCls}>Sync from view</span>
              {#if metaLoading}{@render skeleton()}{:else}
                <Select bind:value={dView} options={viewOptions} />
              {/if}
            </div>
            <div class="space-y-1">
              <span class={labelCls}>Date property</span>
              {#if metaLoading}{@render skeleton()}{:else}
                <Select bind:value={dDate} options={dateOptions} />
              {/if}
            </div>
            <div class="space-y-1">
              <span class={labelCls}>Done property</span>
              {#if metaLoading}{@render skeleton()}{:else}
                <Select bind:value={dStatus} options={statusOptions} onChange={() => (dDone = "")} />
              {/if}
            </div>
            {#if !metaLoading && doneOptions.length}
              <div class="space-y-1">
                <span class={labelCls}>"Done" means</span>
                <Select bind:value={dDone} options={doneValueOptions} />
              </div>
            {/if}
            <button
              type="button"
              onclick={() => saveReconfigure(s)}
              disabled={busy || metaLoading}
              class="inline-flex items-center justify-center gap-1.5 h-9 w-full rounded-md text-sm font-medium bg-accent text-bg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {#if busy}<Loader2 size={14} class="animate-spin" />{/if} Save mapping
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
