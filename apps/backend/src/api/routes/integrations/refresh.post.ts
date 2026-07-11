import { requireAuth } from "services/auth";
import { syncUser } from "services/integrations/sync";
import { handler } from "utils";

// Called by the client on a manual "refresh" action. Forces a re-pull of every
// source regardless of when it was last synced, so an external edit (e.g. a
// Notion date change) shows up immediately instead of waiting out the staleness
// window. The cheap, throttled path is the background app-open sync in syncUser.
export default handler(async ({ user }) => {
  requireAuth(user);
  await syncUser(user.id, { force: true });
  return { ok: true };
});
