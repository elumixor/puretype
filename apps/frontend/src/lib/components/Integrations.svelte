<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import GoogleIntegration from "./integrations/GoogleIntegration.svelte";
  import NotionIntegration from "./integrations/NotionIntegration.svelte";

  type Data = Awaited<ReturnType<typeof api.integrations.$get>>;

  let data = $state<Data | null>(null);
  let error = $state<string | null>(null);

  async function reload() {
    try {
      data = await api.integrations.$get();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load integrations";
    }
  }

  onMount(reload);
</script>

<section class="mb-8">
  <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Integrations</h2>
  <p class="text-[0.7rem] text-[var(--color-ink-3)] mb-3 leading-relaxed">
    Pull events and database items in as tasks. Each source maps to one project.
  </p>

  {#if !data}
    <div class="h-14 rounded-2xl bg-[var(--color-surface-2)] animate-pulse"></div>
  {:else}
    <div class="space-y-3">
      <GoogleIntegration google={data.google} onReload={reload} />
      <NotionIntegration notion={data.notion} onReload={reload} />
    </div>
  {/if}
  {#if error}<p class="text-sm text-red-500 mt-3">{error}</p>{/if}
</section>
