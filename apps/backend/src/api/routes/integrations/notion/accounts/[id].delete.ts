import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Disconnect a Notion workspace: tombstone its tasks, then delete the account
// (cascading its NotionSource rows).
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const account = await prisma.notionAccount.findFirst({
    where: { id: router.id, userId: user.id },
    include: { notionSources: { select: { id: true } } },
  });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });

  const sourceIds = account.notionSources.map((s) => s.id);
  if (sourceIds.length) {
    await prisma.task.updateMany({
      where: { externalSourceId: { in: sourceIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  await prisma.notionAccount.delete({ where: { id: account.id } });
  return { ok: true };
});
