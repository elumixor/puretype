import { createError } from "h3";
import { requireAuth } from "services/auth";
import { getDatabaseSchema } from "services/notion";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// The property schema of a database, so the user can pick which property maps
// to the task date and which represents "done" (with its option names).
export default handler({ body: { accountId: z.string(), databaseId: z.string() } }, async ({ user, body }) => {
  requireAuth(user);
  const account = await prisma.notionAccount.findFirst({ where: { id: body.accountId, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });
  return { properties: await getDatabaseSchema(account.accessToken, body.databaseId) };
});
