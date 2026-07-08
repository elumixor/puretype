<script lang="ts">
  import { Eye, EyeOff, Settings2 } from "lucide-svelte";
  import type { Project } from "$lib/api";
  import { portal } from "$lib/portal";

  let {
    project,
    x,
    y,
    onClose,
    onToggleHidden,
    onCustomize,
  }: {
    project: Project;
    x: number;
    y: number;
    onClose: () => void;
    onToggleHidden: () => void;
    onCustomize: () => void;
  } = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  /* svelte-ignore state_referenced_locally */
  let mx = $state(x);
  /* svelte-ignore state_referenced_locally */
  let my = $state(y);

  $effect(() => {
    if (!menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    mx = Math.max(pad, Math.min(mx, window.innerWidth - r.width - pad));
    my = Math.max(pad, Math.min(my, window.innerHeight - r.height - pad));
  });
</script>

<div use:portal>
  <button
    aria-label="Close menu"
    class="fixed inset-0 z-[70] cursor-default"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onclick={onClose}
  ></button>
  <div
    bind:this={menuEl}
    class="fixed z-[71] w-44 p-1 rounded-lg bg-surface-2 border border-border
      shadow-xl shadow-black/40 animate-fade-in"
    style="left: {mx}px; top: {my}px;"
  >
    <button
      onclick={onToggleHidden}
      class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-ink
        hover:bg-surface-3 transition-colors"
    >
      {#if project.hidden}
        <Eye size={15} class="text-ink-3" />
        Unhide
      {:else}
        <EyeOff size={15} class="text-ink-3" />
        Hide
      {/if}
    </button>
    <button
      onclick={onCustomize}
      class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-ink
        hover:bg-surface-3 transition-colors"
    >
      <Settings2 size={15} class="text-ink-3" />
      Customize
    </button>
  </div>
</div>
