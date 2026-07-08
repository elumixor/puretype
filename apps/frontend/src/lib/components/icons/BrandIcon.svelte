<script lang="ts">
  import { BRAND_ICONS } from "./brand-data";

  // Renders a brand logo from build-time data URIs (see brand-data.ts) — no
  // runtime fetch, no hand-written SVG.
  let { brand, size = 14, class: cls = "" }: { brand: "google" | "notion"; size?: number; class?: string } = $props();
</script>

<img
  src={BRAND_ICONS[brand]}
  width={size}
  height={size}
  alt=""
  class="inline-block shrink-0 rounded-[3px] {cls}"
  style="width:{size}px;height:{size}px"
/>
