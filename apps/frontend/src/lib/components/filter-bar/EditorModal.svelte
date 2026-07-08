<script lang="ts">
  import type { Project } from "$lib/api";
  import { portal } from "$lib/portal";
  import ProjectAvatarEditor from "../ProjectAvatarEditor.svelte";

  let { project, onClose }: { project: Project; onClose: () => void } = $props();
</script>

<!-- Portal to <body> so z-[60/61] is global — otherwise the modal is trapped in
  the filter bar's stacking context and the fixed bottom composer (z-40) paints
  on top of it. Same approach as the task context menu. -->
<div use:portal>
  <button
    aria-label="Close"
    class="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm animate-fade-in"
    onclick={onClose}
  ></button>
  <div
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[91] w-[min(92vw,380px)]
      p-5 rounded-xl bg-surface-2 border border-border max-h-[85vh] overflow-y-auto
      shadow-2xl shadow-black/50 animate-scale-in"
  >
    <ProjectAvatarEditor {project} {onClose} />
  </div>
</div>
