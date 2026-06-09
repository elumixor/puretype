<script lang="ts">
  import { onMount } from "svelte";
  import { ls } from "$lib/storage";
  import BoringAvatar from "./BoringAvatar.svelte";

  // Provider photo (Google) is captured at login into ls("avatarUrl"). Apple
  // gives no photo, so we fall back to a deterministic boring avatar seeded by
  // the user's name/email. (#40)
  let { name, size = 44 }: { name: string; size?: number } = $props();

  let url = $state<string | null>(null);
  let failed = $state(false);
  onMount(async () => {
    url = await ls.get("avatarUrl");
  });
</script>

{#if url && !failed}
  <img
    src={url}
    alt=""
    width={size}
    height={size}
    referrerpolicy="no-referrer"
    onerror={() => (failed = true)}
    class="rounded-full object-cover shrink-0"
    style="width:{size}px;height:{size}px"
  />
{:else}
  <BoringAvatar {name} {size} />
{/if}
