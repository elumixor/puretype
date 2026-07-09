<script lang="ts">
  import type { Project } from "$lib/api";
  import { projects } from "$lib/projects.svelte";
  import BoringAvatar from "./BoringAvatar.svelte";
  import BrandIcon from "./icons/BrandIcon.svelte";

  let { project, size = 22 }: { project: Project; size?: number } = $props();

  // Google/Notion-linked projects show the provider's icon instead of the
  // generated marble — unless the user set an explicit emoji/image.
  const provider = $derived(projects.providerOf(project.id));
</script>

{#if project.avatarType === "image" && project.image}
  <img
    src={project.image}
    alt={project.name}
    width={size}
    height={size}
    class="shrink-0 rounded-full object-cover"
    style="width:{size}px;height:{size}px"
  />
{:else if project.avatarType === "emoji" && project.emoji}
  <span
    class="shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--color-surface-3)] leading-none"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.62)}px"
  >
    {project.emoji}
  </span>
{:else if provider}
  <span
    class="shrink-0 inline-flex items-center justify-center rounded-full bg-white"
    style="width:{size}px;height:{size}px"
  >
    <BrandIcon brand={provider} size={Math.round(size * 0.64)} />
  </span>
{:else}
  <BoringAvatar name={project.name} {size} hue={project.hue} />
{/if}
