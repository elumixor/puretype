<script lang="ts">
  import { Eye, EyeOff, Trash2 } from "lucide-svelte";

  let {
    busy,
    hidden,
    confirming = $bindable<boolean>(),
    label,
    onToggleHidden,
    onDelete,
  }: {
    busy: boolean;
    hidden: boolean;
    confirming: boolean;
    label: string;
    onToggleHidden: () => void;
    onDelete: (mode: "clear" | "purge") => void;
  } = $props();
</script>

{#if confirming}
  <div class="space-y-2">
    <p class="text-[12px] text-[var(--color-ink-3)] text-center">Delete “{label}”?</p>
    <button
      onclick={() => onDelete("clear")}
      disabled={busy}
      class="w-full px-3 py-2.5 rounded-md border border-border bg-surface text-left
        hover:bg-surface-3 transition-colors disabled:opacity-50"
    >
      <span class="block text-[13px] font-medium text-ink">Clear project</span>
      <span class="block text-[11px] text-ink-3">Keep the tasks, just remove them from this project</span>
    </button>
    <button
      onclick={() => onDelete("purge")}
      disabled={busy}
      class="w-full px-3 py-2.5 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-glow)] text-left
        hover:bg-[var(--color-danger)]/20 transition-colors disabled:opacity-50"
    >
      <span class="block text-[13px] font-medium text-[var(--color-danger)]">Delete tasks</span>
      <span class="block text-[11px] text-[var(--color-danger)]/80">Delete the project and all of its tasks</span>
    </button>
    <button
      onclick={() => (confirming = false)}
      class="w-full py-2 rounded-md text-[12px] font-medium text-[var(--color-ink-2)] hover:bg-surface-3 transition-colors"
    >
      Cancel
    </button>
  </div>
{:else}
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
      onclick={() => (confirming = true)}
      class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
        text-[var(--color-ink-3)] hover:text-[var(--color-danger)] transition-colors"
    >
      <Trash2 size={13} />
      Delete
    </button>
  </div>
{/if}
