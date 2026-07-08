<script lang="ts">
  import { Check, Copy, Pencil, Trash2, Undo2 } from "lucide-svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import ContextMenu from "../ui/ContextMenu.svelte";
  import MenuItem from "../ui/MenuItem.svelte";

  let {
    x,
    y,
    bulk,
    onClose,
    onEdit,
    onDuplicate,
    onDelete,
    onBulkComplete,
  }: {
    x: number;
    y: number;
    bulk: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onBulkComplete: (target: boolean) => void;
  } = $props();

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
</script>

<ContextMenu {x} {y} {onClose} minWidth={176}>
  {#if bulk}
    <MenuItem onclick={run(() => onBulkComplete(true))}>
      {#snippet icon()}<Check size={15} class="text-accent" />{/snippet}
      Mark {multi.size} complete
    </MenuItem>
    <MenuItem onclick={run(() => onBulkComplete(false))}>
      {#snippet icon()}<Undo2 size={15} />{/snippet}
      Mark {multi.size} incomplete
    </MenuItem>
    <MenuItem variant="danger" onclick={run(onDelete)}>
      {#snippet icon()}<Trash2 size={15} />{/snippet}
      Delete {multi.size}
    </MenuItem>
  {:else}
    <MenuItem onclick={run(onEdit)}>
      {#snippet icon()}<Pencil size={15} />{/snippet}
      Edit
    </MenuItem>
    <MenuItem onclick={run(onDuplicate)}>
      {#snippet icon()}<Copy size={15} />{/snippet}
      Duplicate
    </MenuItem>
    <MenuItem variant="danger" onclick={run(onDelete)}>
      {#snippet icon()}<Trash2 size={15} />{/snippet}
      Delete
    </MenuItem>
  {/if}
</ContextMenu>
