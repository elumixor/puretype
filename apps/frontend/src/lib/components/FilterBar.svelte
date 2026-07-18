<script lang="ts">
  import { Eye, EyeOff, Plus, X } from "lucide-svelte";
  import { untrack } from "svelte";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { chipDrag } from "./filter-bar/chip-drag.svelte";
  import { makeChipPressHandler } from "./filter-bar/chip-press";
  import ChipMenu from "./filter-bar/ChipMenu.svelte";
  import EditorModal from "./filter-bar/EditorModal.svelte";
  import NewProjectModal from "./NewProjectModal.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  // "row" is the scrolling chip bar (mobile top bar); "column" is a vertical
  // list used in the landscape sidebar and the mobile Projects popup.
  const { layout = "row" }: { layout?: "row" | "column" } = $props();
  const isCol = $derived(layout === "column");

  let editing = $state<Project | null>(null);
  let barEl: HTMLDivElement | undefined = $state();
  let menu = $state<{ project: Project; x: number; y: number } | null>(null);

  // "New project" flow — a blank project, or one bound to a Google calendar /
  // Notion database (the integration entry point lives here, not in Settings).
  let creating = $state(false);
  const openCreate = () => (creating = true);

  // Reordering is a horizontal-bar-only affordance; the vertical list just
  // selects/mutes/menus, so don't wire the drag bar there.
  $effect(() => chipDrag.bindBar(isCol ? null : (barEl ?? null)));

  // Scroll bar + active chip into view on in-task-pill taps only.
  $effect(() => {
    const tick = projects.scrollRequestTick;
    if (tick === 0) return;
    untrack(() => {
      const id = projects.filterId;
      if (!id || !barEl) return;
      barEl.scrollIntoView({ behavior: "smooth", block: "start" });
      const chip = barEl.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(id)}"]`);
      chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  });

  const onChipPointerDown = makeChipPressHandler(
    (project, x, y) => (menu = { project, x, y }),
    () => (menu = null),
    (project) => (editing = project),
  );
  const onChipContextMenu = (e: MouseEvent, project: Project) => {
    e.preventDefault();
    menu = { project, x: e.clientX, y: e.clientY };
  };
</script>

{#snippet addButton()}
  <button
    onclick={openCreate}
    class="flex items-center gap-1.5 border border-dashed border-border-hover text-ink-3
      hover:text-accent hover:border-accent/50 transition-colors
      {isCol
      ? 'w-full justify-center h-9 rounded-md text-[13px] font-medium mt-1'
      : 'shrink-0 pl-2 pr-3 py-1.5 rounded-full text-[12px] font-medium'}"
  >
    <Plus size={14} />
    New project
  </button>
{/snippet}

{#if projects.active.length > 0}
  {@const shown = projects.showHidden ? projects.active : projects.visible}
  {@const hiddenCount = projects.hiddenList.length}
  {@const visibleNoDrag = shown.filter((p) => p.id !== chipDrag.draggingId)}
  <div
    bind:this={barEl}
    class={isCol
      ? "flex flex-col items-stretch gap-1"
      : "flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"}
    style={isCol ? "" : "touch-action: pan-x; overscroll-behavior-x: contain;"}
  >
    {#each visibleNoDrag as p, i (p.id)}
      {@const activeFilter = projects.filterId === p.id}
      {@const muted = projects.isMuted(p.id)}
      {#if !isCol && chipDrag.draggingId && chipDrag.dropIndex === i}
        <div
          class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)]/30"
          style="width: {chipDrag.ghostWidth}px; height: 28px;"
        ></div>
      {/if}
      <div
        data-chip-id={p.id}
        role="button"
        tabindex="0"
        oncontextmenu={(e) => onChipContextMenu(e, p)}
        onpointerdown={(e) => onChipPointerDown(e, p)}
        class="flex items-center border transition-colors select-none cursor-pointer
          {isCol ? 'w-full rounded-md' : 'shrink-0 rounded-full'}
          {p.hidden ? 'opacity-50' : ''}
          {muted ? 'opacity-45' : ''}
          {activeFilter
          ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/40'
          : 'bg-surface border-border hover:bg-surface-3'}"
      >
        <div
          class="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 text-[13px] font-medium
            {isCol ? 'flex-1 min-w-0' : ''}
            {muted ? 'line-through' : ''}
            {activeFilter ? 'text-[var(--color-accent)]' : 'text-ink-2'}"
        >
          <ProjectAvatar project={p} size={18} />
          <span class={isCol ? "truncate" : ""}>{applyCap(p.name, toCapMode(p.capitalization), true)}</span>
        </div>
        <button
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            projects.toggleMuted(p.id);
          }}
          aria-label={muted ? "Show this project's tasks" : "Hide this project's tasks"}
          title={muted ? "Show tasks" : "Hide tasks"}
          class="pr-2 pl-0.5 shrink-0 {activeFilter
            ? 'text-[var(--color-accent)]/70 hover:text-[var(--color-accent)]'
            : 'text-ink-3 hover:text-ink'} transition-colors"
        >
          {#if muted}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
        </button>
      </div>
    {/each}
    {#if !isCol && chipDrag.draggingId && chipDrag.dropIndex === visibleNoDrag.length}
      <div
        class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)]/30"
        style="width: {chipDrag.ghostWidth}px; height: 28px;"
      ></div>
    {/if}

    {#if projects.filterId}
      <button
        onclick={() => projects.clearFilter()}
        class="flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full text-[12px] font-medium shrink-0
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
      >
        <X size={13} />
        Clear
      </button>
    {/if}

    {#if hiddenCount > 0}
      <button
        onclick={() => (projects.showHidden = !projects.showHidden)}
        class="flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full text-[12px] font-medium shrink-0
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
        aria-label={projects.showHidden ? "Hide hidden projects" : "Show hidden projects"}
      >
        {#if projects.showHidden}
          <EyeOff size={13} />
          Hide hidden
        {:else}
          <Eye size={13} />
          Show hidden ({hiddenCount})
        {/if}
      </button>
    {/if}

    {@render addButton()}
  </div>
{:else}
  <!-- No projects yet — still surface the create affordance so it's findable. -->
  <div class="flex items-center -mx-1 px-1">
    {@render addButton()}
  </div>
{/if}

{#if creating}
  <NewProjectModal onClose={() => (creating = false)} />
{/if}

{#if chipDrag.draggingId}
  {@const dp = projects.byId(chipDrag.draggingId)}
  {#if dp}
    <div use:portal>
      <div
        class="fixed z-[80] pointer-events-none rounded-full border border-[var(--color-accent)]/40
          bg-[var(--color-accent-dim)] shadow-xl shadow-black/40"
        style="left: {chipDrag.ghostX}px; top: {chipDrag.ghostY}px; transform: translate(-50%, -50%);"
      >
        <div class="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[12px] font-medium text-[var(--color-accent)]">
          <ProjectAvatar project={dp} size={18} />
          {applyCap(dp.name, toCapMode(dp.capitalization), true)}
        </div>
      </div>
    </div>
  {/if}
{/if}

{#if menu}
  <ChipMenu
    project={menu.project}
    x={menu.x}
    y={menu.y}
    onClose={() => (menu = null)}
    onToggleHidden={async () => {
      const p = menu?.project;
      menu = null;
      if (p) await projects.update(p.id, { hidden: !p.hidden });
    }}
    onCustomize={() => {
      editing = menu?.project ?? null;
      menu = null;
    }}
  />
{/if}

{#if editing}
  <EditorModal project={editing} onClose={() => (editing = null)} />
{/if}
