<script lang="ts">
  // Brand logos served from Brandfetch's Logo Link CDN (no hand-drawn SVGs).
  // Needs a free Logo Link client id in VITE_BRANDFETCH_CLIENT_ID.
  let { brand, size = 14, class: cls = "" }: { brand: "google" | "notion"; size?: number; class?: string } = $props();

  const DOMAIN: Record<typeof brand, string> = {
    google: "calendar.google.com",
    notion: "notion.so",
  };
  const clientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID as string | undefined;
  // 2x for crisp rendering on retina.
  const src = $derived(
    clientId ? `https://cdn.brandfetch.io/${DOMAIN[brand]}/w/${size * 2}/h/${size * 2}/icon?c=${clientId}` : "",
  );
</script>

{#if src}
  <img
    {src}
    width={size}
    height={size}
    alt=""
    loading="lazy"
    class="inline-block shrink-0 rounded-[3px] {cls}"
    style="width:{size}px;height:{size}px"
  />
{/if}
