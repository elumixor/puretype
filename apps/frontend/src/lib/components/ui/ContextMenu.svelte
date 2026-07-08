<script lang="ts">
  import type { Snippet } from "svelte";
  import { portal } from "$lib/portal";

  // Shared shadcn-style context menu: a portaled popover anchored at a cursor
  // point (x, y), clamped to the viewport, with a transparent outside-click
  // catcher. Appears instantly. Used by the task and project right-click menus.
  let {
    x,
    y,
    onClose,
    minWidth = 160,
    children,
  }: {
    x: number;
    y: number;
    onClose: () => void;
    minWidth?: number;
    children: Snippet;
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
    class="fixed z-[71] overflow-hidden rounded-md border border-border bg-surface-2 p-1
      text-ink shadow-md shadow-black/30 no-touch-select"
    style="left:{mx}px; top:{my}px; min-width:{minWidth}px"
  >
    {@render children()}
  </div>
</div>
