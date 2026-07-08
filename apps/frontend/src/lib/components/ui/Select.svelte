<script lang="ts">
  import { Check, ChevronDown } from "lucide-svelte";
  import { portal } from "$lib/portal";

  // Minimal shadcn-style select: a styled trigger + a portaled dropdown so it
  // never clips inside a scrolling modal. Options can be plain or "action" items
  // (e.g. "Connect another workspace") that fire onAction instead of selecting.
  interface Option {
    value: string;
    label: string;
    action?: boolean; // renders as an accented action row; fires onAction(value)
  }
  let {
    value = $bindable(),
    options,
    placeholder = "Select…",
    disabled = false,
    onChange,
    onAction,
  }: {
    value: string;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    onChange?: (v: string) => void;
    onAction?: (v: string) => void;
  } = $props();

  let open = $state(false);
  let triggerEl: HTMLButtonElement | undefined = $state();
  let rect = $state<DOMRect | null>(null);

  const selected = $derived(options.find((o) => o.value === value && !o.action));

  function toggle() {
    if (disabled) return;
    if (!open && triggerEl) rect = triggerEl.getBoundingClientRect();
    open = !open;
  }
  function pick(o: Option) {
    open = false;
    if (o.action) onAction?.(o.value);
    else {
      value = o.value;
      onChange?.(o.value);
    }
  }

  // Close on outside pointer / scroll / resize.
  $effect(() => {
    if (!open) return;
    const close = () => (open = false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerEl?.contains(t) || (t instanceof Element && t.closest("[data-select-menu]"))) return;
      open = false;
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  });

  // Flip above the trigger when it'd overflow the viewport bottom.
  const below = $derived(rect ? window.innerHeight - rect.bottom > 240 || rect.top < 260 : true);
</script>

<button
  bind:this={triggerEl}
  type="button"
  {disabled}
  onclick={toggle}
  class="flex items-center justify-between gap-2 h-9 w-full rounded-md border border-border bg-surface px-3
    text-sm text-ink hover:bg-surface-3 disabled:opacity-50 transition-colors"
>
  <span class="truncate {selected ? '' : 'text-ink-3'}">{selected?.label ?? placeholder}</span>
  <ChevronDown size={15} class="text-ink-3 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
</button>

{#if open && rect}
  <div use:portal>
    <div
      data-select-menu
      class="fixed z-[95] max-h-60 overflow-y-auto rounded-md border border-border bg-surface-2 p-1
        shadow-2xl shadow-black/50 animate-fade-in"
      style="left:{rect.left}px; width:{rect.width}px; {below
        ? `top:${rect.bottom + 4}px`
        : `bottom:${window.innerHeight - rect.top + 4}px`}"
    >
      {#each options as o (o.value)}
        <button
          type="button"
          onclick={() => pick(o)}
          class="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-left transition-colors
            {o.action ? 'text-accent hover:bg-accent-dim' : 'text-ink hover:bg-surface-3'}"
        >
          <span class="w-4 shrink-0 flex justify-center">
            {#if !o.action && o.value === value}<Check size={14} class="text-accent" />{/if}
          </span>
          <span class="truncate">{o.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
