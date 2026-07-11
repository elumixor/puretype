import { createError } from "h3";
import { requireAuth } from "services/auth";
import { detachSourceTasks } from "services/integrations/sync";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Unbind a calendar. Keeps its imported tasks as plain local tasks, stripping
// the project pill + external linkage (no dangling "unknown" pill).
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const source = await prisma.calendarSource.findFirst({ where: { id: router.id, userId: user.id } });
  if (!source) throw createError({ statusCode: 404, statusMessage: "Source not found" });

  await detachSourceTasks(source.id, source.projectId, user.id);
  await prisma.calendarSource.delete({ where: { id: source.id } });
  return { ok: true };
});
