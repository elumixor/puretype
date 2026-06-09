<script lang="ts">
  import { Loader2, Mic, Plus } from "lucide-svelte";
  import Paywall from "./Paywall.svelte";
  import RichTaskInput from "./RichTaskInput.svelte";
  import VoiceBubble from "./VoiceBubble.svelte";
  import VoiceButton from "./VoiceButton.svelte";
  import { features } from "$lib/capabilities.svelte";
  import { voiceTurn } from "$lib/voice-turn.svelte";

  let {
    input = $bindable<RichTaskInput | undefined>(),
    bubble = $bindable<HTMLDivElement | undefined>(),
    onSubmit,
    onVoiceRecorded,
  }: {
    input?: RichTaskInput;
    bubble?: HTMLDivElement;
    onSubmit: (text: string) => void;
    onVoiceRecorded: (file: File) => void | Promise<void>;
  } = $props();

  // Empty input → show the mic (voice is the primary action); once the user
  // types, the button becomes the send (+) action. Either way it stays active.
  let empty = $state(true);
  let paywallOpen = $state(false);
</script>

<div class="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="max-w-md mx-auto px-5 pt-14 pointer-events-auto
      bg-[linear-gradient(to_top,var(--color-bg)_0%,var(--color-bg)_75%,transparent_100%)]"
    style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
  >
    {#if features.voice}<VoiceBubble bind:bubble />{/if}
    <div class="relative" data-voice-keep>
      <RichTaskInput
        bind:this={input}
        placeholder="@ for project, time, place"
        onsubmit={onSubmit}
        onEmptyChange={(e) => (empty = e)}
      >
        {#snippet endSlot()}
          {#if features.voice && voiceTurn.loading}
            <div class="w-8 h-8 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center">
              <Loader2 size={14} class="animate-spin text-[var(--color-ink-2)]" />
            </div>
          {:else if features.voice}
            <VoiceButton
              compact
              {empty}
              onRecorded={onVoiceRecorded}
              onError={(m) => voiceTurn.setError(m)}
              onTapSend={() => input?.submit()}
              onStart={(s) => voiceTurn.setRecording(s)}
              onStop={() => voiceTurn.setRecording(null)}
            />
          {:else if features.voiceUpsell && empty}
            <!-- iOS, not Pro, empty input: mic that opens the paywall. -->
            <button
              type="button"
              onclick={() => (paywallOpen = true)}
              aria-label="Unlock voice with PureType Pro"
              class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-accent)]
                hover:bg-[var(--color-accent-hover)] active:scale-95 transition-all"
            >
              <Mic size={16} class="text-[var(--color-bg)]" />
            </button>
          {:else}
            <!-- Web, or typed text: plain send button (always active). -->
            <button
              type="button"
              onclick={() => input?.submit()}
              aria-label="Add task"
              class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-accent)]
                hover:bg-[var(--color-accent-hover)] active:scale-95 transition-all"
            >
              <Plus size={16} strokeWidth={2.5} class="text-[var(--color-bg)]" />
            </button>
          {/if}
        {/snippet}
      </RichTaskInput>
    </div>
  </div>
</div>

{#if paywallOpen}
  <Paywall onClose={() => (paywallOpen = false)} />
{/if}
