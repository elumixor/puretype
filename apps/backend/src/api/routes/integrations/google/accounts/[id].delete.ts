import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Disconnect a Google account: delete the account (which cascades its
// CalendarSource rows). Its events aren't persisted, so there's nothing to tidy
// up — they just stop appearing on the next live fetch.
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const account = await prisma.googleAccount.findFirst({ where: { id: router.id, userId: user.id } });
  if (!account) throw createError({ statusCode: 404, statusMessage: "Account not found" });

  await prisma.googleAccount.delete({ where: { id: account.id } });
  return { ok: true };
});
