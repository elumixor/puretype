import { requireAuth } from "services/auth";
import { editNotionTask } from "services/integrations/sync";
import { handler } from "utils";
import { z } from "zod";

// Write an in-app edit of a Notion-sourced task straight back to its page.
// The client applies the change optimistically; this persists it to Notion.
// There is no local Task row — Notion is the source of truth.
export default handler(
  {
    body: {
      externalSourceId: z.string(),
      externalId: z.string(),
      title: z.string().optional(),
      date: z.string().nullable().optional(),
      completed: z.boolean().optional(),
    },
  },
  async ({ user, body }) => {
    requireAuth(user);
    await editNotionTask(user.id, body);
    return { ok: true };
  },
);
