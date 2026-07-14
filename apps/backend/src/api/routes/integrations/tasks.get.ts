import { requireAuth } from "services/auth";
import { listExternalTasks } from "services/integrations/sync";
import { handler } from "utils";

// Live list of the user's external items (Notion pages, Calendar events),
// mapped to task-shaped objects. Not persisted — fetched fresh each call; the
// client merges them into its view. Source of truth is Notion/Google.
export default handler(async ({ user }) => {
  requireAuth(user);
  return listExternalTasks(user.id);
});
