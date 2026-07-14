import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Adjust how far ahead a bound calendar's events are shown. null restores the
// default — today and this week only. Nothing is persisted per-event, so the
// change takes effect on the client's next live fetch: no backfill, no cleanup.
export default handler(
  { body: { horizonDays: z.number().int().min(1).max(365).nullable() } },
  async ({ user, router, body }) => {
    requireAuth(user);

    const { count } = await prisma.calendarSource.updateMany({
      where: { id: router.id, userId: user.id },
      data: { horizonDays: body.horizonDays },
    });
    if (!count) throw createError({ statusCode: 404, statusMessage: "Source not found" });

    return { ok: true };
  },
);
