import { createError } from "h3";
import { requireAuth } from "services/auth";
import { searchDatabases } from "services/notion";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Databases the connected Notion integration can see (those the user shared
// with it), for mapping one to a project.
export default handler({ body: { accountId: z.string() } }, async ({ user, body }) => {
  requireAuth(user);
  const account = await prisma.notionAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
  return { databases: await searchDatabases(account.accessToken) };
});
