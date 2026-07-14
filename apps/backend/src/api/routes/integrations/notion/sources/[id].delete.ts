import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Unbind a Notion database. Its rows aren't persisted, so unbinding just drops
// the source — the tasks stop appearing on the next live fetch.
export default handler(async ({ user, router }) => {
  requireAuth(user);
  const source = await prisma.notionSource.findFirst({ where: { id: router.id, userId: user.id } });
  if (!source) throw createError({ statusCode: 404, statusMessage: "Source not found" });

  await prisma.notionSource.delete({ where: { id: source.id } });
  return { ok: true };
});
