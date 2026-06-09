<script lang="ts">
  import { Check, Loader2, Mic, Sparkles, X } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { portal } from "$lib/portal";
  import { getProducts, PRODUCTS, purchase, restore, type StoreProduct } from "$lib/storekit";

  let { onClose }: { onClose: () => void } = $props();

  let products = $state<StoreProduct[]>([]);
  let loading = $state(true);
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    products = await getProducts();
    loading = false;
  });

  // Yearly first (better value), then monthly.
  const ordered = $derived(
    [PRODUCTS.yearly, PRODUCTS.monthly].map((id) => products.find((p) => p.id === id)).filter(Boolean) as StoreProduct[],
  );

  async function buy(id: string) {
    error = null;
    busy = id;
    try {
      const ok = await purchase(id);
      if (ok) onClose();
      else error = "Purchase didn't complete.";
    } catch (e) {
      error = e instanceof Error ? e.message : "Purchase failed.";
    } finally {
      busy = null;
    }
  }

  async function doRestore() {
    error = null;
    busy = "restore";
    try {
      const ok = await restore();
      if (ok) onClose();
      else error = "No purchases to restore.";
    } catch {
      error = "Restore failed.";
    } finally {
      busy = null;
    }
  }
</script>

<div use:portal>
  <button
    aria-label="Close"
    class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
    onclick={onClose}
    transition:fade={{ duration: 150 }}
  ></button>
  <div
    class="fixed left-1/2 bottom-0 -translate-x-1/2 z-[61] w-full max-w-md
      p-6 rounded-t-3xl bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-2xl"
    style="padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));"
    transition:scale={{ duration: 200, start: 0.98 }}
  >
    <button
      onclick={onClose}
      aria-label="Close"
      class="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
        text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
    >
      <X size={16} />
    </button>

    <h2 class="text-xl font-semibold tracking-tight">PureType Pro</h2>
    <div class="mt-3 mb-5 flex flex-col gap-2 text-sm text-[var(--color-ink-2)]">
      <span class="flex items-center gap-2"><Mic size={15} class="text-[var(--color-accent)]" /> Add tasks by voice</span>
      <span class="flex items-center gap-2"
        ><Sparkles size={15} class="text-[var(--color-accent)]" /> AI detects dates & projects as you type</span
      >
    </div>

    {#if loading}
      <div class="h-24 flex items-center justify-center">
        <Loader2 size={20} class="animate-spin text-[var(--color-ink-3)]" />
      </div>
    {:else if ordered.length === 0}
      <p class="text-sm text-[var(--color-ink-3)] py-6 text-center">
        Plans aren't available right now. Please try again later.
      </p>
    {:else}
      <div class="flex flex-col gap-2.5">
        {#each ordered as p (p.id)}
          <button
            onclick={() => buy(p.id)}
            disabled={busy !== null}
            class="flex items-center justify-between h-14 px-4 rounded-2xl border transition-colors
              border-[var(--color-border)] hover:border-[var(--color-accent)]/50 bg-[var(--color-surface-2)]
              disabled:opacity-60"
          >
            <span class="flex flex-col items-start">
              <span class="text-sm font-semibold">{p.displayName}</span>
              {#if p.hasIntroOffer}<span class="text-[11px] text-[var(--color-accent)]">7-day free trial</span>{/if}
            </span>
            <span class="flex items-center gap-2">
              <span class="text-sm font-medium">{p.displayPrice}/{p.period}</span>
              {#if busy === p.id}<Loader2 size={15} class="animate-spin" />{:else}<Check
                  size={15}
                  class="text-[var(--color-accent)]"
                />{/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if error}<p class="text-sm text-red-500 mt-3">{error}</p>{/if}

    <button
      onclick={doRestore}
      disabled={busy !== null}
      class="w-full mt-4 text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
    >
      {busy === "restore" ? "Restoring…" : "Restore purchases"}
    </button>
  </div>
</div>
