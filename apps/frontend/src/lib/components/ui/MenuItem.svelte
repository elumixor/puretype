<script lang="ts">
  import type { Snippet } from "svelte";

  // A single shadcn-style menu row: muted leading icon + label, with a danger
  // variant. Used inside ContextMenu.
  let {
    onclick,
    variant = "default",
    icon,
    children,
  }: {
    onclick: () => void;
    variant?: "default" | "danger";
    icon?: Snippet;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  {onclick}
  class="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors
    {variant === 'danger' ? 'text-danger hover:bg-danger-glow' : 'text-ink hover:bg-surface-3'}"
>
  {#if icon}
    <span class="shrink-0 flex items-center {variant === 'danger' ? '' : 'text-ink-3'}">{@render icon()}</span>
  {/if}
  {@render children()}
</button>
