import { api } from "$lib/api/client";
import { auth } from "$lib/auth.svelte";

type Me = typeof api.users.me.$get.$response;

let me = $state<Me | null>(null);
let loadPromise: Promise<void> | null = null;

function ensureLoaded() {
  if (loadPromise) return loadPromise;
  if (!auth.isLoggedIn) return Promise.resolve();
  loadPromise = (async () => {
    try {
      me = await api.users.me.$get();
    } catch {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export const user = {
  get me() {
    void ensureLoaded();
    return me;
  },
  // True once we actually know who the user is. Until then the UI must not
  // guess "anonymous" — doing so flashes the sign-in buttons on launch even
  // when a valid signed-in token is stored. We're resolved when auth has
  // bootstrapped AND (there's no token, or the user record has loaded).
  get resolved() {
    void ensureLoaded();
    if (!auth.ready) return false;
    if (auth.isLoggedIn && me === null) return false;
    return true;
  },
  async refresh() {
    loadPromise = null;
    me = null;
    await ensureLoaded();
  },
  reset() {
    me = null;
    loadPromise = null;
  },
};
