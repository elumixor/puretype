<script lang="ts">
  import { ArchiveRestore, Trash2 } from "lucide-svelte";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  const archived = $derived(projects.archivedList);

  // The id whose permanent-delete confirm is expanded, plus a per-row busy lock.
  let confirmingId = $state<string | null>(null);
  let busyId = $state<string | null>(null);

  async function restore(id: string) {
    busyId = id;
    await projects.restore(id);
    busyId = null;
  }

  // Permanent delete keeps the existing two modes: "clear" orphans the tasks,
  // "purge" deletes them too.
  async function remove(id: string, mode: "clear" | "purge") {
    busyId = id;
    await projects.remove(id, mode);
    confirmingId = null;
    busyId = null;
  }
</script>

<div class="space-y-2">
  {#each archived as p (p.id)}
    {@const busy = busyId === p.id}
    <div class="rounded-lg border border-border bg-surface-2 p-3">
      <div class="flex items-center gap-2.5">
        <ProjectAvatar project={p} size={22} />
        <span class="flex-1 min-w-0 truncate text-sm font-medium text-ink">
          {applyCap(p.name, toCapMode(p.capitalization), true)}
        </span>
        <button
          onclick={() => restore(p.id)}
          disabled={busy}
          class="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5
            text-[12px] font-medium text-ink-2 hover:bg-surface-3 transition-colors disabled:opacity-50"
        >
          <ArchiveRestore size={13} />
          Restore
        </button>
        <button
          onclick={() => (confirmingId = confirmingId === p.id ? null : p.id)}
          disabled={busy}
          aria-label="Delete permanently"
          class="flex items-center justify-center h-8 w-8 rounded-md text-ink-3
            hover:text-danger transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {#if confirmingId === p.id}
        <div class="mt-3 space-y-2">
          <p class="text-[12px] text-ink-3 text-center">Delete “{p.name}” permanently? This can't be undone.</p>
          <button
            onclick={() => remove(p.id, "clear")}
            disabled={busy}
            class="w-full px-3 py-2.5 rounded-md border border-border bg-surface text-left
              hover:bg-surface-3 transition-colors disabled:opacity-50"
          >
            <span class="block text-[13px] font-medium text-ink">Delete project only</span>
            <span class="block text-[11px] text-ink-3">Keep the tasks, just remove them from this project</span>
          </button>
          <button
            onclick={() => remove(p.id, "purge")}
            disabled={busy}
            class="w-full px-3 py-2.5 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger-glow)] text-left
              hover:bg-[var(--color-danger)]/20 transition-colors disabled:opacity-50"
          >
            <span class="block text-[13px] font-medium text-[var(--color-danger)]">Delete project and tasks</span>
            <span class="block text-[11px] text-[var(--color-danger)]/80">Delete the project and all of its tasks</span>
          </button>
          <button
            onclick={() => (confirmingId = null)}
            class="w-full py-2 rounded-md text-[12px] font-medium text-ink-2 hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
        </div>
      {/if}
    </div>
  {/each}
</div>
