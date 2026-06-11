<script lang="ts">
  import { Check, Copy, LogOut, Send, User as UserIcon, X } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { api } from "$lib/api/client";
  import { auth } from "$lib/auth.svelte";
  import {
    clearSocialSessions,
    initSocialLogin,
    isUserCancellation,
    signInWithApple,
    signInWithGoogle,
  } from "$lib/auth/social-login";
  import { portal } from "$lib/portal";
  import { user } from "$lib/user.svelte";
  import SignInButtons from "./SignInButtons.svelte";
  import UserAvatar from "./UserAvatar.svelte";

  const me = $derived(user.me);
  const resolved = $derived(user.resolved);
  const anonymous = $derived(me?.anonymous ?? true);
  const displayName = $derived(me?.name || me?.email || "You");

  let open = $state(false);
  let signingIn = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  onMount(initSocialLogin);

  async function handleSignIn(provider: "google" | "apple") {
    signingIn = true;
    error = null;
    try {
      const { token } = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      await auth.setToken(token);
      await user.refresh();
      open = false;
      // Reload so data-loading screens re-fetch under the new identity.
      location.reload();
    } catch (e) {
      if (!isUserCancellation(e)) error = e instanceof Error ? e.message : "Sign in failed";
    } finally {
      signingIn = false;
    }
  }

  async function handleSignOut() {
    await clearSocialSessions();
    user.reset();
    await auth.logout();
    location.reload();
  }

  // Telegram linking: fetch a one-time code, show it + a deep link into the bot.
  let tgCode = $state<string | null>(null);
  let tgDeepLink = $state<string | null>(null);
  let tgLoading = $state(false);
  let tgError = $state<string | null>(null);
  let tgCopied = $state(false);

  async function linkTelegram() {
    tgLoading = true;
    tgError = null;
    try {
      const res = await api.telegram.link.$post();
      tgCode = res.code;
      tgDeepLink = res.deepLink;
    } catch (e) {
      tgError = e instanceof Error ? e.message : "Couldn't create a link code";
    } finally {
      tgLoading = false;
    }
  }

  async function copyCode() {
    if (!tgCode) return;
    try {
      await navigator.clipboard.writeText(tgCode);
      tgCopied = true;
      setTimeout(() => (tgCopied = false), 1500);
    } catch {
      /* clipboard blocked — the code is visible anyway */
    }
  }

  // Reset the linking UI whenever the modal closes.
  $effect(() => {
    if (!open) {
      tgCode = null;
      tgDeepLink = null;
      tgError = null;
    }
  });
</script>

<button
  onclick={() => (open = true)}
  aria-label={anonymous ? "Sign in" : "Account"}
  class="w-11 h-11 rounded-2xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
    flex items-center justify-center transition-all duration-300 overflow-hidden"
>
  {#if !resolved}
    <!-- Skeleton while auth/user load — guessing identity here flashes the
      wrong icon (and sign-in buttons) on launch. -->
    <div class="w-5 h-5 rounded-full bg-[var(--color-surface-3)] animate-pulse"></div>
  {:else if anonymous}
    <UserIcon size={17} class="text-[var(--color-ink-2)]" />
  {:else}
    <UserAvatar name={displayName} size={32} />
  {/if}
</button>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && (open = false)} />

{#if open}
  <div
    use:portal
    class="fixed inset-0 z-50 grid place-items-center px-4 py-6 bg-black/70 backdrop-blur-md overscroll-contain
      [-webkit-tap-highlight-color:transparent]"
    onclick={() => (open = false)}
    role="presentation"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="relative w-full max-w-[22rem] rounded-3xl bg-[var(--color-surface)] p-6 shadow-2xl
        ring-1 ring-black/5 dark:ring-white/10"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      transition:scale={{ duration: 180, start: 0.96 }}
    >
      <button
        onclick={() => (open = false)}
        aria-label="Close"
        class="absolute top-3 right-3 w-8 h-8 rounded-full
          flex items-center justify-center text-[var(--color-ink-2)]
          hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <X size={16} />
      </button>

      {#if anonymous}
        <h2 class="text-lg font-semibold mb-1">Sign in</h2>
        <p class="text-sm text-[var(--color-ink-2)] mb-5 pr-6">
          Keep your tasks safe across devices. Anything you've added so far carries over.
        </p>
        <SignInButtons {signingIn} onSignIn={handleSignIn} />
        {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
      {:else}
        <div class="flex items-center gap-3 mb-5 pr-6">
          <UserAvatar name={displayName} size={48} />
          <div class="min-w-0">
            <h2 class="text-base font-semibold truncate">{displayName}</h2>
            {#if me?.name && me?.email}<p class="text-xs text-[var(--color-ink-3)] truncate">{me.email}</p>{/if}
          </div>
        </div>
        {#if tgCode}
          <div class="mb-3 rounded-2xl bg-[var(--color-surface-2)] p-4 text-center">
            <p class="text-xs text-[var(--color-ink-2)] mb-2">
              Send this code to the bot, or tap below to open it.
            </p>
            <button
              onclick={copyCode}
              class="inline-flex items-center gap-2 font-mono text-xl font-semibold tracking-[0.3em]
                px-2 hover:opacity-80 transition-opacity"
              aria-label="Copy code"
            >
              {tgCode}
              {#if tgCopied}<Check size={15} class="text-green-500" />{:else}<Copy size={15} class="text-[var(--color-ink-3)]" />{/if}
            </button>
            {#if tgDeepLink}
              <a
                href={tgDeepLink}
                target="_blank"
                rel="noopener"
                class="mt-3 flex items-center justify-center gap-2 w-full h-11 rounded-xl
                  bg-[#229ED9] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Send size={15} />
                Open in Telegram
              </a>
            {/if}
            <p class="mt-2 text-[11px] text-[var(--color-ink-3)]">Code expires in 10 minutes.</p>
          </div>
        {:else}
          <button
            onclick={linkTelegram}
            disabled={tgLoading}
            class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl mb-3
              bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors disabled:opacity-50"
          >
            <Send size={17} />
            <span class="text-sm font-medium">{tgLoading ? "Creating code…" : "Link Telegram"}</span>
          </button>
        {/if}
        {#if tgError}<p class="text-sm text-red-500 mb-3 text-center">{tgError}</p>{/if}
        <button
          onclick={handleSignOut}
          class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl
            bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <LogOut size={17} />
          <span class="text-sm font-medium">Sign out</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
