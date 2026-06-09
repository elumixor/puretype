<script lang="ts">
  import { ArrowDown, ArrowUp, Mic, Sparkles } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { features } from "$lib/capabilities.svelte";
  import { portal } from "$lib/portal";
  import { ls } from "$lib/storage";

  // First-run coach marks. Shown once, only while the app is empty, then
  // remembered. Points at the project bar (top) and the composer (bottom);
  // adds a voice/AI note on iOS. (#33)
  let { show }: { show: boolean } = $props();

  const KEY = "onboarded";
  let seen = $state(true);
  onMount(async () => {
    seen = (await ls.get(KEY)) === "1";
  });

  const visible = $derived(show && !seen);
  function dismiss() {
    seen = true;
    void ls.set(KEY, "1");
  }
</script>

{#if visible}
  <div use:portal>
    <button
      aria-label="Dismiss tips"
      onclick={dismiss}
      class="fixed inset-0 z-[55] w-full bg-[var(--color-bg)]/85 backdrop-blur-[2px] cursor-default"
      transition:fade={{ duration: 200 }}
    ></button>

    <div
      class="fixed inset-0 z-[56] flex flex-col items-center justify-between px-7 pointer-events-none"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 4.5rem);
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 6.5rem);"
      transition:fade={{ duration: 200 }}
    >
      <!-- Top: projects -->
      <div class="flex flex-col items-center text-center text-[var(--color-accent)]">
        <ArrowUp size={22} class="animate-bounce" />
        <p class="mt-1 text-[13px] font-medium leading-snug max-w-[16rem]">
          Group tasks under projects — tap <span class="font-semibold">+ New project</span> up here.
        </p>
      </div>

      <!-- Center: welcome -->
      <div class="flex flex-col items-center text-center pointer-events-auto">
        <h1 class="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Welcome to PureType</h1>
        <p class="mt-2 text-sm text-[var(--color-ink-2)] max-w-[18rem] leading-relaxed">
          A calm place for what's next. Type a task, press enter, and it's saved.
        </p>
        {#if features.voice}
          <div class="mt-5 flex flex-col gap-2 text-[13px] text-[var(--color-ink-2)]">
            <span class="flex items-center gap-2 justify-center">
              <Mic size={15} class="text-[var(--color-accent)]" />
              Hold the mic to add or change tasks by voice.
            </span>
            <span class="flex items-center gap-2 justify-center">
              <Sparkles size={15} class="text-[var(--color-accent)]" />
              Type naturally — dates and projects are detected for you.
            </span>
          </div>
        {/if}
        <button
          onclick={dismiss}
          class="mt-7 px-6 h-11 rounded-2xl bg-[var(--color-accent)] text-[var(--color-bg)]
            text-sm font-semibold active:scale-95 transition-transform"
        >
          Get started
        </button>
      </div>

      <!-- Bottom: composer -->
      <div class="flex flex-col items-center text-center text-[var(--color-accent)]">
        <p class="mb-1 text-[13px] font-medium leading-snug max-w-[16rem]">
          Add your first task down here, then press enter.
        </p>
        <ArrowDown size={22} class="animate-bounce" />
      </div>
    </div>
  </div>
{/if}
