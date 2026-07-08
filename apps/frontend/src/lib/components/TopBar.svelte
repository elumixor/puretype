<script lang="ts">
  import { Archive, FolderTree, Settings as SettingsIcon } from "lucide-svelte";
  import { portal } from "$lib/portal";
  import FilterBar from "./FilterBar.svelte";

  interface Props {
    archivedCount: number;
    popClass?: string;
  }

  const { archivedCount, popClass = "" }: Props = $props();

  // On narrow/portrait viewports the chip bar collapses to a single button that
  // opens the project list as a popup. On wide/landscape the left sidebar owns
  // projects, so this button is hidden there.
  let projectsOpen = $state(false);
</script>

<div class="fixed top-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="bg-[linear-gradient(to_bottom,var(--color-bg)_0%,var(--color-bg)_75%,transparent_100%)]"
    style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.25rem); padding-bottom: 1.5rem;"
  >
    <header class="max-w-md mx-auto px-5 pt-2 flex items-center gap-3 pointer-events-auto">
      <a
        href="/archive"
        aria-label="Archive ({archivedCount})"
        class="shrink-0 relative leading-none text-ink-3 hover:text-ink transition-colors {popClass}"
      >
        <Archive size={18} strokeWidth={1.75} />
        {#if archivedCount > 0}
          <span
            class="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-1 rounded-full
              bg-accent text-bg text-[9px] font-semibold leading-3.5 text-center"
          >{archivedCount > 99 ? "99+" : archivedCount}</span>
        {/if}
      </a>
      <div class="flex-1 min-w-0">
        <button
          onclick={() => (projectsOpen = true)}
          class="wide:hidden inline-flex items-center gap-2 h-9 pl-3 pr-3.5 rounded-md
            border border-border bg-surface text-[13px] font-medium
            text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors"
        >
          <FolderTree size={15} strokeWidth={2} />
          Projects
        </button>
      </div>
      <a
        href="/settings"
        aria-label="Settings"
        class="shrink-0 leading-none text-ink-3 hover:text-ink transition-colors"
      >
        <SettingsIcon size={18} strokeWidth={1.75} />
      </a>
    </header>
  </div>
</div>

{#if projectsOpen}
  <div use:portal>
    <button
      aria-label="Close projects"
      class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in"
      onclick={() => (projectsOpen = false)}
    ></button>
    <div
      role="dialog"
      aria-label="Projects"
      class="fixed z-[61] left-3 right-3 max-w-sm mx-auto rounded-xl p-2
        bg-surface-2 border border-border shadow-2xl shadow-black/50 animate-scale-in
        max-h-[70vh] overflow-y-auto no-scrollbar"
      style="top: calc(env(safe-area-inset-top, 0px) + 3.5rem);"
    >
      <div class="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        Projects
      </div>
      <FilterBar layout="column" />
    </div>
  </div>
{/if}
