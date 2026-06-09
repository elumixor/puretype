import { ls } from "$lib/storage";
import type { Bucket } from "$lib/tokens";

const DEFAULT_BUCKET_KEY = "defaultBucket";

// User-facing labels for the "new tasks land in…" preference.
export const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  week: "This week",
  later: "Later",
};

// Small persisted settings store. `defaultBucket` controls where a freshly
// typed task goes when it carries no explicit date token (#43). A date token
// (e.g. "@tomorrow") always wins over this default.
class Settings {
  defaultBucket = $state<Bucket>("today");
  private booted = false;

  async boot() {
    if (this.booted) return;
    this.booted = true;
    const raw = await ls.get(DEFAULT_BUCKET_KEY);
    if (raw === "today" || raw === "week" || raw === "later") this.defaultBucket = raw;
  }

  setDefaultBucket(b: Bucket) {
    this.defaultBucket = b;
    void ls.set(DEFAULT_BUCKET_KEY, b);
  }
}

export const settings = new Settings();
