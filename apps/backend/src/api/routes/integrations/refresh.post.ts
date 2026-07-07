import { requireAuth } from "services/auth";
import { syncUser } from "services/integrations/sync";
import { handler } from "utils";

// Called by the client on app open (and a manual "refresh" action). Pulls the
// user's stale sources so fresh external items land before the next sync/pull.
// syncUser skips sources synced within the last few minutes, so calling this
// often is cheap.
export default handler(async ({ user }) => {
  requireAuth(user);
  await syncUser(user.id);
  return { ok: true };
});
