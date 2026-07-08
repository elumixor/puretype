<script lang="ts">
  import { Eye, EyeOff, Settings2 } from "lucide-svelte";
  import type { Project } from "$lib/api";
  import ContextMenu from "../ui/ContextMenu.svelte";
  import MenuItem from "../ui/MenuItem.svelte";

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
</script>

<ContextMenu {x} {y} {onClose}>
  <MenuItem onclick={onToggleHidden}>
    {#snippet icon()}
      {#if project.hidden}<Eye size={15} />{:else}<EyeOff size={15} />{/if}
    {/snippet}
    {project.hidden ? "Unhide" : "Hide"}
  </MenuItem>
  <MenuItem onclick={onCustomize}>
    {#snippet icon()}<Settings2 size={15} />{/snippet}
    Customize
  </MenuItem>
</ContextMenu>
