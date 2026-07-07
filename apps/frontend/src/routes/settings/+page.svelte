<script lang="ts">
  import { ArrowLeft, LogOut, Moon, Sun, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";
  import { auth } from "$lib/auth.svelte";
  import {
    clearSocialSessions,
    initSocialLogin,
    isUserCancellation,
    signInWithApple,
    signInWithGoogle,
  } from "$lib/auth/social-login";
  import Integrations from "$lib/components/Integrations.svelte";
  import Paywall from "$lib/components/Paywall.svelte";
  import SignInButtons from "$lib/components/SignInButtons.svelte";
  import UserAvatar from "$lib/components/UserAvatar.svelte";
  import { entitlement } from "$lib/capabilities.svelte";
  import { projects } from "$lib/projects.svelte";
  import { refreshEntitlement, storeAvailable } from "$lib/storekit";
  import { BUCKET_LABEL, settings } from "$lib/settings.svelte";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import type { Bucket } from "$lib/tokens";
  import { user } from "$lib/user.svelte";

  const BUCKETS: Bucket[] = ["today", "week", "later"];

  const displayName = $derived(me?.name || me?.email || "You");
  const completed = $derived(tasksStore.list.filter((t) => t.completed).length);
  const active = $derived(tasksStore.list.filter((t) => !t.completed).length);
  const projectCount = $derived(projects.list.length);
  const memberSince = $derived(
    me?.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null,
  );

  const me = $derived(user.me);
  const resolved = $derived(user.resolved);
  const anonymous = $derived(me?.anonymous ?? true);

  let signingIn = $state(false);
  let deleting = $state(false);
  let error = $state<string | null>(null);
  let dark = $state(true);
  let paywallOpen = $state(false);

  onMount(async () => {
    dark = localStorage.getItem("theme") !== "light";
    void settings.boot();
    void tasksStore.boot();
    void projects.boot();
    void refreshEntitlement();
    await initSocialLogin();
  });

  function toggleTheme() {
    dark = !dark;
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("light", !dark);
  }

  async function handleSignIn(provider: "google" | "apple") {
    signingIn = true;
    error = null;
    try {
      const { token } = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      await auth.setToken(token);
      await user.refresh();
      location.assign("/");
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
    location.assign("/");
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Delete your account?\n\nThis permanently removes your tasks, projects, and account from our servers. This cannot be undone.",
    );
    if (!confirmed) return;
    deleting = true;
    error = null;
    try {
      await api.users.me.$delete();
      await clearSocialSessions();
      user.reset();
      await auth.logout();
      location.assign("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not delete account";
      deleting = false;
    }
  }
</script>

<main class="relative max-w-md mx-auto px-5 pt-10 pb-24 safe-top min-h-screen">
  <header class="flex items-center gap-3 mb-8">
    <button
      type="button"
      onclick={() => goto("/")}
      aria-label="Back"
      class="w-10 h-10 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
        flex items-center justify-center transition-colors"
    >
      <ArrowLeft size={16} class="text-[var(--color-ink-2)]" />
    </button>
    <h1 class="text-lg font-semibold tracking-tight">Settings</h1>
  </header>

  <section class="mb-8">
    <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Theme</h2>
    <button
      type="button"
      onclick={toggleTheme}
      class="w-full flex items-center justify-between h-14 px-4 rounded-2xl
        bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
    >
      <span class="text-sm font-medium">{dark ? "Dark" : "Light"}</span>
      {#if dark}
        <Moon size={18} class="text-[var(--color-ink-2)]" />
      {:else}
        <Sun size={18} class="text-[var(--color-ink-2)]" />
      {/if}
    </button>
  </section>

  {#if storeAvailable}
    <section class="mb-8">
      <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Subscription</h2>
      {#if entitlement.hasPro}
        <div
          class="flex items-center justify-between h-14 px-4 rounded-2xl bg-[var(--color-accent-dim)]
            border border-[var(--color-accent)]/30"
        >
          <span class="text-sm font-semibold text-[var(--color-accent)]">PureType Pro</span>
          <span class="text-xs text-[var(--color-ink-2)]">Active</span>
        </div>
      {:else}
        <button
          type="button"
          onclick={() => (paywallOpen = true)}
          class="w-full flex items-center justify-between h-14 px-4 rounded-2xl
            bg-[var(--color-accent)] text-[var(--color-bg)] active:scale-[0.99] transition-transform"
        >
          <span class="text-sm font-semibold">Upgrade to Pro</span>
          <span class="text-xs opacity-80">Voice + AI</span>
        </button>
      {/if}
    </section>
  {/if}

  <section class="mb-8">
    <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">New tasks land in</h2>
    <div class="grid grid-cols-3 gap-2">
      {#each BUCKETS as b (b)}
        <button
          type="button"
          onclick={() => settings.setDefaultBucket(b)}
          class="h-12 rounded-2xl text-sm font-medium transition-colors
            {settings.defaultBucket === b
            ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            : 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]'}"
        >
          {BUCKET_LABEL[b]}
        </button>
      {/each}
    </div>
    <p class="text-[0.7rem] text-[var(--color-ink-3)] mt-2 leading-relaxed">
      Where a new task goes when you don't type a date. Typing a date (like “@tomorrow”) always wins.
    </p>
  </section>

  <section>
    <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Account</h2>

    {#if !resolved}
      <!-- Loading identity — don't flash the sign-in buttons before we know
        whether a valid signed-in token is already stored. -->
      <div class="h-12 rounded-2xl bg-[var(--color-surface-2)] animate-pulse"></div>
    {:else if anonymous}
      <p class="text-sm text-[var(--color-ink-2)] mb-4">
        Keep your tasks safe across devices. Anything you've added so far carries over.
      </p>
      <SignInButtons {signingIn} onSignIn={handleSignIn} />
      {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
    {:else}
      <div class="flex items-center gap-3 mb-5">
        <UserAvatar name={displayName} size={52} />
        <div class="min-w-0">
          <p class="text-[15px] font-semibold truncate">{displayName}</p>
          {#if me?.name && me?.email}<p class="text-xs text-[var(--color-ink-3)] truncate">{me.email}</p>{/if}
          {#if memberSince}<p class="text-xs text-[var(--color-ink-3)]">Since {memberSince}</p>{/if}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-5">
        {#each [{ n: completed, l: "Completed" }, { n: active, l: "Active" }, { n: projectCount, l: "Projects" }] as s (s.l)}
          <div class="rounded-2xl bg-[var(--color-surface-2)] py-3 text-center">
            <div class="text-xl font-semibold text-[var(--color-ink)]">{s.n}</div>
            <div class="text-[11px] text-[var(--color-ink-3)] mt-0.5">{s.l}</div>
          </div>
        {/each}
      </div>

      <button
        onclick={handleSignOut}
        class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl
          bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <LogOut size={17} />
        <span class="text-sm font-medium">Sign out</span>
      </button>
      {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
    {/if}
  </section>

  {#if !anonymous}
    <div class="mt-10">
      <Integrations />
    </div>
  {/if}

  {#if !anonymous}
    <section class="mt-10">
      <div class="flex justify-center pt-4">
        <button
          type="button"
          onclick={handleDeleteAccount}
          disabled={deleting}
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs
            text-[var(--color-ink-3)] hover:text-[var(--color-danger)] disabled:opacity-60 transition-colors"
        >
          <Trash2 size={13} />
          <span>{deleting ? "Deleting…" : "Delete account"}</span>
        </button>
      </div>
      <p class="text-center text-[0.7rem] text-[var(--color-ink-3)] mt-2 leading-relaxed">
        Permanently removes your tasks and account from our servers.
      </p>
    </section>
  {/if}
</main>

{#if paywallOpen}
  <Paywall onClose={() => (paywallOpen = false)} />
{/if}
