import { createError } from "h3";
import { requireAuth } from "services/auth";
import { signState } from "services/integrations/oauth-state";
import { buildAuthUrl, notionConfigured } from "services/notion";
import { handler } from "utils";

export default handler(async ({ user }) => {
  requireAuth(user);
  if (!user.email) throw createError({ statusCode: 400, statusMessage: "Sign in before connecting Notion" });
  if (!notionConfigured()) throw createError({ statusCode: 501, statusMessage: "Notion integration not configured" });
  return { url: buildAuthUrl(signState(user.id)) };
});
