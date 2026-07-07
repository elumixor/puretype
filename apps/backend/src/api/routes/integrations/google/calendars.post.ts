import { createError } from "h3";
import { requireAuth } from "services/auth";
import { listCalendars } from "services/google-calendar";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// The calendars available on a connected Google account, for the user to map
// one to a project. POST (not GET) because the typed client passes params via
// body, matching the rest of the codebase's read-via-POST style (e.g. sync/pull).
export default handler({ body: { accountId: z.string() } }, async ({ user, body }) => {
  requireAuth(user);
  const account = await prisma.googleAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
  const calendars = await listCalendars(account);
  return { calendars: calendars.map((c) => ({ id: c.id, name: c.summary, primary: c.primary ?? false })) };
});
