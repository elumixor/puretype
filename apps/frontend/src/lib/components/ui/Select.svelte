<script lang="ts">
  import { Select } from "bits-ui";
  import { Check, ChevronDown } from "lucide-svelte";

  // Thin wrapper over bits-ui's Select (the primitive shadcn-svelte builds on):
  // tested keyboard/a11y/positioning and a reliably scrollable menu. Keeps the
  // project's simple props API. Options can be plain or "action" items (e.g.
  // "Connect another workspace") that fire onAction instead of selecting.
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

  const selected = $derived(options.find((o) => o.value === value && !o.action));

  // Internal binding mirrors only real selections; action rows are intercepted
  // and snapped back so they never become the value.
  let internal = $state(value);
  $effect(() => {
    internal = value;
  });

  function onValueChange(v: string) {
    const o = options.find((x) => x.value === v);
    if (o?.action) {
      internal = value; // undo the transient selection of the action row
      onAction?.(v);
      return;
    }
    value = v;
    onChange?.(v);
  }
</script>

<Select.Root type="single" bind:value={internal} {onValueChange} {disabled} allowDeselect={false}>
  <Select.Trigger
    class="flex items-center justify-between gap-2 h-9 w-full rounded-md border border-border bg-surface px-3
      text-sm text-ink hover:bg-surface-3 disabled:opacity-50 transition-colors data-[state=open]:bg-surface-3"
  >
    <span class="truncate {selected ? '' : 'text-ink-3'}">{selected?.label ?? placeholder}</span>
    <ChevronDown
      size={15}
      class="text-ink-3 shrink-0 transition-transform data-[state=open]:rotate-180"
    />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      sideOffset={4}
      class="z-[95] w-[var(--bits-floating-anchor-width)] rounded-md border border-border bg-surface-2 p-1
        shadow-2xl shadow-black/50 animate-menu-pop"
    >
      <Select.Viewport class="max-h-60 overflow-y-auto">
        {#each options as o (o.value)}
          <Select.Item
            value={o.value}
            label={o.label}
            class="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-left cursor-pointer
              transition-colors outline-none data-[highlighted]:bg-surface-3
              {o.action ? 'text-accent' : 'text-ink'}"
          >
            {#snippet children({ selected: isSel })}
              <span class="w-4 shrink-0 flex justify-center">
                {#if !o.action && isSel}<Check size={14} class="text-accent" />{/if}
              </span>
              <span class="truncate">{o.label}</span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
