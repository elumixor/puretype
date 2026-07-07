import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Disconnect a Google account: tombstone every task from its calendars, then
// delete the account (which cascades its CalendarSource rows).
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const account = await prisma.googleAccount.findFirst({
    where: { id: router.id, userId: user.id },
    include: { calendarSources: { select: { id: true } } },
  });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });

  const sourceIds = account.calendarSources.map((s) => s.id);
  if (sourceIds.length) {
    await prisma.task.updateMany({
      where: { externalSourceId: { in: sourceIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  await prisma.googleAccount.delete({ where: { id: account.id } });
  return { ok: true };
});
