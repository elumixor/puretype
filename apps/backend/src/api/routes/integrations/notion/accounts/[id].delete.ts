import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Disconnect a Notion workspace: delete the account (cascading its NotionSource
// rows). Its tasks aren't persisted, so there's nothing to tidy up — they just
// stop appearing on the next live fetch.
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const account = await prisma.notionAccount.findFirst({ where: { id: router.id, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });

  await prisma.notionAccount.delete({ where: { id: account.id } });
  return { ok: true };
});
