import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Bind a Notion database to a project with its date/status mapping. Its rows
// aren't persisted — the client picks them up on its next live external fetch.
export default handler(
  {
    body: {
      accountId: z.string(),
      databaseId: z.string(),
      databaseName: z.string(),
      projectId: z.string(),
      viewId: z.string().nullable().optional(),
      datePropertyId: z.string().nullable().optional(),
      statusPropertyId: z.string().nullable().optional(),
      statusPropType: z.enum(["checkbox", "status", "select"]).nullable().optional(),
      doneValue: z.string().nullable().optional(),
    },
  },
  async ({ user, body }) => {
    requireAuth(user);
    const [account, project] = await Promise.all([
      prisma.notionAccount.findFirst({ where: { id: body.accountId, userId: user.id }, select: { id: true } }),
      prisma.project.findFirst({ where: { id: body.projectId, userId: user.id }, select: { id: true } }),
    ]);
    if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
    if (!project) throw createError({ statusCode: 404, statusMessage: "Project not found" });

    const source = await prisma.notionSource.upsert({
      where: { notionAccountId_databaseId: { notionAccountId: body.accountId, databaseId: body.databaseId } },
      create: {
        userId: user.id,
        notionAccountId: body.accountId,
        databaseId: body.databaseId,
        databaseName: body.databaseName,
        viewId: body.viewId ?? null,
        projectId: body.projectId,
        datePropertyId: body.datePropertyId ?? null,
        statusPropertyId: body.statusPropertyId ?? null,
        statusPropType: body.statusPropType ?? null,
        doneValue: body.doneValue ?? null,
      },
      update: {
        databaseName: body.databaseName,
        viewId: body.viewId ?? null,
        projectId: body.projectId,
        datePropertyId: body.datePropertyId ?? null,
        statusPropertyId: body.statusPropertyId ?? null,
        statusPropType: body.statusPropType ?? null,
        doneValue: body.doneValue ?? null,
      },
      include: { account: true },
    });

    const { account: _omit, ...rest } = source;
    return rest;
  },
);
