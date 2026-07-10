import { createError } from "h3";
import { requireAuth } from "services/auth";
import { listViews } from "services/notion";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// The saved views of a database, so the user can pick one to mirror. The view's
// own filter/sort (configured in Notion) decides which rows sync.
export default handler({ body: { accountId: z.string(), databaseId: z.string() } }, async ({ user, body }) => {
  requireAuth(user);
  const account = await prisma.notionAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
  return { views: await listViews(account.accessToken, body.databaseId) };
});
