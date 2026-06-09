<script>
  import "../app.css";
  // Side-effect import: kicks off the anonymous-auth bootstrap so `authReady`
  // resolves and api calls can fire. Don't remove even if `auth` looks unused.
  import "$lib/auth.svelte";
  // Side-effect import: wires online/offline/visibility listeners and the
  // 30s heartbeat. Stores call sync.schedule() on enqueue; this just makes
  // sure the background triggers are armed early.
  import "$lib/sync.svelte";
  let { children } = $props();
</script>

<!-- App-wide: text isn't selectable (native iOS feel) so a long-press opens our
  menus instead of dragging up the loupe on tasks, project chips, or settings.
  Inputs and the rich editor opt back in via app.css. `display:contents` keeps
  the wrapper out of layout so fixed/viewport positioning is unaffected. -->
<div class="no-touch-select" style="display: contents">
  {@render children()}
</div>
