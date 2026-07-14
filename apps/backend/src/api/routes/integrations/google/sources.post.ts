import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Bind a calendar to a project. Its events aren't persisted — the client picks
// them up on its next live external fetch.
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

    const { account: _omit, ...rest } = source;
    return rest;
  },
);
