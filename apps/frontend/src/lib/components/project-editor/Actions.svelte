<script lang="ts">
  import { Archive, Eye, EyeOff } from "lucide-svelte";

  let {
    busy,
    hidden,
    onToggleHidden,
    onArchive,
  }: {
    busy: boolean;
    hidden: boolean;
    onToggleHidden: () => void;
    onArchive: () => void;
  } = $props();
</script>

<div class="flex items-center gap-2">
  <button
    onclick={onToggleHidden}
    disabled={busy}
    class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
      text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-50"
  >
    {#if hidden}
      <Eye size={13} />
      Unhide
    {:else}
      <EyeOff size={13} />
      Hide
    {/if}
  </button>
  <button
    onclick={onArchive}
    disabled={busy}
    class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
      text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-50"
  >
    <Archive size={13} />
    Archive
  </button>
</div>
