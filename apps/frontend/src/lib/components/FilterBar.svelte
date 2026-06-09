<script lang="ts">
  import { Eye, EyeOff, Plus, Settings2, X } from "lucide-svelte";
  import { tick, untrack } from "svelte";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { chipDrag } from "./filter-bar/chip-drag.svelte";
  import { makeChipPressHandler } from "./filter-bar/chip-press";
  import ChipMenu from "./filter-bar/ChipMenu.svelte";
  import EditorModal from "./filter-bar/EditorModal.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let editing = $state<Project | null>(null);
  let barEl: HTMLDivElement | undefined = $state();
  let menu = $state<{ project: Project; x: number; y: number } | null>(null);

  // Inline "New project" flow — gives a visible, discoverable way to create a
  // project (you can also still type "@name" in the composer). (#44)
  let creating = $state(false);
  let newName = $state("");
  let newNameEl: HTMLInputElement | undefined = $state();

  function openCreate() {
    creating = true;
    newName = "";
    void tick().then(() => newNameEl?.focus());
  }
  async function submitCreate() {
    const name = newName.trim();
    creating = false;
    if (!name) return;
    const p = await projects.create(name);
    projects.toggleFilter(p.id);
  }

  $effect(() => chipDrag.bindBar(barEl ?? null));

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

  const onChipPointerDown = makeChipPressHandler((project, x, y) => (menu = { project, x, y }));
  const onChipContextMenu = (e: MouseEvent, project: Project) => {
    e.preventDefault();
    menu = { project, x: e.clientX, y: e.clientY };
  };
</script>

{#snippet addButton()}
  <button
    onclick={openCreate}
    class="flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full border border-dashed shrink-0
      border-[var(--color-border-hover)] text-[12px] font-medium text-[var(--color-ink-3)]
      hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 transition-colors"
  >
    <Plus size={13} />
    New project
  </button>
{/snippet}

{#if projects.list.length > 0}
  {@const shown = projects.showHidden ? projects.list : projects.visible}
  {@const hiddenCount = projects.hiddenList.length}
  {@const visibleNoDrag = shown.filter((p) => p.id !== chipDrag.draggingId)}
  <div
    bind:this={barEl}
    class="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"
    style="touch-action: pan-x; overscroll-behavior-x: contain;"
  >
    {#each visibleNoDrag as p, i (p.id)}
      {@const activeFilter = projects.filterId === p.id}
      {#if chipDrag.draggingId && chipDrag.dropIndex === i}
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
        class="flex items-center rounded-full border transition-colors shrink-0 select-none
          {p.hidden ? 'opacity-50' : ''}
          {activeFilter
          ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/40'
          : 'bg-[var(--color-surface)] border-[var(--color-border)]'}"
      >
        <div
          class="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[12px] font-medium
            {activeFilter ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-2)]'}"
        >
          <ProjectAvatar project={p} size={18} />
          {applyCap(p.name, toCapMode(p.capitalization), true)}
        </div>
        {#if activeFilter}
          <button
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => (editing = p)}
            aria-label="Customize project"
            class="pr-2 text-[var(--color-accent)]/70 hover:text-[var(--color-accent)]"
          >
            <Settings2 size={13} />
          </button>
        {/if}
      </div>
    {/each}
    {#if chipDrag.draggingId && chipDrag.dropIndex === visibleNoDrag.length}
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
  <div use:portal>
    <button
      aria-label="Cancel"
      class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
      onclick={() => (creating = false)}
    ></button>
    <div
      class="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(92vw,360px)]
        p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
        shadow-2xl shadow-black/50 animate-scale-in"
    >
      <h2 class="text-sm font-semibold mb-3">New project</h2>
      <input
        bind:this={newNameEl}
        bind:value={newName}
        placeholder="Project name"
        onkeydown={(e) => {
          if (e.key === "Enter") submitCreate();
          else if (e.key === "Escape") creating = false;
        }}
        class="w-full h-11 px-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
          text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <div class="flex justify-end gap-2 mt-4">
        <button
          onclick={() => (creating = false)}
          class="px-4 h-10 rounded-xl text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={submitCreate}
          disabled={!newName.trim()}
          class="px-4 h-10 rounded-xl text-sm font-medium bg-[var(--color-accent)] text-[var(--color-bg)]
            disabled:opacity-50 transition-opacity"
        >
          Create
        </button>
      </div>
    </div>
  </div>
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

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    scrollbar-width: none;
  }
</style>
