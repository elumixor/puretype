import { env } from "env";
import { createError, getHeader } from "h3";
import { syncAllStale } from "services/integrations/sync";
import { handler } from "utils";

// Background refresh for users who don't currently have the app open. Vercel
// hits this on the schedule in vercel.json. When CRON_SECRET is set, Vercel
// sends it as a Bearer token; reject anything else.
export default handler(async ({ event }) => {
  if (env.CRON_SECRET) {
    const auth = getHeader(event, "authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  await syncAllStale();
  return { ok: true };
});
