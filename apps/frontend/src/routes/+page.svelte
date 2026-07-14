<script lang="ts">
  import { onMount } from "svelte";
  import { archivePop, isArchived } from "$lib/archive.svelte";
  import type { Task } from "$lib/api";
  import BottomComposer from "$lib/components/BottomComposer.svelte";
  import BoxSelect from "$lib/components/BoxSelect.svelte";
  import BucketSection from "$lib/components/BucketSection.svelte";
  import DragGhost from "$lib/components/DragGhost.svelte";
  import FilterBar from "$lib/components/FilterBar.svelte";
  import NewProjectModal from "$lib/components/NewProjectModal.svelte";
  import Onboarding from "$lib/components/Onboarding.svelte";
  import ProjectPicker from "$lib/components/ProjectPicker.svelte";
  import type RichTaskInput from "$lib/components/RichTaskInput.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import { dnd } from "$lib/dnd.svelte";
  import { commitDrop } from "$lib/home/drop";
  import { buildGlobalKeydown } from "$lib/home/keyboard";
  import { defaultHidden, HIDDEN_BUCKETS_KEY, SECTION_ORDER, SECTION_TITLE, type SectionKey } from "$lib/home/sections";
  import {
    addTask,
    bulkComplete,
    bulkDelete,
    deleteTask,
    duplicateTask,
    editTask,
    toggleTask,
  } from "$lib/home/task-handlers";
  import { projects } from "$lib/projects.svelte";
  import { settings } from "$lib/settings.svelte";
  import { refreshEntitlement } from "$lib/storekit";
  import { ls } from "$lib/storage";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { displayBucket, taskProjectIds } from "$lib/tokens";
  import { voiceTurn } from "$lib/voice-turn.svelte";

  // Local + live external tasks, merged for display.
  const tasks = $derived(tasksStore.all);
  let voiceBubbleEl: HTMLDivElement | undefined = $state();
  let addInput: RichTaskInput | undefined = $state();
  let pickerOpen = $state(false);
  let hiddenBuckets = $state(defaultHidden());
  // Set when returning from an integration OAuth redirect so the New Project
  // modal reopens at the matching source step (see resumeOAuthReturn).
  let resumeSource = $state<"google" | "notion" | null>(null);

  const matchesFilter = (t: Task) => {
    const pids = taskProjectIds(t);
    // Tapping a chip mutes a project → hide its tasks.
    if (pids.some((id) => projects.isMuted(id))) return false;
    if (!projects.filterId) return true;
    const wanted = projects.descendantIds(projects.filterId);
    return pids.some((id) => wanted.has(id));
  };
  const visibleTasks = $derived(tasks.filter(matchesFilter));

  // Completed tasks that have rolled off live in archive; today/week keep
  // their own completed items so the dopamine of crossing-out sticks.
  const buckets = $derived.by(() => {
    const out: Record<SectionKey, Task[]> = { overdue: [], today: [], week: [], later: [] };
    for (const t of visibleTasks) {
      if (isArchived(t)) continue;
      out[displayBucket(t)].push(t);
    }
    return out;
  });
  const archivedCount = $derived(tasks.filter((t) => isArchived(t)).length);

  let popClass = $state("");
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (archivePop.tick === 0) return;
    popClass = "animate-archive-pop";
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(() => (popClass = ""), 450);
  });

  const draggedTask = $derived(dnd.taskId ? tasks.find((t) => t.id === dnd.taskId) : undefined);

  onMount(() => {
    void tasksStore.boot();
    void projects.boot();
    void settings.boot();
    void refreshEntitlement();
    void loadHiddenBuckets();
    // boot() already does an initial external fetch; refresh again whenever the
    // tab regains focus so edits made in Notion show up.
    resumeOAuthReturn();
    dnd.onDrop = (e) => commitDrop(e, tasks);
    const onKey = buildGlobalKeydown({
      onUndo: () => void voiceTurn.undo(),
      onRedo: () => void voiceTurn.redo(),
      canUndo: () => voiceTurn.canUndo,
      canRedo: () => voiceTurn.canRedo,
      togglePicker: () => (pickerOpen = !pickerOpen),
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIntegrations();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutsidePointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });

  // After an integration OAuth redirect the callback returns to "/?google=..."
  // or "/?notion=...". If the connect started from the New Project flow, reopen
  // that modal at the source step so the user can finish picking a calendar/db.
  function resumeOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google") ? "google" : params.get("notion") ? "notion" : null;
    if (!status) return;
    const connected = params.get(status) === "connected";
    const pending = localStorage.getItem("pendingProjectSource");
    localStorage.removeItem("pendingProjectSource");
    // Clean the URL so a refresh doesn't re-trigger.
    window.history.replaceState({}, "", window.location.pathname);
    if (connected && pending === status) resumeSource = status;
  }

  // Fetch the live external tasks (Notion/Google) and merge them into the view.
  // In-memory only — the source is the truth. Cheap no-op for users with none.
  function refreshIntegrations() {
    void tasksStore.refreshExternal();
  }

  async function loadHiddenBuckets() {
    try {
      const raw = await ls.get(HIDDEN_BUCKETS_KEY);
      if (raw) hiddenBuckets = { ...hiddenBuckets, ...(JSON.parse(raw) as Partial<Record<SectionKey, boolean>>) };
    } catch {
      // stale preference — fall back to defaults
    }
  }

  // Skip dismiss while loading/recording so an in-flight response isn't aborted.
  function onOutsidePointerDown(e: PointerEvent) {
    if (!voiceTurn.message || voiceTurn.loading || voiceTurn.recording) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (voiceBubbleEl?.contains(target)) return;
    if ((target as Element).closest?.("[data-voice-keep]")) return;
    voiceTurn.dismiss();
  }

  function onWindowBlur() {
    if (voiceTurn.loading || voiceTurn.recording) return;
    if (voiceTurn.message) voiceTurn.dismiss();
  }

  const persistHidden = () => void ls.set(HIDDEN_BUCKETS_KEY, JSON.stringify(hiddenBuckets));

  function submitNewTask(text: string) {
    void addTask(text);
    addInput?.clear();
  }

  async function onVoiceRecorded(file: File) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await voiceTurn.record(file, today, now.getTimezoneOffset());
  }
