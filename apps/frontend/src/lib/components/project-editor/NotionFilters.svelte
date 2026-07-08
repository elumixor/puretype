<script lang="ts">
  import { Plus, X } from "lucide-svelte";
  import Select from "../ui/Select.svelte";

  // Builds the row-sync filter conditions for a Notion source: only rows
  // matching every condition become tasks. Limited to the property types we can
  // render a value picker for (status / select / checkbox).
  export interface Condition {
    property: string; // Notion property id
    type: "status" | "select" | "checkbox";
    operator: "is" | "is_not";
    value: string | null;
  }
  type Prop = { id: string; name: string; type: string; options?: string[] };

  let {
    properties,
    conditions = $bindable(),
  }: {
    properties: Prop[];
    conditions: Condition[];
  } = $props();

  const filterable = $derived(properties.filter((p) => ["status", "select", "checkbox"].includes(p.type)));
  const propOptions = $derived(filterable.map((p) => ({ value: p.id, label: p.name })));
  const optionsFor = (id: string) => properties.find((p) => p.id === id)?.options ?? [];

  function opOptions(type: Condition["type"]) {
    return type === "checkbox"
      ? [
          { value: "is", label: "is checked" },
          { value: "is_not", label: "is unchecked" },
        ]
      : [
          { value: "is", label: "is" },
          { value: "is_not", label: "is not" },
        ];
  }

  function addCondition() {
    const p = filterable[0];
    if (!p) return;
    const type = p.type as Condition["type"];
    conditions = [
      ...conditions,
      { property: p.id, type, operator: "is", value: type === "checkbox" ? null : (p.options?.[0] ?? null) },
    ];
  }

  function onProperty(i: number, id: string) {
    const p = properties.find((x) => x.id === id);
    if (!p) return;
    const type = p.type as Condition["type"];
    conditions[i] = { property: id, type, operator: "is", value: type === "checkbox" ? null : (p.options?.[0] ?? null) };
  }

  const remove = (i: number) => (conditions = conditions.filter((_, j) => j !== i));

  const labelCls = "block text-[10px] font-medium uppercase tracking-wider text-ink-3";
</script>

<div class="space-y-2">
  <span class={labelCls}>Only sync rows where</span>

  {#each conditions as c, i (i)}
    <div class="flex items-center gap-1.5">
      <div class="flex-1 min-w-0">
        <Select value={c.property} options={propOptions} onChange={(v) => onProperty(i, v)} />
      </div>
      <div class="w-28 shrink-0">
        <Select value={c.operator} options={opOptions(c.type)} onChange={(v) => (c.operator = v as Condition["operator"])} />
      </div>
      {#if c.type !== "checkbox"}
        <div class="flex-1 min-w-0">
          <Select
            value={c.value ?? ""}
            options={optionsFor(c.property).map((o) => ({ value: o, label: o }))}
            placeholder="Value…"
            onChange={(v) => (c.value = v)}
          />
        </div>
      {/if}
      <button
        type="button"
        onclick={() => remove(i)}
        aria-label="Remove filter"
        class="shrink-0 text-ink-3 hover:text-danger transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  {/each}

  <button
    type="button"
    onclick={addCondition}
    disabled={!filterable.length}
    class="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover
      disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
  >
    <Plus size={13} /> Add filter
  </button>
</div>
