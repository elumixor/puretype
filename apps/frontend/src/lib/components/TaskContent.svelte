<script lang="ts">
  import { Clock, Hourglass, Link2, MapPin, Repeat } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { applyCap, sentenceStartFlags, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import { fmtDateTime, fmtDuration, fmtLinkLabel, parseSegments, projectIds, repeatLabel } from "$lib/tokens";
  import { placeUrl } from "$lib/placeSearch";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { task, dimmed = false }: { task: Task; dimmed?: boolean } = $props();

  const segments = $derived(parseSegments(task.text, projects.list));
  const startFlags = $derived(sentenceStartFlags(segments));

  // Synced tasks carry their project via task.projectId, not always an @project
  // token (imported before the token existed). Render an implicit pill for it so
  // the association is visible everywhere.
  const implicitProject = $derived(
    task.projectId && !projectIds(task.text).includes(task.projectId) ? projects.byId(task.projectId) : undefined,
  );

  function filterByProject(e: MouseEvent, id: string) {
    e.stopPropagation();
    projects.setFilterFromTask(id);
  }
</script>

<span
  class="flex-1 block text-[15px] font-light tracking-wide leading-[23px] min-h-[23px] cursor-text select-none whitespace-pre-wrap break-words
    {dimmed ? 'line-through text-[var(--color-ink-3)] task-done' : 'text-[var(--color-ink)]'}"
>
  {#each segments as seg, i (i)}
    {#if seg.kind === "text"}{seg.value}{:else if seg.kind === "project"}
      <button
        type="button"
        class="pill pill-project"
        onclick={(e) => filterByProject(e, seg.id)}
        onpointerdown={(e) => e.stopPropagation()}
      >
        {#if seg.project}
          <ProjectAvatar project={seg.project} size={15} />
          {applyCap(seg.project.name, toCapMode(seg.project.capitalization), startFlags[i])}
        {:else}
          Unknown
        {/if}
      </button>
    {:else if seg.kind === "time"}
      <span class="pill pill-time">
        <Clock size={12} strokeWidth={2.5} />
        {fmtDateTime(seg.date, seg.hasTime, startFlags[i])}
      </span>
    {:else if seg.kind === "dur"}
      <span class="pill pill-dur">
        <Hourglass size={12} strokeWidth={2.5} />
        {fmtDuration(seg.minutes)}
      </span>
    {:else if seg.kind === "repeat"}
      <span class="pill pill-time">
        <Repeat size={12} strokeWidth={2.5} />
        {repeatLabel(seg.code)}
      </span>
    {:else if seg.kind === "place"}
      <a
        class="pill pill-place"
        href={placeUrl(seg.name, seg.lat, seg.lng)}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}
        onpointerdown={(e) => e.stopPropagation()}
      >
        <MapPin size={12} strokeWidth={2.5} />
        <span class="pill-place-name" title={seg.name}>{seg.name}</span>
      </a>
    {:else if seg.kind === "link"}
      <a
        class="pill pill-link"
        href={seg.url}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}
        onpointerdown={(e) => e.stopPropagation()}
      >
        <Link2 size={12} strokeWidth={2.5} />
        {fmtLinkLabel(seg.url)}
      </a>
    {/if}
  {/each}
  {#if implicitProject}
    {" "}<button
      type="button"
      class="pill pill-project"
      onclick={(e) => filterByProject(e, implicitProject.id)}
      onpointerdown={(e) => e.stopPropagation()}
    >
      <ProjectAvatar project={implicitProject} size={15} />
      {applyCap(implicitProject.name, toCapMode(implicitProject.capitalization), false)}
    </button>
  {/if}
</span>
