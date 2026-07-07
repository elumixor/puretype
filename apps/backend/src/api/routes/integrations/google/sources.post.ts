import { createError } from "h3";
import { requireAuth } from "services/auth";
import { syncCalendarSource } from "services/integrations/sync";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Bind a calendar to a project and pull it in immediately so its events show
// up on the client's next sync.
export default handler(
  { body: { accountId: z.string(), calendarId: z.string(), calendarName: z.string(), projectId: z.string() } },
  async ({ user, body }) => {
    requireAuth(user);
    const [account, project] = await Promise.all([
      prisma.googleAccount.findFirst({ where: { id: body.accountId, userId: user.id }, select: { id: true } }),
      prisma.project.findFirst({ where: { id: body.projectId, userId: user.id }, select: { id: true } }),
    ]);
    if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
    if (!project) throw createError({ statusCode: 404, statusMessage: "Project not found" });

    const source = await prisma.calendarSource.upsert({
      where: { googleAccountId_calendarId: { googleAccountId: body.accountId, calendarId: body.calendarId } },
      create: {
        userId: user.id,
        googleAccountId: body.accountId,
        calendarId: body.calendarId,
        calendarName: body.calendarName,
        projectId: body.projectId,
      },
      update: { projectId: body.projectId, calendarName: body.calendarName },
      include: { account: true },
    });

    try {
      await syncCalendarSource(source);
    } catch (err) {
      console.error("[integrations] initial calendar sync failed:", err);
    }
    const { account: _omit, ...rest } = source;
    return rest;
  },
);