</script>

<div
  class="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none
    bg-[radial-gradient(ellipse_at_center,var(--color-accent-glow)_0%,transparent_70%)] opacity-40"
></div>

<TopBar {archivedCount} {popClass} />

<!-- Landscape/desktop: projects live in a vertical list pinned to the left. -->
<aside
  class="hidden wide:flex flex-col fixed left-0 inset-y-0 z-30 w-56 px-3 overflow-y-auto no-scrollbar"
  style="padding-top: calc(env(safe-area-inset-top, 0px) + 4.75rem); padding-bottom: 2rem;"
>
  <div class="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
    Projects
  </div>
  <FilterBar layout="column" />
</aside>

<main
  class="relative max-w-md mx-auto px-5 pb-36 min-h-screen"
  style="padding-top: calc(env(safe-area-inset-top, 0px) + 4.5rem);"
>
  <div class="space-y-5">
    {#each SECTION_ORDER as key (key)}
      {#if key !== "overdue" || buckets[key].length > 0}
        <BucketSection
          title={SECTION_TITLE[key]}
          listId={`bucket:${key}`}
          tasks={buckets[key]}
          bind:hidden={hiddenBuckets[key]}
          onToggleHidden={persistHidden}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onEditTask={editTask}
          onDuplicateTask={duplicateTask}
          onBulkDelete={bulkDelete}
          onBulkComplete={bulkComplete}
        />
      {/if}
    {/each}
  </div>
</main>

{#if pickerOpen}
  <ProjectPicker onClose={() => (pickerOpen = false)} />
{/if}

{#if resumeSource}
  <NewProjectModal start={resumeSource} onClose={() => (resumeSource = null)} />
{/if}

<BottomComposer bind:input={addInput} bind:bubble={voiceBubbleEl} onSubmit={submitNewTask} {onVoiceRecorded} />

<Onboarding show={tasks.length === 0} />

<BoxSelect />
<Toast />
<DragGhost task={draggedTask} />
