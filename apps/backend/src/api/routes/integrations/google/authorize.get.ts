import { createError } from "h3";
import { requireAuth } from "services/auth";
import { buildAuthUrl, googleConfigured } from "services/google-calendar";
import { signState } from "services/integrations/oauth-state";
import { handler } from "utils";

// Returns the Google consent URL for the signed-in user to open. Anonymous
// users can't connect — there'd be nothing durable to bind the account to.
export default handler(async ({ user }) => {
  requireAuth(user);
  if (!user.email) throw createError({ statusCode: 400, statusMessage: "Sign in before connecting Google" });
  if (!googleConfigured()) throw createError({ statusCode: 501, statusMessage: "Google integration not configured" });
  return { url: buildAuthUrl(signState(user.id)) };
});
